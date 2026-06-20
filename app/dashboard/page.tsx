"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthUnavailable } from "@/components/auth-unavailable";
import { readJsonResponse } from "@/lib/http/client";
import { PeriodSelector } from "@/components/period-selector";
import { PerformanceChart } from "@/components/baskets/charts";
import { makeHistorySeries, periodLabel, seriesDelta, type CustomRange, type HistoryPeriod } from "@/lib/market/history";

interface Position {
  coin: string;
  szi: number;
  entryPx: number;
  positionValue: number;
  unrealizedPnl: number;
  liquidationPx: number | null;
}

interface Schedule {
  id: string;
  amount_usd: number;
  leverage: number;
  status: string;
  baskets: { name: string; theme: string };
}

interface FollowedBasket {
  id: string;
  follow_mode: string;
  baskets: { id: string; name: string; theme: string } | null;
}

interface MirrorExecution {
  id: string;
  success: boolean;
  execution_time: string;
  trades_executed: unknown[];
  baskets: { name: string } | null;
}

const strategyPortfolios = [
  {
    id: "core-compound",
    name: "Core compound",
    strategy: "Majors momentum with controlled leverage",
    drift: 0.24,
    accountValue: 12480,
    carryPct: 8.4,
    positions: [
      { coin: "BTC", weight: 35 },
      { coin: "ETH", weight: 28 },
      { coin: "SOL", weight: 22 },
      { coin: "HYPE", weight: 15 },
    ],
  },
  {
    id: "ai-beta",
    name: "AI beta",
    strategy: "Higher volatility equity-perp sleeve",
    drift: 0.36,
    accountValue: 8650,
    carryPct: 12.1,
    positions: [
      { coin: "NVDA", weight: 40 },
      { coin: "AMD", weight: 25 },
      { coin: "TSLA", weight: 20 },
      { coin: "HYPE", weight: 15 },
    ],
  },
  {
    id: "carry-defense",
    name: "Carry defense",
    strategy: "Funding-aware defensive rotation",
    drift: 0.13,
    accountValue: 5920,
    carryPct: 5.7,
    positions: [
      { coin: "ETH", weight: 34 },
      { coin: "LINK", weight: 24 },
      { coin: "AAVE", weight: 22 },
      { coin: "UNI", weight: 20 },
    ],
  },
];

export default function DashboardPage() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return <AuthUnavailable />;
  return <DashboardContent />;
}

function DashboardContent() {
  const { authenticated, getAccessToken, login } = usePrivy();
  const [positions, setPositions] = useState<Position[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [followedBaskets, setFollowedBaskets] = useState<FollowedBasket[]>([]);
  const [mirrorHistory, setMirrorHistory] = useState<MirrorExecution[]>([]);
  const [accountValue, setAccountValue] = useState(0);
  const [carryPct, setCarryPct] = useState<number | null>(null);
  const [guardrail, setGuardrail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);
  const [activePortfolioId, setActivePortfolioId] = useState(strategyPortfolios[0].id);
  const [period, setPeriod] = useState<HistoryPeriod>("1m");
  const [customRange, setCustomRange] = useState<CustomRange>({});
  const activePortfolio = useMemo(
    () => strategyPortfolios.find((portfolio) => portfolio.id === activePortfolioId) ?? strategyPortfolios[0],
    [activePortfolioId],
  );
  const portfolioSeries = useMemo(
    () => makeHistorySeries(activePortfolio.id, period, customRange, activePortfolio.drift),
    [activePortfolio, customRange, period],
  );
  const portfolioDelta = seriesDelta(portfolioSeries);
  const displayedAccountValue = accountValue > 0 ? accountValue : activePortfolio.accountValue;
  const displayedCarry = carryPct ?? activePortfolio.carryPct;

  useEffect(() => {
    if (!authenticated) return;
    (async () => {
      try {
        const token = await getAccessToken();
        const [portRes, schedRes] = await Promise.all([
          fetch("/api/portfolio", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/schedules", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const port = await readJsonResponse<{
          error?: string;
          demo?: boolean;
          message?: string;
          positions?: Position[];
          accountValue?: number;
          guardrailFlagged?: boolean;
          schedules?: Schedule[];
          baskets_followed?: FollowedBasket[];
          mirror_history?: MirrorExecution[];
          carry?: { basketAnnualizedPct: number };
        }>(portRes);
        const sched = await readJsonResponse<{ schedules?: Schedule[] }>(schedRes);
        if (port.error) throw new Error(port.error);
        setDemoNotice(port.demo ? port.message ?? "Portfolio unlocks when Supabase is connected." : null);
        setPositions(port.positions ?? []);
        setAccountValue(port.accountValue ?? 0);
        setGuardrail(port.guardrailFlagged ?? false);
        setSchedules(sched.schedules ?? []);
        setFollowedBaskets(port.baskets_followed ?? []);
        setMirrorHistory(port.mirror_history ?? []);
        if (port.carry) setCarryPct(port.carry.basketAnnualizedPct);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, [authenticated, getAccessToken]);

  if (!authenticated) {
    return (
      <div className="card text-center space-y-4">
        <p>Sign in to view your HyperLiquid portfolio.</p>
        <button className="btn" onClick={login}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="design-h1">Portfolio</h1>
          <p className="design-subtitle mb-0">Switch strategies and inspect how the selected allocation behaved over time.</p>
        </div>
        <select className="input w-full lg:w-[280px]" value={activePortfolioId} onChange={(event) => setActivePortfolioId(event.target.value)}>
          {strategyPortfolios.map((portfolio) => (
            <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>
          ))}
        </select>
      </div>
      {demoNotice && (
        <div className="card border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-semibold">Demo database mode</p>
          <p className="mt-1 text-sm">{demoNotice}</p>
        </div>
      )}
      {error && <p className="text-red-400">{error}</p>}
      {guardrail && (
        <div className="card border-red-800 bg-red-950/30 text-red-300">
          Liquidation guardrail triggered — review leverage and margin.
        </div>
      )}

      <section className="card p-[22px]">
        <div className="mb-[16px] flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="m-0 text-[18px] font-bold tracking-[-0.01em] text-[var(--text)]">{activePortfolio.name}</h2>
            <p className="mt-1 text-[13px] font-medium text-[var(--text2)]">{activePortfolio.strategy}</p>
            <p className="mt-2 text-[12px] font-semibold text-[var(--text3)]">
              {periodLabel(period, customRange)} · <span className={portfolioDelta >= 0 ? "text-[var(--pos)]" : "text-[var(--neg)]"}>{portfolioDelta >= 0 ? "+" : ""}{(portfolioDelta * 100).toFixed(1)}%</span>
            </p>
          </div>
          <PeriodSelector period={period} customRange={customRange} onPeriodChange={setPeriod} onCustomRangeChange={setCustomRange} />
        </div>
        <PerformanceChart series={portfolioSeries} />
      </section>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="label">Account value</p>
          <p className="text-2xl font-semibold">${displayedAccountValue.toFixed(2)}</p>
        </div>
        <div className="card">
          <p className="label">Strategy assets</p>
          <p className="text-2xl font-semibold">{activePortfolio.positions.length}</p>
        </div>
        <div className="card">
          <p className="label">Est. carry (if set)</p>
          <p className="text-2xl font-semibold">{displayedCarry.toFixed(1)}%/yr</p>
        </div>
      </div>

      <section className="card p-[18px]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="m-0 text-[15px] font-semibold text-[var(--text)]">Strategy allocation</h2>
          <span className="mono text-[12px] text-[var(--text3)]">{activePortfolio.name}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {activePortfolio.positions.map((position) => (
            <div key={position.coin} className="rounded-[8px] border border-[var(--border)] bg-[var(--surface2)] p-3">
              <div className="mono text-[14px] font-semibold text-[var(--text)]">{position.coin}</div>
              <div className="mt-2 h-2 rounded-full bg-[var(--surface3)]">
                <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${position.weight}%` }} />
              </div>
              <div className="mono mt-2 text-[12px] font-semibold text-[var(--text2)]">{position.weight}%</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Positions</h2>
        {positions.length === 0 ? (
          <p className="text-zinc-500 text-sm">No open positions on HyperLiquid.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-zinc-500 text-left">
                <tr>
                  <th className="py-2">Coin</th>
                  <th>Size</th>
                  <th>Entry</th>
                  <th>Value</th>
                  <th>uPnL</th>
                  <th>Liq px</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.coin} className="border-t border-zinc-800">
                    <td className="py-2">{p.coin}</td>
                    <td>{p.szi}</td>
                    <td>${p.entryPx.toFixed(2)}</td>
                    <td>${p.positionValue.toFixed(2)}</td>
                    <td className={p.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400"}>
                      ${p.unrealizedPnl.toFixed(2)}
                    </td>
                    <td>{p.liquidationPx?.toFixed(2) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold">Active schedules</h2>
          <Link href="/baskets" className="text-sm text-cyan-400">
            + New schedule
          </Link>
        </div>
        {schedules.map((s) => (
          <div key={s.id} className="card flex justify-between items-center">
            <div>
              <p className="font-medium">{s.baskets?.name}</p>
              <p className="text-sm text-zinc-500">
                ${s.amount_usd}/cycle · {s.leverage}x · {s.status}
              </p>
            </div>
            <CloseButton scheduleId={s.id} getAccessToken={getAccessToken} />
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Followed baskets</h2>
        {followedBaskets.length === 0 ? (
          <p className="text-zinc-500 text-sm">No followed baskets yet.</p>
        ) : (
          followedBaskets.map((follow) => (
            <div key={follow.id} className="card flex justify-between items-center">
              <div>
                <p className="font-medium">{follow.baskets?.name}</p>
                <p className="text-sm text-zinc-500">{follow.follow_mode} follow mode</p>
              </div>
              {follow.baskets?.id && (
                <Link href={`/baskets/${follow.baskets.id}`} className="text-sm">
                  View
                </Link>
              )}
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Mirror history</h2>
        {mirrorHistory.length === 0 ? (
          <p className="text-zinc-500 text-sm">No mirror executions yet.</p>
        ) : (
          mirrorHistory.map((execution) => (
            <div key={execution.id} className="card flex justify-between gap-4">
              <div>
                <p className="font-medium">{execution.baskets?.name ?? "Basket"}</p>
                <p className="text-sm text-zinc-500">
                  {new Date(execution.execution_time).toLocaleString()} · {execution.trades_executed.length} trades
                </p>
              </div>
              <span className={execution.success ? "text-green-400" : "text-red-400"}>
                {execution.success ? "success" : "failed"}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function CloseButton({
  scheduleId,
  getAccessToken,
}: {
  scheduleId: string;
  getAccessToken: () => Promise<string | null>;
}) {
  const [loading, setLoading] = useState(false);

  async function close() {
    setLoading(true);
    try {
      const token = await getAccessToken();
      await fetch(`/api/schedules/${scheduleId}/close`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button className="text-sm text-red-400 border border-red-900 rounded px-3 py-1" disabled={loading} onClick={close}>
      Close basket
    </button>
  );
}
