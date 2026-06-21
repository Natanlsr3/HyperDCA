"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthUnavailable } from "@/components/auth-unavailable";
import { DepositForm } from "@/components/deposit-form";
import { WithdrawForm } from "@/components/withdraw-form";
import { SendForm } from "@/components/send-form";
import { ExportKeyButton } from "@/components/export-key-button";
import { useArbitrumBalances } from "@/lib/wallet/arbitrum-balances";
import { PeriodSelector } from "@/components/period-selector";
import { PerformanceChart } from "@/components/baskets/charts";
import { makeHistorySeries, periodLabel, seriesDelta, type CustomRange, type HistoryPeriod } from "@/lib/market/history";

interface Position {
  coin: string;
  dex: string;
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
  const { wallets } = useWallets();
  const address = wallets.find((w) => w.walletClientType === "privy")?.address ?? null;
  const { usdc, eth, loading: balLoading, refresh: refreshBalances } = useArbitrumBalances(address);

  const [copied, setCopied] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [followedBaskets, setFollowedBaskets] = useState<FollowedBasket[]>([]);
  const [mirrorHistory, setMirrorHistory] = useState<MirrorExecution[]>([]);
  const [accountValue, setAccountValue] = useState(0);
  const [withdrawable, setWithdrawable] = useState<number | null>(null);
  const [allTimePnl, setAllTimePnl] = useState<number | null>(null);
  const [hlTestnet, setHlTestnet] = useState(false);
  const [hlLoading, setHlLoading] = useState(false);
  const [carryPct, setCarryPct] = useState<number | null>(null);
  const [guardrail, setGuardrail] = useState(false);
  const [portfolioMessage, setPortfolioMessage] = useState<string | null>(null);
  const [schedulesError, setSchedulesError] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState(true);
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

  const refreshPortfolio = useCallback(async () => {
    setHlLoading(true);
    setPortfolioMessage(null);
    setSchedulesError(null);
    try {
      const token = await getAccessToken();
      const [portRes, schedRes, onboardRes] = await Promise.all([
        fetch("/api/portfolio", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/schedules", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/onboarding", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const port = await portRes.json();
      const sched = await schedRes.json();
      const onboard = await onboardRes.json();

      if (port.error) {
        if (portRes.status === 400 && port.error === "Wallet not linked") {
          setPortfolioMessage("Wallet not linked yet — HyperLiquid balances and positions will appear after setup.");
        } else {
          setPortfolioMessage("HyperLiquid data is temporarily unavailable.");
        }
        setPositions([]);
        setAccountValue(0);
        setWithdrawable(null);
        setAllTimePnl(null);
        setCarryPct(null);
        setGuardrail(false);
      } else {
        setPositions(port.positions ?? []);
        setAccountValue(port.accountValue ?? 0);
        setWithdrawable(port.withdrawable ?? 0);
        setAllTimePnl(typeof port.allTimePnl === "number" ? port.allTimePnl : null);
        setHlTestnet(Boolean(port.isTestnet));
        setGuardrail(port.guardrailFlagged ?? false);
        setFollowedBaskets(port.baskets_followed ?? []);
        setMirrorHistory(port.mirror_history ?? []);
        if (port.carry) setCarryPct(port.carry.basketAnnualizedPct);
      }

      if (sched.error) {
        setSchedulesError(sched.error);
        setSchedules([]);
      } else {
        setSchedules(sched.schedules ?? []);
      }

      if (!onboard.error) {
        setOnboarded(Boolean(onboard.onboarded));
      }
    } catch {
      setPortfolioMessage("Failed to refresh dashboard data.");
    } finally {
      setHlLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (!authenticated) return;
    void refreshPortfolio();
  }, [authenticated, refreshPortfolio]);

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

      {!onboarded && (
        <div className="card border-amber-800 bg-amber-950/30 text-amber-200 text-sm">
          Account setup incomplete — approve your agent on HyperLiquid before schedules can execute.{" "}
          <Link href="/onboarding" className="text-amber-400 underline">
            Complete setup
          </Link>
        </div>
      )}

      {portfolioMessage && (
        <p className="text-zinc-500 text-sm">{portfolioMessage}</p>
      )}

      {guardrail && positions.length > 0 && (
        <div className="card border-red-800 bg-red-950/30 text-red-300">
          Liquidation guardrail triggered — review leverage and margin.
        </div>
      )}

      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="label">Your HyperLiquid account (master wallet)</p>
            <p className="font-mono text-sm break-all">{address ?? "Creating wallet..."}</p>
          </div>
          {address && (
            <button
              className="text-xs border border-zinc-700 rounded px-3 py-1 text-zinc-300"
              onClick={() => {
                navigator.clipboard.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-zinc-800 pt-3">
          <div>
            <p className="label">USDC on Arbitrum One</p>
            <p className="text-lg font-semibold">
              {balLoading && usdc === null ? "..." : `${(usdc ?? 0).toFixed(2)} USDC`}
            </p>
          </div>
          <div>
            <p className="label">ETH (for gas)</p>
            <p className={`text-lg font-semibold ${eth !== null && eth < 0.00005 ? "text-red-400" : ""}`}>
              {balLoading && eth === null ? "..." : `${(eth ?? 0).toFixed(5)} ETH`}
            </p>
          </div>
        </div>
        {eth !== null && eth < 0.00005 && (
          <p className="text-xs text-red-400">
            No ETH for gas on Arbitrum One. Sending USDC to HyperLiquid is paid by you and needs a little ETH — send ~$1 of ETH to the address above to enable deposits.
          </p>
        )}
        <div className="text-xs text-zinc-500 leading-relaxed border-t border-zinc-800 pt-3">
          <p className="text-zinc-400 font-medium mb-1">How to add funds</p>
          1. Send <span className="text-zinc-300">USDC on Arbitrum</span> (plus a little ETH for gas) to the address above — from a CEX withdrawal to Arbitrum, or by bridging from another chain.<br />
          2. Then use <span className="text-zinc-300">Deposit to HyperLiquid</span> below to move that USDC into your HL trading account. Your balance updates once it arrives.<br />
          <span className="text-zinc-600">This wallet is managed in-app, so deposits happen here (not on app.hyperliquid.xyz). HyperLiquid&apos;s bridge is Arbitrum &harr; HL; trading is gas-free.</span>
        </div>
        <DepositForm
          usdc={usdc}
          eth={eth}
          balLoading={balLoading}
          refreshBalances={refreshBalances}
        />
        <WithdrawForm
          withdrawable={withdrawable}
          hlLoading={hlLoading}
          isTestnet={hlTestnet}
          refreshHlBalance={refreshPortfolio}
          refreshArbitrumBalances={refreshBalances}
        />
        <SendForm
          usdc={usdc}
          eth={eth}
          balLoading={balLoading}
          refreshBalances={refreshBalances}
        />
        <ExportKeyButton />
      </div>

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

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="label">Account value</p>
          <p className="text-2xl font-semibold">${displayedAccountValue.toFixed(2)}</p>
          {withdrawable !== null && (
            <p className="text-xs text-zinc-500 mt-1">
              Withdrawable: {hlLoading ? "..." : `$${withdrawable.toFixed(2)}`}
            </p>
          )}
        </div>
        <div className="card">
          <p className="label">All-time PnL</p>
          <p
            className={`text-2xl font-semibold ${
              allTimePnl === null ? "" : allTimePnl >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {hlLoading && allTimePnl === null
              ? "..."
              : allTimePnl === null
                ? "—"
                : `${allTimePnl >= 0 ? "+" : "-"}$${Math.abs(allTimePnl).toFixed(2)}`}
          </p>
          <p className="text-xs text-zinc-500 mt-1">Trading only (excl. deposits/withdrawals)</p>
        </div>
        <div className="card">
          <p className="label">Open positions</p>
          <p className="text-2xl font-semibold">{positions.length}</p>
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={`${p.dex}:${p.coin}`} className="border-t border-zinc-800">
                    <td className="py-2">{p.coin}</td>
                    <td>{p.szi}</td>
                    <td>${p.entryPx.toFixed(2)}</td>
                    <td>${p.positionValue.toFixed(2)}</td>
                    <td className={p.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400"}>
                      ${p.unrealizedPnl.toFixed(2)}
                    </td>
                    <td>{p.liquidationPx?.toFixed(2) ?? "—"}</td>
                    <td className="text-right">
                      <ClosePositionButton
                        coin={p.coin}
                        dex={p.dex}
                        getAccessToken={getAccessToken}
                        onClosed={refreshPortfolio}
                      />
                    </td>
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
        {schedulesError ? (
          <p className="text-red-400 text-sm">{schedulesError}</p>
        ) : schedules.length === 0 ? (
          <p className="text-zinc-500 text-sm">No active schedules.</p>
        ) : (
          schedules.map((s) => (
            <div key={s.id} className="card flex justify-between items-center">
              <div>
                <p className="font-medium">{s.baskets?.name}</p>
                <p className="text-sm text-zinc-500">
                  ${s.amount_usd}/cycle · {s.leverage}x · {s.status}
                </p>
              </div>
              <CloseButton scheduleId={s.id} getAccessToken={getAccessToken} onClosed={refreshPortfolio} />
            </div>
          ))
        )}
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

function ClosePositionButton({
  coin,
  dex,
  getAccessToken,
  onClosed,
}: {
  coin: string;
  dex: string;
  getAccessToken: () => Promise<string | null>;
  onClosed: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/positions/close", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ coin, dex }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to close position");
      setTimeout(onClosed, 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to close");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        className="text-xs text-red-400 border border-red-900 rounded px-2 py-1 disabled:opacity-50"
        disabled={loading}
        onClick={close}
      >
        {loading ? "Closing..." : "Close"}
      </button>
      {error && <span className="text-[10px] text-red-400 mt-0.5">{error}</span>}
    </span>
  );
}

function CloseButton({
  scheduleId,
  getAccessToken,
  onClosed,
}: {
  scheduleId: string;
  getAccessToken: () => Promise<string | null>;
  onClosed: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/schedules/${scheduleId}/close`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to close schedule");
      onClosed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to close");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-right space-y-1">
      <button className="text-sm text-red-400 border border-red-900 rounded px-3 py-1" disabled={loading} onClick={close}>
        {loading ? "Closing..." : "Close basket"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
