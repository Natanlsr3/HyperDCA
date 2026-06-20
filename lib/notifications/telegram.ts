import { createServiceClient } from "@/lib/db/client";
import type { Basket, BasketChange, MirrorExecution } from "@/lib/db/types";

type TelegramButton = { text: string; url?: string; callback_data?: string };

async function telegramRequest<T>(method: string, body: Record<string, unknown>): Promise<T | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Telegram ${method} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function formatBasketUpdateMessage(
  basket: Pick<Basket, "name">,
  change: Pick<BasketChange, "old_composition" | "new_composition">,
) {
  const oldByCoin = new Map(change.old_composition.map((item) => [item.coin, item.weight]));
  const lines = change.new_composition.map((item) => {
    const old = oldByCoin.get(item.coin);
    const before = old === undefined ? "new" : `${Math.round(Number(old) * 100)}%`;
    return `${item.coin}: ${before} -> ${Math.round(Number(item.weight) * 100)}%`;
  });
  return `Basket updated: ${basket.name}\n${lines.join("\n")}`;
}

export async function sendNotification(
  telegramChatId: string,
  message: string,
  buttons?: TelegramButton[][],
) {
  const reply_markup = buttons ? { inline_keyboard: buttons } : undefined;
  const result = await telegramRequest<{ result: { message_id: number } }>("sendMessage", {
    chat_id: telegramChatId,
    text: message,
    reply_markup,
  });
  return result?.result.message_id ?? null;
}

export async function sendBasketUpdateNotification(
  userId: string,
  basket: Basket,
  change: BasketChange,
) {
  const supa = createServiceClient();
  const { data: user, error } = await supa
    .from("users")
    .select("telegram_chat_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!user?.telegram_chat_id) return null;
  return sendNotification(user.telegram_chat_id, formatBasketUpdateMessage(basket, change), [
    [{ text: "View basket", url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/baskets/${basket.id}` }],
  ]);
}

export async function sendMirrorExecutedNotification(userId: string, execution: MirrorExecution) {
  const supa = createServiceClient();
  const { data: user, error } = await supa
    .from("users")
    .select("telegram_chat_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!user?.telegram_chat_id) return null;
  const status = execution.success ? "Mirror executed" : "Mirror failed";
  return sendNotification(user.telegram_chat_id, `${status}\nTrades: ${execution.trades_executed.length}`);
}

export async function sendRiskAlert(userId: string, alert: { title: string; message: string }) {
  const supa = createServiceClient();
  const { data: user, error } = await supa
    .from("users")
    .select("telegram_chat_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!user?.telegram_chat_id) return null;
  return sendNotification(user.telegram_chat_id, `${alert.title}\n${alert.message}`);
}

export function initTelegramBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }
  return { mode: "telegram-http-api" as const };
}
