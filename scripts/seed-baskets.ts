import { createPublicBasket } from "@/lib/baskets/manager";
import { premiumBasketTemplates } from "@/lib/baskets/templates";
import { isServiceDbConfigured } from "@/lib/db/client";

const adminUserId = process.env.SEED_ADMIN_USER_ID;

async function main() {
  if (!isServiceDbConfigured()) {
    console.log("Supabase is not configured. Seed skipped; demo templates are available in-app.");
    return;
  }
  if (!adminUserId) {
    throw new Error("SEED_ADMIN_USER_ID is required to seed baskets into Supabase.");
  }

  for (const template of premiumBasketTemplates) {
    const basket = await createPublicBasket({
      name: template.name,
      theme: template.creator,
      description: template.shortDescription,
      network: template.assets.some((asset) => asset.ticker.includes(":")) ? "testnet" : "mainnet",
      createdByUserId: adminUserId,
      composition: template.assets.map((asset) => {
        const [dex, coin] = asset.ticker.includes(":") ? asset.ticker.split(":") : ["", asset.coin];
        return {
          coin: coin || asset.coin,
          dex,
          weight: asset.weight,
          sz_decimals: 3,
          collateral: "USDC",
          is_cross: true,
        };
      }),
    });
    console.log(`Seeded ${basket?.name ?? template.name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
