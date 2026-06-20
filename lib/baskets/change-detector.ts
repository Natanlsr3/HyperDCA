import { createServiceClient } from "@/lib/db/client";
import type { Basket, BasketAsset, BasketChange, CompositionItem } from "@/lib/db/types";
import { sendBasketUpdateNotification } from "@/lib/notifications/telegram";

export function assetsToComposition(assets: Pick<BasketAsset, "coin" | "dex" | "weight">[]): CompositionItem[] {
  return assets.map((asset) => ({
    coin: asset.coin,
    dex: asset.dex,
    weight: Number(asset.weight),
  }));
}

export function hasCompositionChanged(oldComposition: CompositionItem[], newComposition: CompositionItem[]) {
  const oldKey = JSON.stringify(
    [...oldComposition].sort((a, b) => `${a.dex}:${a.coin}`.localeCompare(`${b.dex}:${b.coin}`)),
  );
  const newKey = JSON.stringify(
    [...newComposition].sort((a, b) => `${a.dex}:${a.coin}`.localeCompare(`${b.dex}:${b.coin}`)),
  );
  return oldKey !== newKey;
}

export async function detectBasketChange(
  basketId: string,
  newComposition: CompositionItem[],
  changedByUserId?: string,
): Promise<BasketChange | null> {
  const supa = createServiceClient();
  const { data: assets, error } = await supa
    .from("basket_assets")
    .select("coin,dex,weight")
    .eq("basket_id", basketId);
  if (error) throw error;
  const oldComposition = assetsToComposition(assets ?? []);
  if (!hasCompositionChanged(oldComposition, newComposition)) return null;

  const { data, error: insertErr } = await supa
    .from("basket_changes")
    .insert({
      basket_id: basketId,
      changed_by_user_id: changedByUserId ?? null,
      old_composition: oldComposition,
      new_composition: newComposition,
    })
    .select("*")
    .single();
  if (insertErr) throw insertErr;
  return data as BasketChange;
}

export async function notifyFollowers(basketId: string, change: BasketChange) {
  const supa = createServiceClient();
  const [{ data: basket, error: basketErr }, { data: followers, error: followersErr }] =
    await Promise.all([
      supa.from("baskets").select("*").eq("id", basketId).single(),
      supa.from("basket_followers").select("user_id,telegram_notified").eq("basket_id", basketId),
    ]);
  if (basketErr) throw basketErr;
  if (followersErr) throw followersErr;

  let notified = 0;
  for (const follower of followers ?? []) {
    const title = `${basket.name} updated`;
    const message = formatTelegramMessage(basket as Basket, change);
    const { error } = await supa.from("notifications").insert({
      user_id: follower.user_id,
      basket_id: basketId,
      notification_type: "basket_updated",
      title,
      message,
    });
    if (error) throw error;
    if (follower.telegram_notified) {
      await sendBasketUpdateNotification(follower.user_id, basket as Basket, change);
    }
    notified += 1;
  }

  const { error } = await supa
    .from("basket_changes")
    .update({ users_notified_count: notified })
    .eq("id", change.id);
  if (error) throw error;
  return notified;
}

export function formatTelegramMessage(basket: Pick<Basket, "name">, change: BasketChange) {
  const oldByCoin = new Map(change.old_composition.map((item) => [item.coin, Number(item.weight)]));
  const lines = change.new_composition.map((item) => {
    const old = oldByCoin.get(item.coin);
    const before = old === undefined ? "new" : `${Math.round(old * 100)}%`;
    return `${item.coin}: ${before} -> ${Math.round(Number(item.weight) * 100)}%`;
  });
  return `${basket.name} basket updated\n${lines.join("\n")}`;
}
