import { createInfoClient } from "@/lib/hl/client";

export type AssetMarketType = "core-perp" | "hip-3" | "spot" | "unknown";

export interface NormalizedAsset {
  symbol: string;
  rawCoin: string;
  displayName: string;
  marketType: AssetMarketType;
  sector: string;
  exchange: string;
  szDecimals: number;
  isTradable: boolean;
  isDelisted: boolean;
}

const SECTOR_BY_SYMBOL: Record<string, string> = {
  BTC: "Crypto majors",
  ETH: "Crypto majors",
  SOL: "Crypto majors",
  HYPE: "Exchange beta",
  LINK: "DeFi infrastructure",
  AAVE: "DeFi credit",
  UNI: "DeFi exchange",
  NVDA: "AI semiconductors",
  AMD: "AI semiconductors",
  TSLA: "AI mobility",
  COPPER: "Commodities",
  GOLD: "Commodities",
  OIL: "Energy",
  NATGAS: "Energy",
};

export async function fetchNormalizedAssets(): Promise<NormalizedAsset[]> {
  const info = createInfoClient();
  const [coreMeta, dexs] = await Promise.all([
    info.meta().catch(() => ({ universe: [] })),
    info.perpDexs().catch(() => []),
  ]);

  const coreAssets = (coreMeta.universe ?? []).map((asset) => normalizeAsset({
    name: asset.name,
    szDecimals: asset.szDecimals,
    isDelisted: Boolean(asset.isDelisted),
    dex: "",
  }));

  const hip3Assets = dexs.filter(Boolean).flatMap((dex) => {
    const dexName = dex?.name ?? "";
    const universe = "universe" in (dex as object) ? (dex as { universe?: { name: string; szDecimals: number; isDelisted?: boolean }[] }).universe ?? [] : [];
    const caps = "assetToStreamingOiCap" in (dex as object)
      ? (dex as { assetToStreamingOiCap?: [string, string][] }).assetToStreamingOiCap ?? []
      : [];
    const fromUniverse = universe.map((asset) => normalizeAsset({
      name: asset.name,
      szDecimals: asset.szDecimals,
      isDelisted: Boolean(asset.isDelisted),
      dex: dexName,
    }));
    const fromCaps = caps.map(([symbol]) => normalizeAsset({
      name: symbol,
      szDecimals: 3,
      isDelisted: false,
      dex: dexName,
    }));
    return [...fromUniverse, ...fromCaps];
  });

  return dedupeAssets([...coreAssets, ...hip3Assets]).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function normalizeAsset(input: { name: string; szDecimals?: number; isDelisted?: boolean; dex?: string }): NormalizedAsset {
  const rawCoin = input.name;
  const [embeddedExchange, embeddedCoin] = rawCoin.includes(":") ? rawCoin.split(":") : ["", rawCoin];
  const exchange = embeddedExchange || input.dex || "";
  const coin = embeddedCoin || rawCoin;
  const symbol = exchange ? `${exchange}:${coin}` : coin;
  const clean = coin.replace(/^.*:/, "").toUpperCase();
  const marketType: AssetMarketType = exchange ? "hip-3" : "core-perp";

  return {
    symbol,
    rawCoin: coin,
    displayName: displayNameFor(clean),
    marketType,
    sector: SECTOR_BY_SYMBOL[clean] ?? inferSector(clean, marketType),
    exchange,
    szDecimals: input.szDecimals ?? 3,
    isTradable: !input.isDelisted,
    isDelisted: Boolean(input.isDelisted),
  };
}

function displayNameFor(symbol: string) {
  if (symbol === "BTC") return "Bitcoin";
  if (symbol === "ETH") return "Ethereum";
  if (symbol === "SOL") return "Solana";
  if (symbol === "HYPE") return "Hyperliquid";
  if (symbol === "NVDA") return "Nvidia";
  if (symbol === "AMD") return "Advanced Micro Devices";
  if (symbol === "TSLA") return "Tesla";
  if (symbol === "COPPER") return "Copper";
  return symbol;
}

function inferSector(symbol: string, marketType: AssetMarketType) {
  if (marketType === "hip-3") return "HIP-3 market";
  if (["BTC", "ETH", "SOL"].includes(symbol)) return "Crypto majors";
  return "Perpetuals";
}

function dedupeAssets(assets: NormalizedAsset[]) {
  const bySymbol = new Map<string, NormalizedAsset>();
  for (const asset of assets) bySymbol.set(asset.symbol, asset);
  return [...bySymbol.values()];
}
