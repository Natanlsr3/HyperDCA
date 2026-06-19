import type { BasketAsset } from "@/lib/db/types";
import type { ClearinghouseStateResponse } from "@nktkas/hyperliquid/api/info";
import { createInfoClient } from "./client";

export async function getAllMids(dex = ""): Promise<Record<string, string>> {
  const info = createInfoClient();
  if (dex) {
    return info.allMids({ dex });
  }
  return info.allMids();
}

export async function getSpotBalance(wallet: string, coin = "USDC"): Promise<number> {
  const info = createInfoClient();
  const data = await info.spotClearinghouseState({ user: wallet as `0x${string}` });
  for (const b of data.balances) {
    if (b.coin === coin) return Number(b.total);
  }
  return 0;
}

export async function getPerpDexNames(): Promise<string[]> {
  const info = createInfoClient();
  const dexs = await info.perpDexs();
  const names = [""];
  for (const d of dexs) {
    if (d) names.push(d.name);
  }
  return names;
}

export async function getAllDexsClearinghouseState(
  wallet: string,
): Promise<Record<string, ClearinghouseStateResponse>> {
  const info = createInfoClient();
  const dexNames = await getPerpDexNames();
  const result: Record<string, ClearinghouseStateResponse> = {};

  await Promise.all(
    dexNames.map(async (dex) => {
      const state = await info.clearinghouseState({
        user: wallet as `0x${string}`,
        dex: dex || undefined,
      });
      result[dex] = state;
    }),
  );

  return result;
}

export async function getClearinghouseState(wallet: string, dex = "") {
  const info = createInfoClient();
  return info.clearinghouseState({ user: wallet as `0x${string}`, dex: dex || undefined });
}

export async function getUserFillsByTime(
  wallet: string,
  startTime: number,
  endTime?: number,
) {
  const info = createInfoClient();
  return info.userFillsByTime({
    user: wallet as `0x${string}`,
    startTime,
    endTime,
  });
}

export async function getUserFunding(wallet: string, startTime: number, endTime?: number) {
  const info = createInfoClient();
  return info.userFunding({ user: wallet as `0x${string}`, startTime, endTime });
}

export async function getPredictedFundings() {
  const info = createInfoClient();
  return info.predictedFundings();
}

export async function getUserDexAbstraction(wallet: string) {
  const info = createInfoClient();
  try {
    return await info.userDexAbstraction({ user: wallet as `0x${string}` });
  } catch {
    return null;
  }
}

export interface PositionSummary {
  coin: string;
  dex: string;
  szi: number;
  entryPx: number;
  positionValue: number;
  unrealizedPnl: number;
  marginUsed: number;
  liquidationPx: number | null;
}

export async function getMergedPositions(wallet: string): Promise<PositionSummary[]> {
  const all = await getAllDexsClearinghouseState(wallet);
  const positions: PositionSummary[] = [];

  for (const [dexKey, state] of Object.entries(all)) {
    const dex = dexKey === "" ? "" : dexKey;
    for (const ap of state.assetPositions ?? []) {
      const p = ap.position;
      if (!p || Number(p.szi) === 0) continue;
      positions.push({
        coin: p.coin,
        dex,
        szi: Number(p.szi),
        entryPx: Number(p.entryPx),
        positionValue: Number(p.positionValue),
        unrealizedPnl: Number(p.unrealizedPnl),
        marginUsed: Number(p.marginUsed),
        liquidationPx: p.liquidationPx ? Number(p.liquidationPx) : null,
      });
    }
  }
  return positions;
}

export interface CarryEstimate {
  coin: string;
  dex: string;
  hourlyFunding: number;
  annualizedPct: number;
}

function findFundingRate(
  predicted: Awaited<ReturnType<typeof getPredictedFundings>>,
  coin: string,
  dex: string,
): number {
  for (const [asset, exchanges] of predicted) {
    if (asset !== coin) continue;
    for (const [exchange, data] of exchanges) {
      const matchDex = dex === "" ? exchange === "" || exchange === "hyperliquid" : exchange === dex;
      if (matchDex && data?.fundingRate) return Number(data.fundingRate);
    }
  }
  return 0;
}

export async function estimateCarryForAssets(
  assets: Pick<BasketAsset, "coin" | "dex" | "weight">[],
  leverage: number,
): Promise<{ perAsset: CarryEstimate[]; basketAnnualizedPct: number }> {
  const predicted = await getPredictedFundings();
  const perAsset: CarryEstimate[] = [];

  for (const asset of assets) {
    const hourly = findFundingRate(predicted, asset.coin, asset.dex) * leverage;
    const annualized = hourly * 24 * 365 * 100;
    perAsset.push({
      coin: asset.coin,
      dex: asset.dex,
      hourlyFunding: hourly,
      annualizedPct: annualized,
    });
  }

  const totalWeight = assets.reduce((s, a) => s + Number(a.weight), 0);
  const basketAnnualizedPct = perAsset.reduce(
    (s, c, i) => s + c.annualizedPct * (Number(assets[i].weight) / totalWeight),
    0,
  );

  return { perAsset, basketAnnualizedPct };
}

export function computeLiquidationDistance(
  accountValue: number,
  totalMarginUsed: number,
  positions: PositionSummary[],
): { minDistancePct: number; worstCoin: string | null } {
  if (accountValue <= 0 || positions.length === 0) {
    return { minDistancePct: 100, worstCoin: null };
  }

  let minDistance = Infinity;
  let worstCoin: string | null = null;

  for (const p of positions) {
    if (!p.liquidationPx || p.szi === 0) continue;
    const mark = p.positionValue / Math.abs(p.szi);
    const distance = p.szi > 0
      ? (mark - p.liquidationPx) / mark
      : (p.liquidationPx - mark) / mark;
    if (distance < minDistance) {
      minDistance = distance;
      worstCoin = p.coin;
    }
  }

  const marginRatio = totalMarginUsed / accountValue;
  return {
    minDistancePct: minDistance === Infinity ? (1 - marginRatio) * 100 : minDistance * 100,
    worstCoin,
  };
}
