import { NextResponse } from "next/server";
import { fetchNormalizedAssets } from "@/lib/hl/assets";

export const runtime = "nodejs";

export async function GET() {
  try {
    const assets = await fetchNormalizedAssets();
    return NextResponse.json({ assets, totalCount: assets.length, source: "hyperliquid" });
  } catch (error) {
    return NextResponse.json(
      { assets: [], totalCount: 0, error: error instanceof Error ? error.message : "Failed to fetch assets" },
      { status: 502 },
    );
  }
}
