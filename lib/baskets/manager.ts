import { createServiceClient } from "@/lib/db/client";
import type {
  Basket,
  BasketAsset,
  BasketFollower,
  BasketSortKey,
  CompositionItem,
  FollowMode,
  NetworkFilter,
} from "@/lib/db/types";

export type BasketWithAssets = Basket & {
  basket_assets: BasketAsset[];
  basket_followers?: BasketFollower[];
};

export async function getPublicBaskets(filter?: {
  network?: NetworkFilter;
  sortBy?: BasketSortKey;
  limit?: number;
  search?: string;
}): Promise<BasketWithAssets[]> {
  const supa = createServiceClient();
  const sortBy = filter?.sortBy ?? "roi_30d";
  let query = supa
    .from("baskets")
    .select("*, basket_assets(*)")
    .eq("is_public", true)
    .order(sortBy, { ascending: sortBy === "created_at" })
    .limit(filter?.limit ?? 50);

  if (filter?.network === "mainnet") query = query.eq("is_testnet", false);
  if (filter?.network === "testnet") query = query.eq("is_testnet", true);
  if (filter?.search) query = query.ilike("name", `%${filter.search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as BasketWithAssets[];
}

export async function getBasketDetail(basketId: string, userId?: string): Promise<BasketWithAssets | null> {
  const supa = createServiceClient();
  const { data, error } = await supa
    .from("baskets")
    .select("*, basket_assets(*), basket_followers(*)")
    .eq("id", basketId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as BasketWithAssets;
  if (userId && row.basket_followers) {
    row.basket_followers = row.basket_followers.filter((f) => f.user_id === userId);
  }
  return row;
}

export async function followBasket(
  userId: string,
  basketId: string,
  mode: FollowMode = "manual",
): Promise<BasketFollower> {
  const supa = createServiceClient();
  const { data, error } = await supa
    .from("basket_followers")
    .upsert(
      { user_id: userId, basket_id: basketId, follow_mode: mode },
      { onConflict: "user_id,basket_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  await refreshFollowersCount(basketId);
  return data as BasketFollower;
}

export async function unfollowBasket(userId: string, basketId: string) {
  const supa = createServiceClient();
  const { error } = await supa
    .from("basket_followers")
    .delete()
    .eq("user_id", userId)
    .eq("basket_id", basketId);
  if (error) throw error;
  await refreshFollowersCount(basketId);
}

export async function refreshFollowersCount(basketId: string) {
  const supa = createServiceClient();
  const { count, error: countErr } = await supa
    .from("basket_followers")
    .select("id", { count: "exact", head: true })
    .eq("basket_id", basketId);
  if (countErr) throw countErr;
  const { error } = await supa
    .from("baskets")
    .update({ followers_count: count ?? 0 })
    .eq("id", basketId);
  if (error) throw error;
}

export async function getLeaderboard(
  network: NetworkFilter = "all",
  sortBy: BasketSortKey = "roi_30d",
  limit = 100,
) {
  return getPublicBaskets({ network, sortBy, limit });
}

export async function createPublicBasket(input: {
  name: string;
  description?: string | null;
  theme?: string;
  composition: CompositionItem[];
  network?: "mainnet" | "testnet";
  createdByUserId: string;
}) {
  const supa = createServiceClient();
  const totalWeight = input.composition.reduce((sum, item) => sum + Number(item.weight), 0);
  if (Math.abs(totalWeight - 1) > 0.001) throw new Error("Composition weights must sum to 1.0");

  const { data: basket, error } = await supa
    .from("baskets")
    .insert({
      owner_user_id: input.createdByUserId,
      name: input.name,
      theme: input.theme ?? "custom",
      description: input.description ?? null,
      is_public: true,
      is_testnet: input.network === "testnet",
    })
    .select("*")
    .single();
  if (error) throw error;

  const assets = input.composition.map((item) => ({
    basket_id: basket.id,
    coin: item.coin,
    dex: item.dex ?? "",
    weight: item.weight,
    sz_decimals: item.sz_decimals ?? 3,
    collateral: item.collateral ?? "USDC",
    swap_pair: item.swap_pair ?? null,
    is_cross: item.is_cross ?? true,
  }));
  const { error: assetsErr } = await supa.from("basket_assets").insert(assets);
  if (assetsErr) throw assetsErr;
  return getBasketDetail(basket.id);
}

export async function updateBasketComposition(
  basketId: string,
  composition: CompositionItem[],
  patch?: Partial<Pick<Basket, "name" | "theme" | "description" | "is_public">>,
) {
  const supa = createServiceClient();
  const totalWeight = composition.reduce((sum, item) => sum + Number(item.weight), 0);
  if (Math.abs(totalWeight - 1) > 0.001) throw new Error("Composition weights must sum to 1.0");

  if (patch && Object.keys(patch).length > 0) {
    const { error } = await supa.from("baskets").update(patch).eq("id", basketId);
    if (error) throw error;
  }

  const { error: deleteErr } = await supa.from("basket_assets").delete().eq("basket_id", basketId);
  if (deleteErr) throw deleteErr;
  const { error: insertErr } = await supa.from("basket_assets").insert(
    composition.map((item) => ({
      basket_id: basketId,
      coin: item.coin,
      dex: item.dex ?? "",
      weight: item.weight,
      sz_decimals: item.sz_decimals ?? 3,
      collateral: item.collateral ?? "USDC",
      swap_pair: item.swap_pair ?? null,
      is_cross: item.is_cross ?? true,
    })),
  );
  if (insertErr) throw insertErr;
  const { error } = await supa
    .from("baskets")
    .update({ last_rebalance: new Date().toISOString() })
    .eq("id", basketId);
  if (error) throw error;
  return getBasketDetail(basketId);
}

export async function updateBasketRoi(basketId: string) {
  const supa = createServiceClient();
  const { data, error } = await supa
    .from("mirror_executions")
    .select("success")
    .eq("basket_id", basketId);
  if (error) throw error;
  const total = data?.length ?? 0;
  const successes = data?.filter((row) => row.success).length ?? 0;
  const hitRate = total ? successes / total : 0.5;
  const { error: updateErr } = await supa
    .from("baskets")
    .update({ total_trades: total, hit_rate: hitRate })
    .eq("id", basketId);
  if (updateErr) throw updateErr;
}
