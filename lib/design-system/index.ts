export { ASSET_COLORS, COLORS } from "./colors";
export { SPACING } from "./spacing";
export { TYPOGRAPHY } from "./typography";

const THEME_LABELS: Record<string, string> = {
  semiconductors: "Semiconductors",
  ai_infra: "AI Infrastructure",
  megacap_tech: "Megacap Tech",
  crypto_majors: "Crypto Majors",
  growth: "Growth",
  macro: "Macro",
  commodities: "Commodities",
  asia_tech: "Asia Tech",
};

export function formatTheme(theme: string): string {
  return THEME_LABELS[theme] ?? theme.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function displayCoin(coin: string): string {
  const idx = coin.indexOf(":");
  return idx >= 0 ? coin.slice(idx + 1) : coin;
}

/** HHI-based diversification score: 100 = perfectly equal, lower = concentrated. */
export function diversificationScore(weights: number[]): number {
  if (weights.length <= 1) return 0;
  const total = weights.reduce((s, w) => s + w, 0);
  if (total === 0) return 0;
  const normalized = weights.map((w) => w / total);
  const hhi = normalized.reduce((s, w) => s + w * w, 0);
  const minHhi = 1 / weights.length;
  const score = Math.round(((1 - hhi) / (1 - minHhi)) * 100);
  return Math.max(0, Math.min(100, score));
}

