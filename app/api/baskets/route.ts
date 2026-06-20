import { NextResponse } from "next/server";
import { getPublicBaskets } from "@/lib/baskets/manager";
import { demoBaskets, getDemoBasket } from "@/lib/baskets/demo-data";
import { isServiceDbConfigured } from "@/lib/db/client";
import type { BasketSortKey, NetworkFilter } from "@/lib/db/types";

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
      return NextResponse.json({ basket });
    }
    const baskets = await getPublicBaskets({ network, sortBy, limit, search });
    return NextResponse.json({ baskets, totalCount: baskets.length });
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
