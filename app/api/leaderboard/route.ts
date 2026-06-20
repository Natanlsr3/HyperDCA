import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/analytics/engine";
import { demoBaskets } from "@/lib/baskets/demo-data";
import { isServiceDbConfigured } from "@/lib/db/client";
import type { BasketSortKey, NetworkFilter } from "@/lib/db/types";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const network = (searchParams.get("network") ?? "all") as NetworkFilter;
    const sortBy = (searchParams.get("sortBy") ?? "roi_30d") as BasketSortKey;
    const limit = Number(searchParams.get("limit") ?? 100);
    if (!isServiceDbConfigured()) {
      const leaderboard = [...demoBaskets]
        .sort((a, b) => Number(b[sortBy] ?? 0) - Number(a[sortBy] ?? 0))
        .slice(0, limit)
        .map((basket, index) => ({ rank: index + 1, ...basket }));
      return NextResponse.json({ leaderboard, lastUpdated: new Date().toISOString(), demo: true });
    }
    const leaderboard = await getLeaderboard(network, sortBy, limit);
    return NextResponse.json({ leaderboard, lastUpdated: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load leaderboard";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
