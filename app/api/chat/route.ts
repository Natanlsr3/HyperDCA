import { NextRequest, NextResponse } from "next/server";
import { getBasketMetrics, formatForAIPrompt } from "@/lib/market/candles";

interface BasketContext {
  name: string;
  creator: string;
  theme: string;
  description: string;
  roi_30d: number;
  hit_rate: number;
  followers: number;
  assets: { coin: string; weight: number }[];
  /** Raw HL symbols for live price lookup */
  hlSymbols?: { coin: string; weight: number }[];
  drivers?: string[];
  risks?: string[];
  volatility?: string;
}

async function buildSystemPrompt(ctx: BasketContext | null): Promise<string> {
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

  // Fetch live market data for the basket assets
  let liveData = "";
  try {
    const lookupAssets = ctx.hlSymbols ?? ctx.assets;
    const metrics = await getBasketMetrics(
      lookupAssets.map((a) => ({ coin: a.coin, weight: a.weight })),
    );
    liveData = "\n\n" + formatForAIPrompt(metrics);
  } catch (e) {
    console.warn("[CHAT] Failed to fetch live prices:", e instanceof Error ? e.message : e);
  }

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
Followers: ${ctx.followers}${drivers}${risks}${liveData}

Use the live market data above to give informed, data-driven answers about current prices, trends, and basket performance. When discussing price movements, cite the actual numbers. Answer questions primarily about this basket. You can compare it with other HyperDCA baskets if asked.`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const message: string | undefined = body?.message;
  const history: { role: string; text: string }[] = body?.history ?? [];
  const basketContext: BasketContext | null = body?.basketContext ?? null;

  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  const systemPrompt = await buildSystemPrompt(basketContext);
  const contents: { role: string; parts: { text: string }[] }[] = [];

  for (const h of history.slice(-6)) {
    contents.push({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.text }] });
  }
  contents.push({ role: "user", parts: [{ text: message }] });

  try {
    // Use streaming endpoint + disable thinking for fast responses
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            maxOutputTokens: 256,
            temperature: 0.7,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("[CHAT] Gemini error:", response.status, err);
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }

    // Stream SSE chunks back to the client
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const data = JSON.parse(payload);
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: text })}\n\n`));
                }
              } catch { /* skip malformed chunks */ }
            }
          }
        } finally {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    console.error("[CHAT] Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
