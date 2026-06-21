import { createHash, randomBytes } from "node:crypto";
import type { ExchangeClient } from "@nktkas/hyperliquid";
import { formatPrice, formatSize } from "@nktkas/hyperliquid/utils";
import type { PrivateKeyAccount } from "viem/accounts";
import type { BasketAsset } from "@/lib/db/types";
import { createExchangeClient, createSymbolConverter, uniqueDexNames } from "./client";
import { getAllMids } from "./read";
import { getBuilderAddress, getBuilderFeeTenthsBps, getDefaultSlippage } from "./config";

export interface ExecuteTradeParams {
  coin: string;
  dex: string;
  szDecimals: number;
  isCross: boolean;
  marginUsd: number;
  leverage: number;
  slippage?: number;
  cloid?: string;
}

export interface ExecuteTradeResult {
  coin: string;
  status: "filled" | "error";
  size?: string;
  price?: string;
  notional?: number;
  error?: string;
}

/** Floor size to sz_decimals — verbatim from dca_bot.py:81-84 */
export function computeOrderSize(
  marginUsd: number,
  leverage: number,
  price: number,
  szDecimals: number,
): number {
  const notional = marginUsd * leverage;
  const factor = 10 ** szDecimals;
  return Math.floor((notional / price) * factor) / factor;
}

/**
 * Resolve a spot swap pair (e.g. "@230" or "BASE/QUOTE") to its HL asset id.
 * Spot asset id = 10000 + spot market index (HL convention; "@230" => 10230).
 * Tries the SymbolConverter (BASE/QUOTE form) first, then the "@<index>" form.
 */
export function resolveSpotAssetId(
  converter: Awaited<ReturnType<typeof createSymbolConverter>>,
  swapPair: string,
): number | undefined {
  const direct = converter.getAssetId(swapPair);
  if (direct !== undefined) return direct;
  const m = /^@(\d+)$/.exec(swapPair.trim());
  if (m) return 10000 + Number(m[1]);
  return undefined;
}

export async function swapUsdcToUsdh(
  exchange: ExchangeClient,
  converter: Awaited<ReturnType<typeof createSymbolConverter>>,
  swapPair: string,
  amount: number,
): Promise<{ status: "filled" | "error"; size?: string; price?: string; error?: string }> {
  const assetId = resolveSpotAssetId(converter, swapPair);
  if (assetId === undefined) {
    return { status: "error", error: `cannot resolve swap pair ${swapPair}` };
  }
  const sz = Math.round(Math.max(amount + 1, 11) * 100) / 100;
  const result = await exchange.order({
    orders: [
      {
        a: assetId,
        b: true,
        p: "1.02",
        s: String(sz),
        r: false,
        t: { limit: { tif: "Ioc" } },
      },
    ],
    grouping: "na",
  });

  return parseOrderResponse(result, swapPair);
}

function parseOrderResponse(
  result: Awaited<ReturnType<ExchangeClient["order"]>>,
  coin: string,
): ExecuteTradeResult {
  if (result.status !== "ok") {
    return { coin, status: "error", error: `order status: ${result.status}` };
  }
  for (const s of result.response.data.statuses) {
    if (typeof s === "string") continue;
    if ("filled" in s && s.filled) {
      const f = s.filled;
      return {
        coin,
        status: "filled",
        size: f.totalSz,
        price: f.avgPx,
        notional: Math.round(Number(f.totalSz) * Number(f.avgPx) * 100) / 100,
      };
    }
    if ("error" in s && s.error) {
      return { coin, status: "error", error: String(s.error) };
    }
  }
  return { coin, status: "error", error: "no fill in response" };
}

export async function executeTrade(
  exchange: ExchangeClient,
  converter: Awaited<ReturnType<typeof createSymbolConverter>>,
  params: ExecuteTradeParams,
): Promise<ExecuteTradeResult> {
  const { coin, dex, szDecimals, isCross, marginUsd, leverage } = params;
  const slippage = params.slippage ?? getDefaultSlippage();

  const mids = await getAllMids(dex);
  const price = Number(mids[coin] ?? 0);
  if (price === 0) {
    return { coin, status: "error", error: `no price found for ${coin}` };
  }

  const size = computeOrderSize(marginUsd, leverage, price, szDecimals);
  if (size <= 0) {
    return { coin, status: "error", error: "size too small" };
  }

  const assetId = converter.getAssetId(coin);
  if (assetId === undefined) {
    return { coin, status: "error", error: `unknown asset ${coin}` };
  }

  const levResult = await exchange.updateLeverage({
    asset: assetId,
    isCross,
    leverage,
  });
  if (levResult.status !== "ok") {
    await exchange.updateLeverage({ asset: assetId, isCross: !isCross, leverage });
  }

  const aggressivePx = price * (1 + slippage);
  const builder = getBuilderAddress();
  const fee = getBuilderFeeTenthsBps();

  const result = await exchange.order({
    orders: [
      {
        a: assetId,
        b: true,
        p: formatPrice(aggressivePx, szDecimals),
        s: formatSize(size, szDecimals),
        r: false,
        t: { limit: { tif: "Ioc" } },
        c: params.cloid,
      },
    ],
    grouping: "na",
    builder: { b: builder, f: fee },
  });

  return parseOrderResponse(result, coin);
}

export async function executeTradeForAsset(
  agentKey: PrivateKeyAccount,
  mainWallet: string,
  asset: BasketAsset,
  marginUsd: number,
  leverage: number,
  slippage?: number,
  cloid?: string,
): Promise<ExecuteTradeResult> {
  void mainWallet;
  const dexNames = uniqueDexNames([asset]);
  const converter = await createSymbolConverter(dexNames.filter((d) => d));
  const exchange = createExchangeClient(agentKey, dexNames);

  if (asset.collateral === "USDH" && asset.swap_pair) {
    const swap = await swapUsdcToUsdh(exchange, converter, asset.swap_pair, marginUsd);
    if (swap.status !== "filled") {
      return { coin: asset.coin, status: "error", error: `USDH swap failed: ${swap.error}` };
    }
  }

  return executeTrade(exchange, converter, {
    coin: asset.coin,
    dex: asset.dex,
    szDecimals: asset.sz_decimals,
    isCross: asset.is_cross,
    marginUsd,
    leverage,
    slippage,
    cloid,
  });
}

export async function closePositionForAsset(
  agentKey: PrivateKeyAccount,
  asset: BasketAsset,
  size: number,
  slippage = 0.02,
  cloid?: string,
): Promise<ExecuteTradeResult> {
  const dexNames = uniqueDexNames([asset]);
  const converter = await createSymbolConverter(dexNames.filter((d) => d));
  const exchange = createExchangeClient(agentKey, dexNames);

  const mids = await getAllMids(asset.dex);
  const price = Number(mids[asset.coin] ?? 0);
  if (price === 0) {
    return { coin: asset.coin, status: "error", error: "no price for close" };
  }

  const assetId = converter.getAssetId(asset.coin);
  if (assetId === undefined) {
    return { coin: asset.coin, status: "error", error: `unknown asset ${asset.coin}` };
  }

  const aggressivePx = price * (1 - slippage);
  const builder = getBuilderAddress();
  const fee = getBuilderFeeTenthsBps();

  const result = await exchange.order({
    orders: [
      {
        a: assetId,
        b: false,
        p: formatPrice(aggressivePx, asset.sz_decimals),
        s: formatSize(size, asset.sz_decimals),
        r: true,
        t: { limit: { tif: "Ioc" } },
        c: cloid,
      },
    ],
    grouping: "na",
    builder: { b: builder, f: fee },
  });

  return parseOrderResponse(result, asset.coin);
}

/**
 * Build a unique HL client order id (16 bytes / 32 hex + "0x").
 */
export function makeCloid(prefix: string, scheduleId: string, coin: string): string {
  const seed = `${prefix}:${scheduleId}:${coin}:${Date.now()}:${randomBytes(8).toString("hex")}`;
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `0x${hex}`;
}
