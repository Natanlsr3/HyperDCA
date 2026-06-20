import { getLeaderboard, getPublicBaskets } from "@/lib/baskets/manager";
import { answerWithAdvisor, advisorProviderLabel, buildBasketAdvisorContext, formatBasketThesis, isAdvisorConfigured } from "@/lib/bot/advisor";
import { demoBaskets } from "@/lib/baskets/demo-data";
import { getPremiumBasketTemplate, premiumBasketTemplates } from "@/lib/baskets/templates";
import { isServiceDbConfigured } from "@/lib/db/client";

export interface BotContextLike {
  reply(message: string, extra?: unknown): Promise<unknown> | unknown;
}

export async function onStart(ctx: BotContextLike) {
  const advisor = isAdvisorConfigured() ? `AI advisor: ${advisorProviderLabel()}` : "AI advisor: not configured";
  return ctx.reply(
    [
      "Welcome to HyperDCA.",
      advisor,
      "",
      "Commands:",
      "/baskets",
      "/leaderboard",
      "/basket <id>",
      "/portfolio",
      "/follow <id>",
      "/mirror <id>",
      "/sell <id>",
      "/thesis <id>",
      "/compare <id-a> <id-b>",
      "/ask <question>",
      "",
      "You can also send a normal message and I will answer if the AI advisor is configured.",
    ].join("\n"),
  );
}

export async function onBaskets(ctx: BotContextLike) {
  const baskets = isServiceDbConfigured() ? await getPublicBaskets({ limit: 10 }) : demoBaskets.slice(0, 10);
  return ctx.reply(
    baskets
      .map((basket) => `${basket.name} (${basket.id})\nROI 30d: ${((basket.roi_30d ?? 0) * 100).toFixed(1)}%`)
      .join("\n\n") || "No public baskets yet.",
  );
}

export async function onBasketDetail(ctx: BotContextLike, basketId: string) {
  const baskets = isServiceDbConfigured() ? await getPublicBaskets({ limit: 100 }) : demoBaskets;
  const basket = baskets.find((item) => item.id === basketId);
  if (!basket) return ctx.reply("Basket not found.");
  return ctx.reply(
    `${basket.name}\n${basket.description ?? ""}\n\n${basket.basket_assets
      .map((asset) => `${asset.coin}: ${Math.round(Number(asset.weight) * 100)}%`)
      .join("\n")}\n\nTry /thesis ${basket.id}`,
  );
}

export async function onLeaderboard(ctx: BotContextLike) {
  const baskets = isServiceDbConfigured()
    ? await getLeaderboard("all", "roi_30d", 10)
    : demoBaskets
        .slice()
        .sort((a, b) => Number(b.roi_30d ?? 0) - Number(a.roi_30d ?? 0))
        .slice(0, 10);
  return ctx.reply(
    baskets
      .map((basket, index) => `${index + 1}. ${basket.name}: ${((basket.roi_30d ?? 0) * 100).toFixed(1)}%`)
      .join("\n") || "No leaderboard yet.",
  );
}

export async function onPortfolio(ctx: BotContextLike) {
  return ctx.reply("Portfolio requires browser Privy auth. Open HyperDCA and connect Telegram in settings.");
}

export async function onFollow(ctx: BotContextLike, basketId: string) {
  return ctx.reply(`Follow from Telegram is ready for basket ${basketId}, once Telegram account linking is enabled.`);
}

export async function onMirror(ctx: BotContextLike, basketId: string) {
  return ctx.reply(`Mirror dry-run from Telegram is ready for basket ${basketId}. Confirm in browser before execution.`);
}

export async function onSell(ctx: BotContextLike, basketId: string) {
  return ctx.reply(`Sell flow requested for basket ${basketId}. Confirm in browser before execution.`);
}

export async function onThesis(ctx: BotContextLike, basketId: string) {
  const thesis = formatBasketThesis(basketId);
  return ctx.reply(thesis ?? "Premium thesis not found for this basket.");
}

export async function onCompare(ctx: BotContextLike, leftId: string, rightId: string) {
  const left = getPremiumBasketTemplate(leftId);
  const right = getPremiumBasketTemplate(rightId);
  if (!left || !right) return ctx.reply("Use two premium basket ids, for example /compare demo-ai-infra demo-commodities-copper");
  return ctx.reply([
    `${left.name} vs ${right.name}`,
    "",
    `${left.name}: ${left.riskLevel} risk, diversification ${left.diversification.score}/100, top assets ${left.assets.slice(0, 3).map((asset) => asset.ticker).join(", ")}`,
    `${right.name}: ${right.riskLevel} risk, diversification ${right.diversification.score}/100, top assets ${right.assets.slice(0, 3).map((asset) => asset.ticker).join(", ")}`,
    "",
    right.diversification.score > left.diversification.score
      ? `${right.name} is currently the more diversified basket.`
      : `${left.name} is currently the more diversified basket.`,
  ].join("\n"));
}

export async function onAsk(ctx: BotContextLike, question: string) {
  const clean = question.trim();
  if (!clean) return ctx.reply("Ask me a question after /ask, for example: /ask Which basket is more defensive?");
  try {
    const answer = await answerWithAdvisor(clean, buildBasketAdvisorContext());
    return ctx.reply(answer);
  } catch (error) {
    return ctx.reply(error instanceof Error ? `AI advisor error: ${error.message}` : "AI advisor failed.");
  }
}

export function formatPremiumBasketList() {
  return premiumBasketTemplates
    .map((basket) => `${basket.name} (${basket.id}) · ${basket.diversification.rating} · ${basket.assets.map((asset) => asset.ticker).join(", ")}`)
    .join("\n");
}
