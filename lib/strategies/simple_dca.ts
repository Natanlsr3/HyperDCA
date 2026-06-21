import type { BasketAsset, TradeIntent } from "@/lib/db/types";
import { cycleDurationMs } from "@/lib/hl/config";
import { currentCycleStart, planWeightedMargins } from "./simple_time";

/**
 * Plain "Simple DCA": buy the weighted basket once per interval, ignoring price.
 * This is the option a non-crypto user expects — no dip/timing logic. Cycle
 * dedupe (alreadyBoughtThisCycle) prevents double-buying within the same cycle.
 */
export function planSimpleDcaBuys(input: {
  assets: BasketAsset[];
  amountUsd: number;
  intervalSeconds: number;
  sessionStartedAt: Date;
  now: Date;
  alreadyBoughtThisCycle: (coin: string, cycleStart: Date) => boolean;
}): { intents: TradeIntent[]; cycleStart: Date; skipped: string[] } {
  const { assets, amountUsd, intervalSeconds, sessionStartedAt, now } = input;
  const cycleStart = currentCycleStart(sessionStartedAt, now, cycleDurationMs(intervalSeconds));

  const intents: TradeIntent[] = [];
  const skipped: string[] = [];

  for (const { asset, marginUsd } of planWeightedMargins(assets, amountUsd)) {
    if (input.alreadyBoughtThisCycle(asset.coin, cycleStart)) {
      skipped.push(asset.coin);
      continue;
    }
    intents.push({ asset, marginUsd, trigger: "SIMPLE" });
  }

  return { intents, cycleStart, skipped };
}
