"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthUnavailable } from "@/components/auth-unavailable";
import { CompositionChart, PerformanceChart } from "@/components/baskets/charts";
import { PeriodSelector } from "@/components/period-selector";
import { getPremiumTemplateForBasket } from "@/lib/baskets/templates";
import type { PremiumBasketTemplate } from "@/lib/baskets/templates";
import { readJsonResponse } from "@/lib/http/client";
import { makeHistorySeries, periodLabel, seriesDelta, type CustomRange, type HistoryPeriod } from "@/lib/market/history";

interface BasketAsset {
  coin: string;
  weight: number;
  dex: string;
}

interface Basket {
  id: string;
  name: string;
  theme: string;
  description: string | null;
  roi_30d?: number;
  roi_ytd?: number;
  hit_rate?: number;
  followers_count?: number;
  basket_assets: BasketAsset[];
}

type Tab = "overview" | "assets" | "updates" | "thesis" | "agent";

export default function BasketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return <BasketDetailPublic params={params} />;
  return <BasketDetailAuthed params={params} />;
}

function BasketDetailAuthed({ params }: { params: Promise<{ id: string }> }) {
  const { authenticated, getAccessToken, login } = usePrivy();
  const [id, setId] = useState<string | null>(null);
  const [basket, setBasket] = useState<Basket | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    params.then((value) => setId(value.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const token = authenticated ? await getAccessToken() : null;
      const res = await fetch(`/api/baskets/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await readJsonResponse<{ basket?: Basket }>(res);
      setBasket(data.basket ?? null);
    })();
  }, [id, authenticated, getAccessToken]);

  async function authedPost(path: string, body?: Record<string, unknown>) {
    if (!authenticated) {
      login();
      return null;
    }
    const token = await getAccessToken();
    const res = await fetch(path, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await readJsonResponse<{ error?: string; trades?: unknown[] }>(res);
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  if (!basket) return <p className="text-[var(--text3)]">Loading basket...</p>;

  return (
    <BasketDetailView
      basket={basket}
      message={message}
      onFollow={async () => {
        try {
          await authedPost(`/api/baskets/${basket.id}/follow`, { mode: "manual" });
          setMessage("Basket followed. Telegram notifications are enabled if your chat is linked.");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Follow failed");
        }
      }}
      onMirror={async () => {
        try {
          const data = await authedPost(`/api/baskets/${basket.id}/mirror`, { execute: false });
          if (!data) return;
          setMessage(`Mirror plan ready: ${data.trades?.length ?? 0} trades. Confirm execution in browser.`);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Mirror failed");
        }
      }}
    />
  );
}

function BasketDetailPublic({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null);
  const [basket, setBasket] = useState<Basket | null>(null);

  useEffect(() => {
    params.then((value) => setId(value.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/baskets/${id}`)
      .then((res) => readJsonResponse<{ basket?: Basket }>(res))
      .then((data) => setBasket(data.basket ?? null));
  }, [id]);

  if (!basket) return <p className="text-[var(--text3)]">Loading basket...</p>;
  return <BasketDetailView basket={basket} authUnavailable />;
}

function BasketDetailView({
  basket,
  authUnavailable,
  message,
  onFollow,
  onMirror,
}: {
  basket: Basket;
  authUnavailable?: boolean;
  message?: string | null;
  onFollow?: () => void;
  onMirror?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<HistoryPeriod>("1m");
  const [customRange, setCustomRange] = useState<CustomRange>({});
  const [mirrorOpen, setMirrorOpen] = useState(false);
  const premium = getPremiumTemplateForBasket(basket);

  // Fetch real chart data from Hyperliquid
  const syntheticSeries = makeHistorySeries(basket.id, period, customRange, basket.roi_30d ?? 0.18);
  const [realSeries, setRealSeries] = useState<{ label: string; value: number }[] | null>(null);
  const [realLoading, setRealLoading] = useState(false);

  useEffect(() => {
    if (period === "custom") return; // custom uses synthetic
    setRealLoading(true);
    const assetsParam = basket.basket_assets
      .map((a) => `${a.coin}:${a.weight}`)
      .join(",");
    fetch(`/api/market/history?assets=${encodeURIComponent(assetsParam)}&period=${period}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.series?.length > 0) {
          setRealSeries(data.series);
        }
      })
      .catch(() => { /* use synthetic fallback */ })
      .finally(() => setRealLoading(false));
  }, [basket.basket_assets, period]);

  const series = realSeries ?? syntheticSeries;
  const delta = seriesDelta(series);
  const assets = premium?.assets ?? basket.basket_assets.map((asset) => {
    const idx = asset.coin.indexOf(":");
    const displayName = idx >= 0 ? asset.coin.slice(idx + 1) : asset.coin;
    return {
      coin: displayName,
      ticker: asset.coin,
      sector: asset.dex === "xyz" ? "Equities / Commodities" : "Crypto Perpetuals",
      role: "Basket exposure",
      risk: "Medium" as const,
      weight: Number(asset.weight),
    };
  });

  return (
    <div>
      <Link href="/baskets" className="mb-[18px] inline-flex text-[13px] font-semibold text-[var(--text2)] no-underline">‹ Discover</Link>

      <section className="premium-hero">
        <div className="premium-hero-main">
          <div className="premium-icon">{premium?.icon ?? basket.name.slice(0, 2)}</div>
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h1>{basket.name}</h1>
              <span className="basket-tag">{premium?.volatility ?? "Strategy basket"}</span>
            </div>
            <p className="premium-manager">by {premium?.creator ?? basket.theme}</p>
            <p className="premium-description">{premium?.shortDescription ?? basket.description}</p>
          </div>
        </div>
        <aside className="premium-cta">
          <Metric label="ROI 30d" value={`${((basket.roi_30d ?? 0) * 100).toFixed(1)}%`} tone="positive" />
          <Metric label="Diversification" value={premium ? `${premium.diversification.score}/100` : "—"} />
          <button className="btn w-full py-[11px]" onClick={() => setMirrorOpen(true)}>Mirror basket</button>
          <button className="btn-secondary w-full py-[11px]" disabled={authUnavailable} onClick={onFollow}>Add to watchlist</button>
        </aside>
      </section>

      {authUnavailable ? <div className="mb-5"><AuthUnavailable /></div> : null}
      {message ? <p className="mb-5 rounded-[8px] border border-[var(--border)] bg-[var(--accentSoft)] p-3 text-sm text-[var(--accentText)]">{message}</p> : null}

      <div className="premium-tabs">
        {[
          ["overview", "Overview"],
          ["assets", "Assets & Weights"],
          ["updates", "Updates"],
          ["thesis", "Thesis"],
          ["agent", "AI Agent"],
        ].map(([value, label]) => (
          <button key={value} className={activeTab === value ? "active" : ""} onClick={() => setActiveTab(value as Tab)}>{label}</button>
        ))}
      </div>

      <div className="premium-layout">
        <main>
          {activeTab === "overview" ? <OverviewTab basket={basket} premium={premium} period={period} customRange={customRange} setPeriod={setPeriod} setCustomRange={setCustomRange} series={series} delta={delta} /> : null}
          {activeTab === "assets" ? <AssetsTab assets={assets} /> : null}
          {activeTab === "updates" ? <UpdatesTab premium={premium} /> : null}
          {activeTab === "thesis" ? <ThesisTab premium={premium} /> : null}
          {activeTab === "agent" ? <AgentTab premium={premium} basket={basket} /> : null}
        </main>
        <aside className="premium-side">
          <Metric label="Minimum mirror amount" value={`$${(premium?.minimumInvestmentUsd ?? 250).toLocaleString()}`} />
          <Metric label="Hit rate" value={`${((basket.hit_rate ?? 0) * 100).toFixed(0)}%`} />
          <Metric label="Followers" value={`${basket.followers_count ?? 0}`} />
          {premium ? (
            <div className="side-note">
              <strong>{premium.diversification.rating}</strong>
              <p>{premium.diversification.notes.join(". ")}.</p>
            </div>
          ) : null}
        </aside>
      </div>

      {mirrorOpen ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <h2 className="mb-2 text-[18px] font-bold tracking-[-0.01em] text-[var(--text)]">Mirror {basket.name}</h2>
            <p className="mb-4 text-[15px] text-[var(--text2)]">Preview the plan first. Live execution still requires browser confirmation.</p>
            {authUnavailable ? <AuthUnavailable /> : <button className="btn w-full py-[11px]" onClick={() => { setMirrorOpen(false); onMirror?.(); }}>Run dry-run mirror</button>}
            <button className="btn-secondary mt-3 w-full py-[11px]" onClick={() => setMirrorOpen(false)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OverviewTab({ basket, premium, period, customRange, setPeriod, setCustomRange, series, delta }: {
  basket: Basket;
  premium: PremiumBasketTemplate | null;
  period: HistoryPeriod;
  customRange: CustomRange;
  setPeriod: (period: HistoryPeriod) => void;
  setCustomRange: (range: CustomRange) => void;
  series: ReturnType<typeof makeHistorySeries>;
  delta: number;
}) {
  return (
    <div className="space-y-[18px]">
      <section className="card p-[22px]">
        <h2 className="premium-section-title">About this basket</h2>
        <p className="premium-copy">{premium?.thesis ?? basket.description}</p>
        {premium ? (
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <InfoLink title="Methodology" detail={premium.methodology} />
            <InfoLink title="Target user" detail={premium.targetUser} />
            <InfoLink title="Rebalance logic" detail={premium.rebalanceLogic} />
          </div>
        ) : null}
      </section>

      <section className="card p-[22px]">
        <div className="mb-[14px] flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="premium-section-title">Performance</h2>
            <p className="m-0 text-[12px] font-medium text-[var(--text3)]">{periodLabel(period, customRange)} · <span className={delta >= 0 ? "text-[var(--pos)]" : "text-[var(--neg)]"}>{delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)}%</span></p>
          </div>
          <PeriodSelector period={period} customRange={customRange} onPeriodChange={setPeriod} onCustomRangeChange={setCustomRange} />
        </div>
        <PerformanceChart roi30d={basket.roi_30d} series={series} />
      </section>

      <section className="card p-[22px]">
        <h2 className="premium-section-title">Costs and returns</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="Estimated carry" value="Variable" />
          <Metric label="Execution mode" value="Dry-run first" />
          <Metric label="Risk level" value={premium?.riskLevel ?? "Medium"} />
        </div>
      </section>
    </div>
  );
}

function AssetsTab({ assets }: { assets: { coin: string; ticker: string; sector: string; role: string; risk: string; weight: number }[] }) {
  return (
    <section className="card p-[22px]">
      <div className="mb-6 grid gap-6 xl:grid-cols-[360px_1fr]">
        <CompositionChart assets={assets.map((asset) => ({ coin: asset.coin, weight: asset.weight }))} />
        <div>
          <h2 className="premium-section-title">Assets & weights</h2>
          <p className="premium-copy">Weights are target allocations. HIP-3 tickers keep their exchange prefix, such as xyz:COPPER, so execution can route to the right market.</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-[12px] border border-[var(--border)]">
        <table className="data-table">
          <thead><tr><th>Asset</th><th>Ticker</th><th>Sector</th><th>Role</th><th>Risk</th><th className="text-right">Weight</th></tr></thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.ticker}>
                <td className="font-semibold text-[var(--text)]">{asset.coin}</td>
                <td className="mono text-[12px] text-[var(--text2)]">{asset.ticker}</td>
                <td>{asset.sector}</td>
                <td>{asset.role}</td>
                <td><span className="basket-tag">{asset.risk}</span></td>
                <td className="mono text-right font-semibold">{Math.round(asset.weight * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UpdatesTab({ premium }: { premium: PremiumBasketTemplate | null }) {
  return (
    <section className="card p-[22px]">
      <h2 className="premium-section-title">Updates</h2>
      <div className="mt-4 divide-y divide-[var(--border)]">
        {(premium?.updates ?? []).map((update) => (
          <article key={update.title} className="py-5 first:pt-0">
            <div className="mb-2 flex items-center gap-2">
              <div className="premium-avatar">AI</div>
              <div>
                <p className="m-0 text-[14px] font-semibold text-[var(--text)]">{premium?.creator}</p>
                <p className="m-0 text-[12px] text-[var(--text3)]">{update.date}</p>
              </div>
              {update.visibility === "subscribers" ? <span className="basket-tag">Subscribers only</span> : null}
            </div>
            <h3 className="mb-2 text-[15px] font-bold text-[var(--text)]">{update.title}</h3>
            <p className="m-0 text-[14px] text-[var(--text2)]">{update.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ThesisTab({ premium }: { premium: PremiumBasketTemplate | null }) {
  if (!premium) return <section className="card p-[22px]"><p>No thesis available yet.</p></section>;
  return (
    <section className="card p-[22px]">
      <h2 className="premium-section-title">AI-assisted thesis</h2>
      <p className="premium-copy">{premium.thesis}</p>
      <ThesisList title="Market drivers" items={premium.marketDrivers} />
      <ThesisList title="Selection logic" items={premium.selectionLogic} />
      <ThesisList title="What could go wrong" items={premium.whatCouldGoWrong} />
    </section>
  );
}

function AgentTab({ premium, basket }: { premium: PremiumBasketTemplate | null; basket: Basket }) {
  const [messages, setMessages] = useState<{ role: "user" | "bot"; text: string }[]>([
    { role: "bot", text: `Hi! I have context on ${basket.name}. Ask me about allocations, risk, or comparisons.` },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ role: string; text: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Build basket context once — sent with every request so the agent knows this basket
  const basketContext = useMemo(() => ({
    name: basket.name,
    creator: premium?.creator ?? basket.theme,
    theme: basket.theme,
    description: premium?.shortDescription ?? basket.description ?? "",
    roi_30d: basket.roi_30d ?? 0,
    hit_rate: basket.hit_rate ?? 0,
    followers: basket.followers_count ?? 0,
    assets: (premium?.assets ?? basket.basket_assets).map((a) => {
      const coin = a.coin;
      const idx = coin.indexOf(":");
      return { coin: idx >= 0 ? coin.slice(idx + 1) : coin, weight: "weight" in a ? Number(a.weight) : 0 };
    }),
    // Pass raw HL symbols so the server can fetch live prices
    hlSymbols: basket.basket_assets.map((a) => ({
      coin: a.coin,
      weight: Number(a.weight),
    })),
    drivers: premium?.marketDrivers,
    risks: premium?.whatCouldGoWrong,
    volatility: premium?.volatility,
  }), [basket, premium]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    const userMsg = text.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history, basketContext }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "AI service error");
      }

      // Stream SSE tokens into the chat
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullReply = "";
      let sseBuffer = "";

      // Add empty bot message that we'll fill progressively
      setMessages((prev) => [...prev, { role: "bot", text: "" }]);
      setLoading(false); // hide dots — text is streaming

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const chunk = JSON.parse(payload);
            if (chunk.t) {
              fullReply += chunk.t;
              const snapshot = fullReply;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "bot", text: snapshot };
                return updated;
              });
            }
          } catch { /* skip malformed */ }
        }
      }

      if (!fullReply) fullReply = "Sorry, I couldn't generate a response.";
      setHistory((prev) => [...prev, { role: "user", text: userMsg }, { role: "model", text: fullReply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "bot", text: "Connection error. Try again." }]);
      setLoading(false);
    }
  }

  return (
    <section className="card overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[var(--accent)] text-[12px] font-bold text-white">AI</div>
          <div>
            <p className="m-0 text-[14px] font-semibold text-[var(--text)]">HyperDCA Agent</p>
            <p className="m-0 text-[11px] text-[var(--text3)]">Context: {basketContext.assets.length} assets · {basketContext.drivers?.length ?? 0} drivers · {basket.name}</p>
          </div>
        </div>
        <span className="rounded-full bg-[var(--pos)] px-2 py-[2px] text-[10px] font-bold text-white">Online</span>
      </div>

      <div className="flex h-[340px] flex-col gap-[10px] overflow-y-auto px-4 py-3" style={{ scrollBehavior: "smooth" }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[82%] rounded-[14px] px-[14px] py-[10px] text-[13px] font-medium leading-[1.5] ${
              msg.role === "bot"
                ? "self-start rounded-bl-[4px] bg-[var(--accentSoft)] text-[var(--text)]"
                : "self-end rounded-br-[4px] bg-[var(--accent)] text-white"
            }`}
          >
            {msg.text}
          </div>
        ))}
        {loading ? (
          <div className="flex max-w-[82%] items-center gap-[6px] self-start rounded-[14px] rounded-bl-[4px] bg-[var(--surface3,#f1f5f9)] px-[14px] py-[10px] text-[13px] text-[var(--text3)]">
            <span className="inline-block h-[6px] w-[6px] animate-bounce rounded-full bg-[var(--text3)]" style={{ animationDelay: "0ms" }} />
            <span className="inline-block h-[6px] w-[6px] animate-bounce rounded-full bg-[var(--text3)]" style={{ animationDelay: "150ms" }} />
            <span className="inline-block h-[6px] w-[6px] animate-bounce rounded-full bg-[var(--text3)]" style={{ animationDelay: "300ms" }} />
          </div>
        ) : null}
        <div ref={chatEndRef} />
      </div>

      <form
        className="flex gap-2 border-t border-[var(--border)] bg-[var(--surface2)] p-3"
        onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this basket..."
          disabled={loading}
          className="min-w-0 flex-1 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 py-[10px] text-[13px] font-medium text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="btn rounded-[10px] px-4 py-[10px] text-[13px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div className="stat-card">
      <p className="label">{label}</p>
      <p className={`mono text-[22px] font-semibold tracking-[-0.01em] ${tone === "positive" ? "text-[var(--pos)]" : tone === "negative" ? "text-[var(--neg)]" : "text-[var(--text)]"}`}>{value}</p>
    </div>
  );
}

function InfoLink({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface2)] p-4"><h3 className="mb-1 text-[14px] font-semibold text-[var(--accentText)]">{title}</h3><p className="m-0 text-[13px] text-[var(--text2)]">{detail}</p></div>;
}

function ThesisList({ title, items }: { title: string; items: string[] }) {
  return <div className="mt-6"><h3 className="mb-3 text-[15px] font-bold text-[var(--text)]">{title}</h3><ul className="m-0 space-y-2 pl-5 text-[14px] text-[var(--text2)]">{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}
