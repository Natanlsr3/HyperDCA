/**
 * Real market data from Hyperliquid candleSnapshot API.
 * Fetches candles for individual assets, then computes weighted basket series.
 * Includes in-memory cache (5 min TTL) to respect rate limits.
 */

import { createInfoClient } from "@/lib/hl/client";

/* ── Types ─────────────────────────────────────────────────────── */

export interface Candle {
  t: number;   // open timestamp (ms)
  o: number;   // open price
  h: number;   // high
  l: number;   // low
  c: number;   // close price
  v: number;   // volume
}

export interface AssetSnapshot {
  coin: string;         // display name (e.g. "NVDA")
  hlSymbol: string;     // HL symbol (e.g. "xyz:NVDA")
  price: number;        // current price
  price24hAgo: number;  // price 24h ago
  price7dAgo: number;   // price 7d ago
  price30dAgo: number;  // price 30d ago
  change24h: number;    // % change 24h
  change7d: number;     // % change 7d
  change30d: number;    // % change 30d
  high30d: number;
  low30d: number;
}

export interface BasketMetrics {
  roi_1d: number;
  roi_7d: number;
  roi_30d: number;
  weightedChange24h: number;
  assetSnapshots: AssetSnapshot[];
}

export type HlInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface HistoryPoint {
  label: string;
  value: number;
}

/* ── Cache ──────────────────────────────────────────────────────── */

const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && entry.expires > now) return Promise.resolve(entry.data as T);
  return fn().then((data) => {
    cache.set(key, { data, expires: now + CACHE_TTL });
    return data;
  });
}

/* ── Core: fetch candles from Hyperliquid ──────────────────────── */

export async function fetchCandles(
  coin: string,
  interval: HlInterval,
  startTime: number,
  endTime?: number,
): Promise<Candle[]> {
  const key = `candles:${coin}:${interval}:${startTime}:${endTime ?? "now"}`;
  return cached(key, async () => {
    const info = createInfoClient();
    const raw = await info.candleSnapshot({
      coin,
      interval,
      startTime,
      endTime,
    });
    return raw.map((c: Record<string, unknown>) => ({
      t: Number(c.t),
      o: Number(c.o),
      h: Number(c.h),
      l: Number(c.l),
      c: Number(c.c),
      v: Number(c.v),
    }));
  });
}

/* ── Asset snapshot (current + historical prices) ─────────────── */

export async function getAssetSnapshot(hlSymbol: string): Promise<AssetSnapshot | null> {
  const key = `snapshot:${hlSymbol}`;
  return cached(key, async () => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    let candles: Candle[];
    try {
      candles = await fetchCandles(hlSymbol, "1h", thirtyDaysAgo);
    } catch {
      return null;
    }

    if (candles.length < 2) return null;

    const current = candles[candles.length - 1].c;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const findClosest = (target: number) => {
      let best = candles[0];
      let bestDiff = Math.abs(best.t - target);
      for (const c of candles) {
        const diff = Math.abs(c.t - target);
        if (diff < bestDiff) { best = c; bestDiff = diff; }
      }
      return best.c;
    };

    const price24h = findClosest(oneDayAgo);
    const price7d = findClosest(sevenDaysAgo);
    const price30d = candles[0].c; // earliest candle

    let high30d = -Infinity;
    let low30d = Infinity;
    for (const c of candles) {
      if (c.h > high30d) high30d = c.h;
      if (c.l < low30d) low30d = c.l;
    }

    const idx = hlSymbol.indexOf(":");
    const displayCoin = idx >= 0 ? hlSymbol.slice(idx + 1) : hlSymbol;

    return {
      coin: displayCoin,
      hlSymbol,
      price: current,
      price24hAgo: price24h,
      price7dAgo: price7d,
      price30dAgo: price30d,
      change24h: price24h ? (current - price24h) / price24h : 0,
      change7d: price7d ? (current - price7d) / price7d : 0,
      change30d: price30d ? (current - price30d) / price30d : 0,
      high30d,
      low30d,
    };
  });
}

/* ── Basket metrics (weighted ROI from real prices) ───────────── */

interface BasketAssetInput {
  coin: string;   // HL symbol (e.g. "xyz:NVDA" or "BTC")
  weight: number; // 0-1
}

export async function getBasketMetrics(assets: BasketAssetInput[]): Promise<BasketMetrics> {
  const snapshots = await Promise.all(
    assets.map((a) => getAssetSnapshot(a.coin)),
  );

  const assetSnapshots: AssetSnapshot[] = [];
  let weightedChange24h = 0;
  let weightedChange7d = 0;
  let weightedChange30d = 0;
  let totalWeight = 0;

  for (let i = 0; i < assets.length; i++) {
    const snap = snapshots[i];
    if (!snap) continue;
    assetSnapshots.push(snap);
    const w = assets[i].weight;
    totalWeight += w;
    weightedChange24h += snap.change24h * w;
    weightedChange7d += snap.change7d * w;
    weightedChange30d += snap.change30d * w;
  }

  if (totalWeight > 0 && totalWeight !== 1) {
    weightedChange24h /= totalWeight;
    weightedChange7d /= totalWeight;
    weightedChange30d /= totalWeight;
  }

  return {
    roi_1d: Math.round(weightedChange24h * 10000) / 10000,
    roi_7d: Math.round(weightedChange7d * 10000) / 10000,
    roi_30d: Math.round(weightedChange30d * 10000) / 10000,
    weightedChange24h,
    assetSnapshots,
  };
}

/* ── Basket history series (weighted from real candles) ────────── */

const PERIOD_CONFIG: Record<string, { interval: HlInterval; daysBack: number; labelFn: (c: Candle, i: number, total: number) => string }> = {
  "1d": {
    interval: "1h",
    daysBack: 1,
    labelFn: (c) => new Date(c.t).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: false }),
  },
  "7d": {
    interval: "4h",
    daysBack: 7,
    labelFn: (c) => new Date(c.t).toLocaleDateString("en", { weekday: "short" }),
  },
  "1m": {
    interval: "1d",
    daysBack: 30,
    labelFn: (_, i, total) => `D${i - total + 1}`,
  },
  "1y": {
    interval: "1d",
    daysBack: 365,
    labelFn: (c) => new Date(c.t).toLocaleDateString("en", { month: "short" }),
  },
};

export async function getBasketHistorySeries(
  assets: BasketAssetInput[],
  period: string,
): Promise<HistoryPoint[]> {
  const config = PERIOD_CONFIG[period] ?? PERIOD_CONFIG["1m"];
  const now = Date.now();
  const startTime = now - config.daysBack * 24 * 60 * 60 * 1000;

  // Fetch candles for all assets in parallel
  const allCandles = await Promise.all(
    assets.map((a) =>
      fetchCandles(a.coin, config.interval, startTime).catch(() => [] as Candle[]),
    ),
  );

  // Find the longest candle array as time reference
  let refIndex = 0;
  for (let i = 1; i < allCandles.length; i++) {
    if (allCandles[i].length > allCandles[refIndex].length) refIndex = i;
  }
  const refCandles = allCandles[refIndex];
  if (refCandles.length === 0) return [];

  // Build timestamp-indexed price maps for each asset
  const priceMaps = allCandles.map((candles) => {
    const map = new Map<number, number>();
    for (const c of candles) map.set(c.t, c.c);
    return map;
  });

  // Compute normalized weighted basket value at each time point
  // Start at 100, then apply weighted returns
  const baselinePrices = assets.map((a, i) => {
    const candles = allCandles[i];
    return candles.length > 0 ? candles[0].c : 0;
  });

  const series: HistoryPoint[] = [];
  for (let j = 0; j < refCandles.length; j++) {
    const ts = refCandles[j].t;
    let basketValue = 0;
    let activeWeight = 0;

    for (let i = 0; i < assets.length; i++) {
      const price = priceMaps[i].get(ts);
      const base = baselinePrices[i];
      if (price && base && base > 0) {
        const returnPct = (price - base) / base;
        basketValue += assets[i].weight * (1 + returnPct);
        activeWeight += assets[i].weight;
      }
    }

    if (activeWeight > 0) {
      const normalizedValue = (basketValue / activeWeight) * 100;
      series.push({
        label: config.labelFn(refCandles[j], j, refCandles.length),
        value: Number(normalizedValue.toFixed(2)),
      });
    }
  }

  return series;
}

/* ── Format asset data for AI agent prompt ────────────────────── */

export function formatForAIPrompt(metrics: BasketMetrics): string {
  const lines = ["LIVE MARKET DATA (from Hyperliquid):"];

  for (const s of metrics.assetSnapshots) {
    const dir24h = s.change24h >= 0 ? "+" : "";
    const dir7d = s.change7d >= 0 ? "+" : "";
    const dir30d = s.change30d >= 0 ? "+" : "";
    lines.push(
      `  ${s.coin}: $${s.price.toFixed(2)} | 24h: ${dir24h}${(s.change24h * 100).toFixed(1)}% | 7d: ${dir7d}${(s.change7d * 100).toFixed(1)}% | 30d: ${dir30d}${(s.change30d * 100).toFixed(1)}% | 30d range: $${s.low30d.toFixed(2)}-$${s.high30d.toFixed(2)}`,
    );
  }

  const dir = metrics.roi_30d >= 0 ? "+" : "";
  lines.push(`\nBasket weighted performance: 24h=${(metrics.weightedChange24h * 100).toFixed(1)}%, 7d=${(metrics.roi_7d * 100).toFixed(1)}%, 30d=${dir}${(metrics.roi_30d * 100).toFixed(1)}%`);

  return lines.join("\n");
}
