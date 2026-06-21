"use client";

import Link from "next/link";
import { ASSET_COLORS } from "@/lib/design-system";

interface BasketAsset {
  coin: string;
  weight: number;
  dex: string;
}

interface Basket {
  id: string;
  name: string;
  theme: string;
  description: string | null;
  roi_30d?: number;
  roi_ytd?: number;
  hit_rate?: number;
  followers_count?: number;
  basket_assets: BasketAsset[];
}

function pct(value?: number) {
  return `${Number(value ?? 0) >= 0 ? "+" : ""}${((value ?? 0) * 100).toFixed(1)}%`;
}

function compact(value?: number) {
  const n = value ?? 0;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(normalized, 16);
  return `${(bigint >> 16) & 255}, ${(bigint >> 8) & 255}, ${bigint & 255}`;
}

function displayCoin(coin: string) {
  const idx = coin.indexOf(":");
  return idx >= 0 ? coin.slice(idx + 1) : coin;
}

function sparkPoints(seed: number, roi = 0) {
  return Array.from({ length: 18 }, (_, index) => {
    const x = (index / 17) * 120;
    const trend = roi * 18 * (index / 17);
    const wave = Math.sin((index + seed) / 2) * 4 + Math.cos((index + seed) / 3) * 2;
    const y = 25 - trend - wave;
    return `${x.toFixed(1)},${Math.max(4, Math.min(30, y)).toFixed(1)}`;
  }).join(" ");
}

export function BasketCard({ basket }: { basket: Basket }) {
  const positive = Number(basket.roi_30d ?? 0) >= 0;
  const seed = basket.name.length + basket.basket_assets.length;

  return (
    <article data-testid="basket-card" className="basket-card">
      <div className="flex items-start justify-between gap-[10px]">
        <div className="min-w-0">
          <div className="mb-[3px] flex items-center gap-[7px]">
            <h3 className="basket-card-title">{basket.name}</h3>
            {basket.roi_30d && basket.roi_30d > 0.25 ? <span className="basket-tag">TRENDING</span> : null}
          </div>
          <p className="basket-creator">{basket.theme}</p>
        </div>
        <span className={`basket-roi ${positive ? "is-positive" : "is-negative"}`}>{pct(basket.roi_30d)}</span>
      </div>

      <svg viewBox="0 0 120 32" preserveAspectRatio="none" className="h-[38px] w-full">
        <polyline
          points={sparkPoints(seed, basket.roi_30d)}
          fill="none"
          stroke={positive ? "var(--pos)" : "var(--neg)"}
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      <div className="flex flex-wrap gap-[6px]">
        {basket.basket_assets.slice(0, 5).map((asset) => {
          const ticker = displayCoin(asset.coin);
          const color = ASSET_COLORS[ticker] ?? "#64748B";
          return (
            <span
              key={`${asset.dex}:${asset.coin}`}
              className="asset-chip"
              style={{
                color,
                background: `rgba(${hexToRgb(color)}, 0.12)`,
                borderColor: `rgba(${hexToRgb(color)}, 0.30)`,
              }}
            >
              {ticker}
              <span className="opacity-65">{Math.round(Number(asset.weight) * 100)}%</span>
            </span>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
        <div className="flex gap-4">
          <Metric label="Followers" value={compact(basket.followers_count)} />
          <Metric label="Hit rate" value={`${((basket.hit_rate ?? 0) * 100).toFixed(0)}%`} />
        </div>
        <div className="flex gap-[7px]">
          <Link href={`/schedule/${basket.id}`} className="btn no-underline">Follow</Link>
          <Link href={`/baskets/${basket.id}`} className="btn-secondary no-underline">Details</Link>
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.04em] text-[var(--text3)]">{label}</div>
      <div className="mono text-[13px] font-semibold text-[var(--text)]">{value}</div>
    </div>
  );
}

