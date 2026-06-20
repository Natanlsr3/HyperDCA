import { NextRequest, NextResponse } from "next/server";

interface BasketContext {
  name: string;
  creator: string;
  theme: string;
  description: string;
  roi_30d: number;
  hit_rate: number;
  followers: number;
  assets: { coin: string; weight: number }[];
  drivers?: string[];
  risks?: string[];
  volatility?: string;
}

function buildSystemPrompt(ctx: BasketContext | null): string {
  const base = `You are the HyperDCA AI assistant embedded in a basket detail page.
HyperDCA is a multi-asset portfolio agent on HyperLiquid that lets users deploy capital across stocks, crypto, and commodities via curated baskets.

General info:
- All baskets use USDC as collateral
- Leverage: 1x to 5x configurable per schedule
- DCA frequency: minimum hourly, typically daily
- Agent suggests trades, user always approves (non-custodial)
- Built on HyperLiquid L1 with HyperCore (main dex) and HIP-3 (xyz dex)

Be helpful, concise (2-4 sentences max), and conversational. If asked about something outside HyperDCA, politely redirect. Use plain english, no markdown.`;

  if (!ctx) return base;

  const alloc = ctx.assets.map((a) => `${a.coin} ${Math.round(a.weight * 100)}%`).join(", ");
  const drivers = ctx.drivers?.length ? `\nMarket drivers: ${ctx.drivers.join("; ")}` : "";
  const risks = ctx.risks?.length ? `\nRisks: ${ctx.risks.join("; ")}` : "";

  return `${base}

You are currently on the detail page of this basket — it is your PRIMARY context:

Basket: ${ctx.name}
Creator: ${ctx.creator}
Theme: ${ctx.theme}
Description: ${ctx.description}
Volatility: ${ctx.volatility ?? "Medium"}
Allocation: ${alloc}
ROI 30d: ${(ctx.roi_30d * 100).toFixed(1)}%
Hit rate: ${(ctx.hit_rate * 100).toFixed(0)}%
Followers: ${ctx.followers}${drivers}${risks}

Answer questions primarily about this basket. You can compare it with other HyperDCA baskets if asked.`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const message: string | undefined = body?.message;
  const history: { role: string; text: string }[] = body?.history ?? [];
  const basketContext: BasketContext | null = body?.basketContext ?? null;

  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  const systemPrompt = buildSystemPrompt(basketContext);
  const contents: { role: string; parts: { text: string }[] }[] = [];

  for (const h of history.slice(-6)) {
    contents.push({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.text }] });
  }
  contents.push({ role: "user", parts: [{ text: message }] });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: 256, temperature: 0.7 },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("[CHAT] Gemini error:", response.status, err);
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sorry, I couldn't generate a response.";
    return NextResponse.json({ reply });
  } catch (e) {
    console.error("[CHAT] Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
