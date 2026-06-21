import { NextResponse } from "next/server";
import { getBasketHistorySeries, getBasketMetrics } from "@/lib/market/candles";

/**
 * GET /api/market/history?basketId=xxx&period=1m
 *
 * Returns real weighted basket performance series + metrics
 * from Hyperliquid candle data.
 *
 * Also accepts basket assets via query params if no DB lookup needed:
 *   ?assets=BTC:0.4,ETH:0.25,SOL:0.2,HYPE:0.15&period=1m
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const basketId = searchParams.get("basketId");
  const period = searchParams.get("period") ?? "1m";
  const assetsParam = searchParams.get("assets");

  try {
    let assets: { coin: string; weight: number }[];

    if (assetsParam) {
      // Direct asset spec: "BTC:0.4,ETH:0.25,xyz:NVDA:0.18"
      assets = assetsParam.split(",").map((entry) => {
        const lastColon = entry.lastIndexOf(":");
        const coin = entry.slice(0, lastColon);
        const weight = Number(entry.slice(lastColon + 1));
        return { coin, weight };
      });
    } else if (basketId) {
      // Look up from DB
      const { isServiceDbConfigured, createServiceClient } = await import("@/lib/db/client");
      if (!isServiceDbConfigured()) {
        return NextResponse.json({ error: "Database not configured" }, { status: 503 });
      }
      const supa = createServiceClient();
      const { data, error } = await supa
        .from("basket_assets")
        .select("coin, weight")
        .eq("basket_id", basketId);
      if (error) throw error;
      if (!data?.length) {
        return NextResponse.json({ error: "Basket not found" }, { status: 404 });
      }
      assets = data.map((a) => ({ coin: a.coin, weight: Number(a.weight) }));
    } else {
      return NextResponse.json({ error: "basketId or assets required" }, { status: 400 });
    }

    const [series, metrics] = await Promise.all([
      getBasketHistorySeries(assets, period),
      getBasketMetrics(assets),
    ]);

    return NextResponse.json({
      series,
      metrics: {
        roi_1d: metrics.roi_1d,
        roi_7d: metrics.roi_7d,
        roi_30d: metrics.roi_30d,
      },
      assetSnapshots: metrics.assetSnapshots,
    });
  } catch (e) {
    console.error("[MARKET HISTORY]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to fetch market data" }, { status: 500 });
  }
}
