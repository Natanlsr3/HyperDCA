import type { BasketAsset, TradeIntent } from "@/lib/db/types";
import { getAllMids } from "@/lib/hl/read";
import { lastDcaEntryPrice } from "./simple_time";
import { dipThresholdFor } from "./thresholds";

type Fill = {
  coin: string;
  fill_px: number | null;
  executions?: { detail?: { type?: string } };
};

/**
 * Stable reference for the price-drop strategy: opportunistic dip buys
 * must NOT reset the reference.
 *   1. Prefer the last `type=="dca"` fill (the canonical DCA reference).
 *   2. Otherwise anchor to the EARLIEST recorded fill for the coin.
 * Returns null only when there are no fills at all (fresh schedule).
 */
export function dipReferencePrice(fills: Fill[], coin: string): number | null {
  const dca = lastDcaEntryPrice(fills, coin);
  if (dca !== null) return dca;
  let anchor: number | null = null;
  for (const f of fills) {
    if (f.coin === coin && f.fill_px) anchor = Number(f.fill_px);
  }
  return anchor;
}

export async function planPriceDropBuys(input: {
  assets: BasketAsset[];
  amountUsd: number;
  params: Record<string, unknown>;
  recentFills: Fill[];
}): Promise<{ intents: TradeIntent[]; skipped: string[] }> {
  const { assets, amountUsd, params, recentFills } = input;
  const totalWeight = assets.reduce((s, a) => s + Number(a.weight), 0);

  const intents: TradeIntent[] = [];
  const skipped: string[] = [];

  for (const asset of assets) {
    const threshold = dipThresholdFor(asset.coin, params);
    const marginUsd = (amountUsd * Number(asset.weight)) / totalWeight;
    const refPrice = dipReferencePrice(recentFills, asset.coin);

    // Fresh start: no reference yet — establish one with an initial entry so the
    // strategy actually fires (the old code skipped forever on a new schedule).
    if (refPrice === null) {
      intents.push({ asset, marginUsd, trigger: "FIRST" });
      continue;
    }

    const mids = await getAllMids(asset.dex);
    const current = Number(mids[asset.coin] ?? 0);
    if (current === 0) {
      skipped.push(`${asset.coin}: no price`);
      continue;
    }

    const drop = (refPrice - current) / refPrice;
    if (drop >= threshold) {
      intents.push({ asset, marginUsd, trigger: "PRICE_DROP", refPrice, dropPct: drop });
    } else {
      skipped.push(`${asset.coin}: drop ${(drop * 100).toFixed(1)}% < ${(threshold * 100).toFixed(0)}%`);
    }
  }

  return { intents, skipped };
}
