import { getPremiumBasketTemplate, premiumBasketTemplates } from "@/lib/baskets/templates";

const SYSTEM_PROMPT = [
  "You are HyperDCA Assistant, a concise crypto portfolio helper inside Telegram.",
  "You can explain baskets, DCA, risk, leverage, funding, and app workflows.",
  "Do not provide personalized financial advice, guaranteed returns, or instructions to over-leverage.",
  "When asked for an action that changes funds, tell the user to confirm in the HyperDCA browser app.",
  "Keep answers short, practical, and clear.",
].join(" ");

export function isAdvisorConfigured() {
  return Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);
}

export function advisorProviderLabel() {
  if (process.env.AI_PROVIDER === "gemini" && process.env.GEMINI_API_KEY) return "Gemini";
  if (process.env.OPENAI_API_KEY) return "OpenAI";
  if (process.env.GEMINI_API_KEY) return "Gemini";
  return "not configured";
}

export async function answerWithAdvisor(message: string, context?: string) {
  const input = context ? `${context}\n\nUser question: ${message}` : message;
  if (process.env.AI_PROVIDER === "gemini" && process.env.GEMINI_API_KEY) {
    return answerWithGemini(input);
  }
  if (process.env.OPENAI_API_KEY) {
    return answerWithOpenAI(input);
  }
  if (process.env.GEMINI_API_KEY) {
    return answerWithGemini(input);
  }
  return "AI advisor is not configured yet. Add OPENAI_API_KEY or GEMINI_API_KEY to .env.local, then restart the bot.";
}

export function buildBasketAdvisorContext(basketId?: string) {
  const baskets = basketId
    ? premiumBasketTemplates.filter((basket) => basket.id === basketId || basket.name.toLowerCase().includes(basketId.toLowerCase()))
    : premiumBasketTemplates;
  return [
    "Available Base-Kets premium basket context:",
    ...baskets.map((basket) => [
      `Basket: ${basket.name} (${basket.id})`,
      `Creator: ${basket.creator}`,
      `Thesis: ${basket.thesis}`,
      `Risk: ${basket.riskLevel}; Diversification: ${basket.diversification.score}/100 ${basket.diversification.rating}`,
      `Assets: ${basket.assets.map((asset) => `${asset.ticker} ${(asset.weight * 100).toFixed(0)}% ${asset.sector}`).join(", ")}`,
      `What could go wrong: ${basket.whatCouldGoWrong.join("; ")}`,
    ].join("\n")),
  ].join("\n\n");
}

export function formatBasketThesis(basketId: string) {
  const basket = getPremiumBasketTemplate(basketId);
  if (!basket) return null;
  return [
    `${basket.name} thesis`,
    basket.thesis,
    "",
    `Risk: ${basket.riskLevel} · Diversification: ${basket.diversification.score}/100 (${basket.diversification.rating})`,
    "",
    "Drivers:",
    ...basket.marketDrivers.map((driver) => `- ${driver}`),
    "",
    "What could go wrong:",
    ...basket.whatCouldGoWrong.map((risk) => `- ${risk}`),
  ].join("\n");
}

async function answerWithOpenAI(message: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
      instructions: SYSTEM_PROMPT,
      input: message,
      max_output_tokens: 500,
    }),
  });
  const data = await response.json().catch(() => null) as { output_text?: string; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(data?.error?.message ?? `OpenAI HTTP ${response.status}`);
  return data?.output_text?.trim() || "I could not produce an answer.";
}

async function answerWithGemini(message: string) {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: message }] }],
      generationConfig: { maxOutputTokens: 500 },
    }),
  });
  const data = await response.json().catch(() => null) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  } | null;
  if (!response.ok) throw new Error(data?.error?.message ?? `Gemini HTTP ${response.status}`);
  return data?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() || "I could not produce an answer.";
}
