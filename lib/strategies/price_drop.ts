import type { BasketAsset, TradeIntent } from "@/lib/db/types";
import { getAllMids } from "@/lib/hl/read";

export function lastAnyEntryPrice(
  fills: { coin: string; fill_px: number | null }[],
  coin: string,
): number | null {
  for (const f of fills) {
    if (f.coin === coin && f.fill_px) return Number(f.fill_px);
  }
  return null;
}

export async function planPriceDropBuys(input: {
  assets: BasketAsset[];
  amountUsd: number;
  params: Record<string, unknown>;
  recentFills: { coin: string; fill_px: number | null }[];
}): Promise<{ intents: TradeIntent[]; skipped: string[] }> {
  const { assets, amountUsd, params, recentFills } = input;
  const totalWeight = assets.reduce((s, a) => s + Number(a.weight), 0);
  const defaultThreshold = Number(params.dip_threshold ?? 0.1);

  const intents: TradeIntent[] = [];
  const skipped: string[] = [];

  for (const asset of assets) {
    const threshold = Number(
      params.dip_threshold ?? params[`dip_threshold_${asset.coin}`] ?? defaultThreshold,
    );
    const refPrice = lastAnyEntryPrice(recentFills, asset.coin);
    if (refPrice === null) {
      skipped.push(`${asset.coin}: no previous entry`);
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
      const marginUsd = (amountUsd * Number(asset.weight)) / totalWeight;
      intents.push({
        asset,
        marginUsd,
        trigger: "PRICE_DROP",
        refPrice,
        dropPct: drop,
      });
    } else {
      skipped.push(`${asset.coin}: drop ${(drop * 100).toFixed(1)}% < ${(threshold * 100).toFixed(0)}%`);
    }
  }

  return { intents, skipped };
}
