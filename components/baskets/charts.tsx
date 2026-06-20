"use client";

import { ASSET_COLORS } from "@/lib/design-system";
import type { HistoryPoint } from "@/lib/market/history";

interface Asset {
  coin: string;
  weight: number;
}

function colorFor(coin: string) {
  return ASSET_COLORS[coin] ?? "#64748B";
}

export function CompositionChart({ assets }: { assets: Asset[] }) {
  const circumference = 2 * Math.PI * 70;
  let offset = 0;

  return (
    <div data-testid="composition-chart" className="flex items-center gap-[22px]">
      <div className="relative h-[180px] w-[180px] flex-none">
        <svg viewBox="0 0 180 180" className="h-[180px] w-[180px] -rotate-90">
          <circle cx="90" cy="90" r="70" fill="none" stroke="var(--surface3)" strokeWidth="22" />
          {assets.map((asset) => {
            const dash = Number(asset.weight) * circumference;
            const segment = (
              <circle
                key={asset.coin}
                cx="90"
                cy="90"
                r="70"
                fill="none"
                stroke={colorFor(asset.coin)}
                strokeWidth="22"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return segment;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="mono text-[26px] font-semibold text-[var(--text)]">{assets.length}</div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-[var(--text3)]">positions</div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-[11px]">
        {assets.map((asset) => (
          <div key={asset.coin} className="flex items-center gap-[10px]">
            <span className="h-[10px] w-[10px] flex-none rounded-[3px]" style={{ background: colorFor(asset.coin) }} />
            <span className="mono w-[54px] text-[13px] font-semibold text-[var(--text)]">{asset.coin}</span>
            <span className="text-[11px] font-medium text-[var(--pos)]">Long 1x</span>
            <span className="mono flex-1 text-right text-[13px] font-semibold text-[var(--text)]">{Math.round(Number(asset.weight) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PerformanceChart({ roi30d = 0, series }: { roi30d?: number; series?: HistoryPoint[] }) {
  const values = series?.length
    ? series.map((point) => point.value)
    : Array.from({ length: 30 }, (_, index) => {
        const base = 100 + roi30d * 100 * (index / 29);
        const wave = Math.sin(index / 2.6) * 4 + Math.cos(index / 4) * 2;
        return base + wave;
      });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = 48 + (index / Math.max(1, values.length - 1)) * 596;
    const y = 198 - ((value - min) / spread) * 174;
    return { x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const area = `${path} L644 210 L48 210 Z`;
  const axis = [max, min + spread * 0.75, min + spread * 0.5, min + spread * 0.25, min];

  return (
    <svg data-testid="performance-chart" viewBox="0 0 660 230" className="h-auto w-full">
      {[32, 76, 120, 164, 208].map((y) => (
        <line key={y} x1="48" x2="644" y1={y} y2={y} stroke="#EEF1F4" strokeWidth="1" />
      ))}
      {axis.map((value, index) => (
        <text key={index} x="40" y={36 + index * 44} textAnchor="end" fill="var(--text3)" className="mono text-[10px] font-medium">
          {value.toFixed(0)}
        </text>
      ))}
      <path d={area} fill="rgba(30,64,175,0.06)" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3.5" fill="var(--accent)" />
      {[
        series?.[0]?.label ?? "Start",
        series?.[Math.floor((series.length - 1) / 3)]?.label ?? "D-20",
        series?.[Math.floor(((series.length - 1) * 2) / 3)]?.label ?? "D-10",
        series?.[series.length - 1]?.label ?? "Now",
      ].map((label, index) => (
        <text key={label} x={48 + index * 198} y="224" textAnchor="middle" fill="var(--text3)" className="mono text-[10px] font-medium">
          {label}
        </text>
      ))}
    </svg>
  );
}
