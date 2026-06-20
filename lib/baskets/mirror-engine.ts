import { privateKeyToAccount } from "viem/accounts";
import { decryptPrivateKey } from "@/lib/crypto/envelope";
import { createServiceClient } from "@/lib/db/client";
import type {
  BasketAsset,
  CompositionItem,
  MirrorTradeOrder,
  TradeResult,
} from "@/lib/db/types";
import { executeTradeForAsset, closePositionForAsset, makeCloid } from "@/lib/hl/order";
import { getAllMids, getMergedPositions, type PositionSummary } from "@/lib/hl/read";
import { getBasketDetail } from "./manager";
import { sendMirrorExecutedNotification } from "@/lib/notifications/telegram";
import { refreshBasketAnalytics } from "@/lib/analytics/engine";

function parseBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") {
    if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
    return Buffer.from(value, "base64");
  }
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new Error("Invalid encrypted_private_key format");
}

function normalizeDex(dex: string | null | undefined) {
  return dex ?? "";
}

function positionKey(coin: string, dex: string) {
  return `${normalizeDex(dex)}:${coin}`;
}

function compositionFromAssets(assets: BasketAsset[]): CompositionItem[] {
  return assets.map((asset) => ({
    coin: asset.coin,
    dex: asset.dex,
    weight: Number(asset.weight),
    sz_decimals: asset.sz_decimals,
    collateral: asset.collateral,
    swap_pair: asset.swap_pair,
    is_cross: asset.is_cross,
  }));
}

async function estimateSize(asset: BasketAsset, notionalUsd: number) {
  const mids = await getAllMids(asset.dex);
  const price = Number(mids[asset.coin] ?? 0);
  if (!price) return undefined;
  const factor = 10 ** asset.sz_decimals;
  return Math.floor((notionalUsd / price) * factor) / factor;
}

export async function getMirrorPlan(
  userId: string,
  basketId: string,
  options?: { allocationUsd?: number; minNotionalUsd?: number },
) {
  const supa = createServiceClient();
  const [{ data: user, error: userErr }, basket] = await Promise.all([
    supa.from("users").select("main_wallet").eq("id", userId).single(),
    getBasketDetail(basketId),
  ]);
  if (userErr) throw userErr;
  if (!basket) throw new Error("Basket not found");
  if (!user.main_wallet) throw new Error("Wallet not linked");

  const currentPositions = await getMergedPositions(user.main_wallet);
  const assets = basket.basket_assets;
  const targetKeys = new Set(assets.map((asset) => positionKey(asset.coin, asset.dex)));
  const currentBasketValue = currentPositions
    .filter((position) => targetKeys.has(positionKey(position.coin, position.dex)))
    .reduce((sum, position) => sum + Math.abs(position.positionValue), 0);
  const allocationUsd = options?.allocationUsd ?? currentBasketValue;
  const minNotionalUsd = options?.minNotionalUsd ?? 10;

  const currentByKey = new Map(
    currentPositions.map((position) => [positionKey(position.coin, position.dex), position]),
  );

  const trades: MirrorTradeOrder[] = [];
  for (const asset of assets) {
    const key = positionKey(asset.coin, asset.dex);
    const position = currentByKey.get(key);
    const currentValue = Math.abs(position?.positionValue ?? 0);
    const currentWeight = allocationUsd > 0 ? currentValue / allocationUsd : 0;
    const targetWeight = Number(asset.weight);
    const deltaWeight = targetWeight - currentWeight;
    const notionalUsd = Math.abs(deltaWeight * allocationUsd);
    if (allocationUsd <= 0 || notionalUsd < minNotionalUsd) continue;
    trades.push({
      asset,
      action: deltaWeight >= 0 ? "BUY" : "SELL",
      currentWeight,
      targetWeight,
      deltaWeight,
      notionalUsd,
      estimatedSize: await estimateSize(asset, notionalUsd),
    });
  }

  return {
    basket,
    currentPositions,
    targetComposition: compositionFromAssets(assets),
    allocationUsd,
    trades,
  };
}

async function getExecutionKey(userId: string) {
  const supa = createServiceClient();
  const { data, error } = await supa
    .from("agent_keys")
    .select("encrypted_private_key,approved")
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  if (!data.approved) throw new Error("Agent key is not approved");
  const privateKey = decryptPrivateKey(parseBuffer(data.encrypted_private_key));
  return privateKeyToAccount(privateKey as `0x${string}`);
}

export async function executeMirrorTrades(
  userId: string,
  basketId: string,
  options?: {
    allocationUsd?: number;
    leverage?: number;
    slippage?: number;
    execute?: boolean;
  },
) {
  const plan = await getMirrorPlan(userId, basketId, { allocationUsd: options?.allocationUsd });
  const supa = createServiceClient();
  const canExecute = options?.execute === true && process.env.HYPERDCA_ENABLE_MIRROR_EXECUTION === "true";
  const tradesExecuted: TradeResult[] = [];

  if (canExecute && plan.trades.length > 0) {
    const agentKey = await getExecutionKey(userId);
    const { data: user, error } = await supa.from("users").select("main_wallet").eq("id", userId).single();
    if (error) throw error;
    for (const trade of plan.trades) {
      const cloid = makeCloid("mir", basketId, trade.asset.coin);
      if (trade.action === "BUY") {
        tradesExecuted.push(
          await executeTradeForAsset(
            agentKey,
            user.main_wallet,
            trade.asset,
            trade.notionalUsd,
            options?.leverage ?? 1,
            options?.slippage,
            cloid,
          ),
        );
      } else if (trade.estimatedSize && trade.estimatedSize > 0) {
        tradesExecuted.push(
          await closePositionForAsset(agentKey, trade.asset, trade.estimatedSize, options?.slippage, cloid),
        );
      }
    }
  } else {
    tradesExecuted.push(
      ...plan.trades.map((trade) => ({
        coin: trade.asset.coin,
        status: "skipped" as const,
        notional: trade.notionalUsd,
        error: canExecute ? "no trade needed" : "dry run; pass execute=true and enable env flag",
      })),
    );
  }

  const success = tradesExecuted.every((trade) => trade.status === "filled" || trade.status === "skipped");
  const { data: execution, error: insertErr } = await supa
    .from("mirror_executions")
    .insert({
      user_id: userId,
      basket_id: basketId,
      old_composition: positionsToComposition(plan.currentPositions),
      new_composition: plan.targetComposition,
      trades_executed: tradesExecuted,
      total_slippage: options?.slippage ?? null,
      success,
      error_message: success ? null : tradesExecuted.find((trade) => trade.error)?.error ?? "mirror failed",
    })
    .select("*")
    .single();
  if (insertErr) throw insertErr;

  await supa
    .from("basket_followers")
    .update({
      mirror_count: 1,
      trades_mirrored: tradesExecuted.length,
    })
    .eq("user_id", userId)
    .eq("basket_id", basketId);
  await refreshBasketAnalytics(basketId);
  await sendMirrorExecutedNotification(userId, execution);

  return { plan, execution, trades: tradesExecuted, success };
}

function positionsToComposition(positions: PositionSummary[]): CompositionItem[] {
  const total = positions.reduce((sum, position) => sum + Math.abs(position.positionValue), 0);
  if (!total) return [];
  return positions.map((position) => ({
    coin: position.coin,
    dex: position.dex,
    weight: Math.abs(position.positionValue) / total,
  }));
}

export async function closePositionInBasket(userId: string, basketId: string, execute = false) {
  const plan = await getMirrorPlan(userId, basketId);
  const basketKeys = new Set(plan.basket.basket_assets.map((asset) => positionKey(asset.coin, asset.dex)));
  const positions = plan.currentPositions.filter((position) =>
    basketKeys.has(positionKey(position.coin, position.dex)),
  );
  if (!execute || process.env.HYPERDCA_ENABLE_MIRROR_EXECUTION !== "true") {
    return {
      success: true,
      closed_assets: positions.map((position) => position.coin),
      dryRun: true,
    };
  }

  const agentKey = await getExecutionKey(userId);
  const assetsByKey = new Map(
    plan.basket.basket_assets.map((asset) => [positionKey(asset.coin, asset.dex), asset]),
  );
  const results: TradeResult[] = [];
  for (const position of positions) {
    const asset = assetsByKey.get(positionKey(position.coin, position.dex));
    if (!asset) continue;
    results.push(await closePositionForAsset(agentKey, asset, Math.abs(position.szi)));
  }
  return {
    success: results.every((result) => result.status === "filled"),
    closed_assets: results.map((result) => result.coin),
    results,
  };
}
