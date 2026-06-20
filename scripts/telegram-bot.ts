import {
  onAsk,
  onBasketDetail,
  onBaskets,
  onCompare,
  onFollow,
  onLeaderboard,
  onMirror,
  onPortfolio,
  onSell,
  onStart,
  onThesis,
  type BotContextLike,
} from "@/lib/bot/commands";

type TelegramUpdate = {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
  };
};

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

let offset = 0;

async function telegram(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Telegram ${method} failed: ${response.status}`);
  return response.json();
}

function context(chatId: number): BotContextLike {
  return {
    reply(message: string, extra?: unknown) {
      return telegram("sendMessage", { chat_id: chatId, text: message, ...(extra as object) });
    },
  };
}

async function handle(update: TelegramUpdate) {
  const text = update.message?.text?.trim();
  const chatId = update.message?.chat.id;
  if (!text || !chatId) return;
  const [command, arg, arg2] = text.split(/\s+/);
  const ctx = context(chatId);
  if (command === "/start") return onStart(ctx);
  if (command === "/baskets") return onBaskets(ctx);
  if (command === "/basket" && arg) return onBasketDetail(ctx, arg);
  if (command === "/leaderboard") return onLeaderboard(ctx);
  if (command === "/portfolio") return onPortfolio(ctx);
  if (command === "/follow" && arg) return onFollow(ctx, arg);
  if (command === "/mirror" && arg) return onMirror(ctx, arg);
  if (command === "/sell" && arg) return onSell(ctx, arg);
  if (command === "/thesis" && arg) return onThesis(ctx, arg);
  if (command === "/compare" && arg && arg2) return onCompare(ctx, arg, arg2);
  if (command === "/ask") return onAsk(ctx, text.replace(/^\/ask\s*/i, ""));
  if (text.startsWith("/")) return ctx.reply("Unknown command. Try /baskets, /leaderboard, /thesis <id>, /compare <id-a> <id-b>, or /ask <question>.");
  return onAsk(ctx, text);
}

async function loop() {
  for (;;) {
    const data = await telegram("getUpdates", { timeout: 30, offset });
    const updates = (data.result ?? []) as TelegramUpdate[];
    for (const update of updates) {
      offset = update.update_id + 1;
      await handle(update);
    }
  }
}

loop().catch((error) => {
  console.error(error);
  process.exit(1);
});
