import type { BasketAsset, TradeIntent } from "@/lib/db/types";
import { CYCLE_DURATION_MS, DEADLINE_OFFSET_MS } from "@/lib/hl/config";
import { getAllMids } from "@/lib/hl/read";

export function lastDcaEntryPrice(
  fills: { coin: string; fill_px: number | null; executions?: { detail?: { type?: string } } }[],
  coin: string,
): number | null {
  for (const f of fills) {
    const execType = f.executions?.detail?.type;
    if (execType && execType !== "dca") continue;
    if (f.coin === coin && f.fill_px) return Number(f.fill_px);
  }
  return null;
}

export function currentCycleStart(anchor: Date, now: Date): Date {
  if (now < anchor) return anchor;
  const elapsed = Math.floor((now.getTime() - anchor.getTime()) / CYCLE_DURATION_MS);
  return new Date(anchor.getTime() + elapsed * CYCLE_DURATION_MS);
}

export function cycleDeadline(cycleStart: Date): Date {
  return new Date(cycleStart.getTime() + DEADLINE_OFFSET_MS);
}

export function cycleEnds(cycleStart: Date): Date {
  return new Date(cycleStart.getTime() + CYCLE_DURATION_MS);
}

export function selectCycle(
  anchor: Date,
  now: Date,
  assets: BasketAsset[],
  alreadyBought: (coin: string, cycleStart: Date) => boolean,
  deadlineAttempted: (cycleStart: Date) => boolean,
): { cycleStart: Date; isDeadline: boolean; isCatchUp: boolean } {
  const cycleStart = currentCycleStart(anchor, now);

  if (cycleStart > anchor) {
    const previous = new Date(cycleStart.getTime() - CYCLE_DURATION_MS);
    const pending = assets.some((a) => !alreadyBought(a.coin, previous));
    if (now >= cycleEnds(previous) && pending && !deadlineAttempted(previous)) {
      return { cycleStart: previous, isDeadline: true, isCatchUp: true };
    }
  }

  return { cycleStart, isDeadline: now >= cycleDeadline(cycleStart), isCatchUp: false };
}

export async function planSimpleTimeBuys(input: {
  assets: BasketAsset[];
  amountUsd: number;
  params: Record<string, unknown>;
  sessionStartedAt: Date;
  now: Date;
  alreadyBoughtThisCycle: (coin: string, cycleStart: Date) => boolean;
  deadlineAttempted: (cycleStart: Date) => boolean;
  recentFills: { coin: string; fill_px: number | null; executions?: { detail?: { type?: string } } }[];
}): Promise<{ intents: TradeIntent[]; cycleStart: Date; skipped: string[] }> {
  const { assets, amountUsd, params, sessionStartedAt, now } = input;
  const slippage = Number(params.slippage ?? 0.01);
  const totalWeight = assets.reduce((s, a) => s + Number(a.weight), 0);

  const { cycleStart, isDeadline } = selectCycle(
    sessionStartedAt,
    now,
    assets,
    input.alreadyBoughtThisCycle,
    input.deadlineAttempted,
  );

  const intents: TradeIntent[] = [];
  const skipped: string[] = [];

  for (const asset of assets) {
    if (input.alreadyBoughtThisCycle(asset.coin, cycleStart)) {
      skipped.push(asset.coin);
      continue;
    }

    const marginUsd = (amountUsd * Number(asset.weight)) / totalWeight;
    const intradayDrop = Number(
      params.intraday_drop ?? params[`intraday_drop_${asset.coin}`] ?? 0.03,
    );

    if (isDeadline) {
      intents.push({ asset, marginUsd, trigger: "DEADLINE" });
      continue;
    }

    const refPrice = lastDcaEntryPrice(input.recentFills, asset.coin);
    if (refPrice === null) {
      intents.push({ asset, marginUsd, trigger: "FIRST" });
      continue;
    }

    const mids = await getAllMids(asset.dex);
    const current = Number(mids[asset.coin] ?? 0);
    if (current === 0) continue;

    const drop = (refPrice - current) / refPrice;
    if (drop >= intradayDrop) {
      intents.push({ asset, marginUsd, trigger: "DIP_TARGET", refPrice, dropPct: drop });
    }
  }

  void slippage;
  return { intents, cycleStart, skipped };
}

export function planWeightedMargins(
  assets: BasketAsset[],
  amountUsd: number,
): { asset: BasketAsset; marginUsd: number }[] {
  const totalWeight = assets.reduce((s, a) => s + Number(a.weight), 0);
  return assets.map((asset) => ({
    asset,
    marginUsd: (amountUsd * Number(asset.weight)) / totalWeight,
  }));
}
