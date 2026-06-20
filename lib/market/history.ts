export type HistoryPeriod = "1d" | "7d" | "1m" | "1y" | "custom";

export interface HistoryPoint {
  label: string;
  value: number;
}

export interface CustomRange {
  from?: string;
  to?: string;
}

export const HISTORY_PERIODS: { value: HistoryPeriod; label: string }[] = [
  { value: "1d", label: "1D" },
  { value: "7d", label: "7D" },
  { value: "1m", label: "1M" },
  { value: "1y", label: "1Y" },
  { value: "custom", label: "Custom" },
];

export function periodPointCount(period: HistoryPeriod, customRange?: CustomRange) {
  if (period === "1d") return 24;
  if (period === "7d") return 28;
  if (period === "1m") return 30;
  if (period === "1y") return 52;

  const from = customRange?.from ? new Date(customRange.from) : null;
  const to = customRange?.to ? new Date(customRange.to) : null;
  if (from && to && Number.isFinite(from.getTime()) && Number.isFinite(to.getTime())) {
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
    return Math.max(12, Math.min(72, days));
  }
  return 36;
}

export function periodLabel(period: HistoryPeriod, customRange?: CustomRange) {
  if (period !== "custom") return HISTORY_PERIODS.find((item) => item.value === period)?.label ?? "1M";
  if (customRange?.from && customRange?.to) return `${customRange.from} -> ${customRange.to}`;
  return "Custom range";
}

export function makeHistorySeries(seed: string, period: HistoryPeriod, customRange?: CustomRange, drift = 0.18): HistoryPoint[] {
  const count = periodPointCount(period, customRange);
  const hash = hashString(seed);
  const start = 100 + (hash % 24);

  return Array.from({ length: count }, (_, index) => {
    const progress = count === 1 ? 1 : index / (count - 1);
    const wave = Math.sin(index / 2.7 + hash * 0.011) * 4.8 + Math.cos(index / 5.1 + hash * 0.017) * 2.9;
    const pullback = Math.sin(progress * Math.PI * 2 + hash * 0.003) * 2.2;
    const value = start * (1 + drift * progress) + wave + pullback;
    return { label: labelForIndex(index, count, period), value: Number(value.toFixed(2)) };
  });
}

export function seriesDelta(series: HistoryPoint[]) {
  if (series.length < 2) return 0;
  const first = series[0].value;
  const last = series[series.length - 1].value;
  return first ? (last - first) / first : 0;
}

function labelForIndex(index: number, count: number, period: HistoryPeriod) {
  if (period === "1d") return `${index}:00`;
  if (period === "7d") return `D-${count - index}`;
  if (period === "1y") return `W${index + 1}`;
  return `D${index + 1}`;
}

function hashString(value: string) {
  return value.split("").reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
}
