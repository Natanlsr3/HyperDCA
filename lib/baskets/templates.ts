import { calculateDiversificationScore, type DiversificationScore } from "@/lib/baskets/diversification";
import type { BasketWithAssets } from "@/lib/baskets/manager";

export interface PremiumAssetMeta {
  coin: string;
  ticker: string;
  sector: string;
  role: string;
  risk: "Low" | "Medium" | "High";
  weight: number;
}

export interface BasketUpdate {
  date: string;
  title: string;
  body: string;
  visibility?: "public" | "subscribers";
}

export interface PremiumBasketTemplate {
  id: string;
  name: string;
  creator: string;
  icon: string;
  shortDescription: string;
  thesis: string;
  marketDrivers: string[];
  selectionLogic: string[];
  whatCouldGoWrong: string[];
  methodology: string;
  riskLevel: "Low" | "Medium" | "High";
  volatility: "Low volatility" | "Medium volatility" | "High volatility";
  targetUser: string;
  rebalanceLogic: string;
  minimumInvestmentUsd: number;
  assets: PremiumAssetMeta[];
  updates: BasketUpdate[];
  diversification: DiversificationScore;
}

const templatesSeed: Omit<PremiumBasketTemplate, "diversification">[] = [
  {
    id: "demo-majors-momentum",
    name: "Majors Momentum",
    creator: "0xCipher.hl",
    icon: "₿",
    shortDescription: "Liquid crypto majors with HYPE as exchange beta.",
    thesis: "Majors Momentum captures the deepest liquidity in crypto while keeping enough HYPE exposure to benefit from Hyperliquid-specific growth.",
    marketDrivers: ["ETF-led BTC/ETH liquidity", "Solana activity cycles", "Hyperliquid market share growth"],
    selectionLogic: ["Require deep perps liquidity", "Cap single asset at 35%", "Prefer assets with strong narrative and market depth"],
    whatCouldGoWrong: ["Crypto-wide drawdown", "Momentum reversal after crowded positioning", "Exchange token beta can amplify losses"],
    methodology: "Monthly review, drift rebalance above 8 percentage points, no leverage by default.",
    riskLevel: "Medium",
    volatility: "Medium volatility",
    targetUser: "Users who want broad crypto beta without selecting every coin manually.",
    rebalanceLogic: "Rebalance monthly or when any asset drifts more than 8 percentage points from target.",
    minimumInvestmentUsd: 250,
    assets: [
      asset("BTC", "BTC", "Crypto majors", "Core reserve asset", "Medium", 0.35),
      asset("ETH", "ETH", "Crypto majors", "Smart-contract liquidity", "Medium", 0.28),
      asset("SOL", "SOL", "Crypto majors", "High throughput beta", "High", 0.22),
      asset("HYPE", "HYPE", "Exchange beta", "Hyperliquid upside", "High", 0.15),
    ],
    updates: [
      update("19 Jun 2026", "Why rebalancing feels wrong sometimes", "Momentum baskets periodically trim winners. That discomfort is the point: it keeps a strong theme from becoming one oversized position."),
      update("10 Jun 2026", "Liquidity still leads the basket", "BTC and ETH continue to anchor the sleeve while HYPE contributes platform beta without dominating the risk budget."),
    ],
  },
  {
    id: "demo-ai-infra",
    name: "AI Infra",
    creator: "Data-center beta",
    icon: "⚡",
    shortDescription: "Semis and AI-adjacent beta with explicit concentration limits.",
    thesis: "AI Infra expresses data-center demand through chip leaders and high-beta platform exposure, but keeps weights capped so a single company does not become the whole portfolio.",
    marketDrivers: ["AI capex cycle", "Accelerator supply constraints", "Equity-perp liquidity expanding through HIP-3"],
    selectionLogic: ["Favor companies tied to AI infrastructure", "Pair mega-cap quality with selective high beta", "Keep non-equity HYPE sleeve below 15%"],
    whatCouldGoWrong: ["AI capex slowdown", "Valuation compression", "Single-name headline risk"],
    methodology: "Review after earnings cycles and reduce assets whose realized volatility dominates the sleeve.",
    riskLevel: "High",
    volatility: "High volatility",
    targetUser: "Users who want AI exposure and accept sharper drawdowns.",
    rebalanceLogic: "Rebalance after earnings or if the top position rises above 45%.",
    minimumInvestmentUsd: 500,
    assets: [
      asset("NVDA", "NVDA", "AI semiconductors", "Compute leader", "High", 0.4),
      asset("AMD", "AMD", "AI semiconductors", "Challenger compute", "High", 0.25),
      asset("TSLA", "TSLA", "AI mobility", "Embodied AI beta", "High", 0.2),
      asset("HYPE", "HYPE", "Exchange beta", "Platform growth", "High", 0.15),
    ],
    updates: [
      update("18 Jun 2026", "Why AI beta needs position caps", "The thesis is strong, but concentration can quietly become the real risk. The basket keeps NVDA large, not absolute."),
      update("07 Jun 2026", "TSLA remains the swing factor", "TSLA adds a different AI vector, but its volatility means the basket watches drift more aggressively."),
    ],
  },
  {
    id: "demo-commodities-copper",
    name: "Copper Macro",
    creator: "Macro metals desk",
    icon: "Cu",
    shortDescription: "HIP-3 commodity sleeve for inflation and electrification exposure.",
    thesis: "Copper Macro gives the portfolio a different engine: real-world demand, electrification and supply constraints rather than pure crypto liquidity.",
    marketDrivers: ["Grid investment", "EV and data-center electrification", "Commodity supply discipline"],
    selectionLogic: ["Use HIP-3 tickers where available", "Blend copper with gold and energy proxies", "Keep crypto beta as a liquidity sleeve only"],
    whatCouldGoWrong: ["Global growth slowdown", "Commodity contango and carry drag", "HIP-3 liquidity can be thinner than core perps"],
    methodology: "Quarterly macro review with volatility bands and lower leverage assumptions than high-beta crypto baskets.",
    riskLevel: "Medium",
    volatility: "Medium volatility",
    targetUser: "Users who want diversification away from pure crypto or AI beta.",
    rebalanceLogic: "Rebalance quarterly or when commodity sleeve drops below 65% total weight.",
    minimumInvestmentUsd: 350,
    assets: [
      asset("COPPER", "xyz:COPPER", "Commodities", "Electrification demand", "Medium", 0.35),
      asset("GOLD", "xyz:GOLD", "Commodities", "Defensive real asset", "Low", 0.25),
      asset("OIL", "xyz:OIL", "Energy", "Energy inflation hedge", "Medium", 0.2),
      asset("BTC", "BTC", "Crypto majors", "Liquidity hedge", "Medium", 0.12),
      asset("HYPE", "HYPE", "Exchange beta", "Platform optionality", "High", 0.08),
    ],
    updates: [
      update("17 Jun 2026", "Copper is the diversifier, not the decoration", "The point of this basket is to reduce dependence on crypto-only narratives while keeping tradable momentum."),
      update("03 Jun 2026", "Why gold stays in the sleeve", "Gold lowers the cyclicality of the commodity basket and creates a ballast against growth shocks."),
    ],
  },
];

export const premiumBasketTemplates: PremiumBasketTemplate[] = templatesSeed.map((template) => ({
  ...template,
  diversification: calculateDiversificationScore(template.assets),
}));

export function getPremiumBasketTemplate(id: string) {
  return premiumBasketTemplates.find((template) => template.id === id) ?? null;
}

export function getPremiumTemplateForBasket(basket: Pick<BasketWithAssets, "id" | "name">) {
  return getPremiumBasketTemplate(basket.id)
    ?? premiumBasketTemplates.find((template) => template.name.toLowerCase() === basket.name.toLowerCase())
    ?? null;
}

function asset(coin: string, ticker: string, sector: string, role: string, risk: PremiumAssetMeta["risk"], weight: number): PremiumAssetMeta {
  return { coin, ticker, sector, role, risk, weight };
}

function update(date: string, title: string, body: string, visibility: BasketUpdate["visibility"] = "public"): BasketUpdate {
  return { date, title, body, visibility };
}
