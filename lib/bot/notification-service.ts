import { sendNotification } from "@/lib/notifications/telegram";

export async function sendBasketUpdateAlert(
  telegramChatId: string,
  basketId: string,
  message: string,
) {
  return sendNotification(telegramChatId, message, [
    [{ text: "View basket", url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/baskets/${basketId}` }],
  ]);
}

export { sendNotification };
