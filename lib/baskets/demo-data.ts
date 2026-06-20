import { premiumBasketTemplates } from "@/lib/baskets/templates";
import type { BasketWithAssets } from "@/lib/baskets/manager";

export const demoBaskets: BasketWithAssets[] = premiumBasketTemplates.map((template, index) => ({
  id: template.id,
  owner_user_id: null,
  name: template.name,
  theme: template.creator,
  description: template.shortDescription,
  is_public: true,
  is_testnet: template.assets.some((asset) => asset.ticker.includes(":")),
  roi_30d: [0.428, 0.286, 0.172][index] ?? 0.14,
  roi_ytd: [0.862, 0.511, 0.364][index] ?? 0.22,
  hit_rate: [0.71, 0.64, 0.61][index] ?? 0.58,
  followers_count: [3100, 1800, 1240][index] ?? 900,
  total_trades: [184, 96, 74][index] ?? 50,
  last_rebalance: new Date().toISOString(),
  created_at: new Date(Date.now() - index * 86_400_000).toISOString(),
  basket_assets: template.assets.map((asset) => demoAsset(template.id, asset.coin, asset.ticker, asset.weight)),
}));

export function getDemoBasket(id: string) {
  return demoBaskets.find((basket) => basket.id === id) ?? null;
}

function demoAsset(basketId: string, coin: string, ticker: string, weight: number) {
  const [maybeDex, maybeCoin] = ticker.includes(":") ? ticker.split(":") : ["", coin];
  return {
    id: `${basketId}-${coin}`,
    basket_id: basketId,
    coin: maybeCoin || coin,
    weight,
    dex: maybeDex,
    sz_decimals: 3,
    collateral: "USDC",
    swap_pair: null,
    is_cross: true,
    created_at: new Date().toISOString(),
  };
}
