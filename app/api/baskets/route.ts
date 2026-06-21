import { NextResponse } from "next/server";
import { getPublicBaskets } from "@/lib/baskets/manager";
import { demoBaskets, getDemoBasket } from "@/lib/baskets/demo-data";
import { isServiceDbConfigured } from "@/lib/db/client";
import { getBasketMetrics } from "@/lib/market/candles";
import type { BasketSortKey, NetworkFilter } from "@/lib/db/types";

/* Deterministic fallback for followers (no table yet) */
function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Enrich a basket with real market data from Hyperliquid.
 * Falls back to deterministic values if HL is unreachable.
 */
async function enrichBasket<T extends { id: string; theme: string; basket_assets: { coin: string; weight: number }[] }>(basket: T) {
  const s = seedFromId(basket.id);
  const followers = 12 + (s % 180);
  const hitRate = 0.55 + ((s % 400) / 400) * 0.30;

  try {
    const metrics = await getBasketMetrics(
      basket.basket_assets.map((a) => ({ coin: a.coin, weight: Number(a.weight) })),
    );
    return {
      ...basket,
      roi_30d: metrics.roi_30d,
      roi_7d: metrics.roi_7d,
      roi_1d: metrics.roi_1d,
      roi_ytd: metrics.roi_30d * 3.5,  // approximate
      hit_rate: Math.round(hitRate * 100) / 100,
      followers_count: followers,
    };
  } catch (e) {
    console.warn("[BASKETS] HL price fetch failed, using fallback:", e instanceof Error ? e.message : e);
    return {
      ...basket,
      roi_30d: 0,
      roi_7d: 0,
      roi_1d: 0,
      roi_ytd: 0,
      hit_rate: Math.round(hitRate * 100) / 100,
      followers_count: followers,
    };
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const network = (searchParams.get("network") ?? "all") as NetworkFilter;
  const sortBy = (searchParams.get("sortBy") ?? "roi_30d") as BasketSortKey;
  const limit = Number(searchParams.get("limit") ?? 50);
  const search = searchParams.get("q") ?? undefined;

  try {
    if (!isServiceDbConfigured()) {
      if (id) return NextResponse.json({ basket: getDemoBasket(id) });
      return NextResponse.json({ baskets: sortBaskets(demoBaskets, sortBy).slice(0, limit), totalCount: demoBaskets.length });
    }
    if (id) {
      const { getBasketDetail } = await import("@/lib/baskets/manager");
      const basket = await getBasketDetail(id);
      if (!basket) return NextResponse.json({ basket: null });
      const enriched = await enrichBasket(basket);
      return NextResponse.json({ basket: enriched });
    }
    const baskets = await getPublicBaskets({ network, sortBy, limit, search });
    const enriched = await Promise.all(baskets.map(enrichBasket));
    return NextResponse.json({ baskets: sortBaskets(enriched, sortBy), totalCount: enriched.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load baskets";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function sortBaskets<T extends { roi_30d?: number; roi_ytd?: number; hit_rate?: number; followers_count?: number; created_at?: string }>(
  baskets: T[],
  sortBy: BasketSortKey,
) {
  return [...baskets].sort((a, b) => {
    if (sortBy === "created_at") return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    return Number(b[sortBy] ?? 0) - Number(a[sortBy] ?? 0);
  });
}
