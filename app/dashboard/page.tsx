"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthUnavailable } from "@/components/auth-unavailable";
import { DepositForm } from "@/components/deposit-form";
import { WithdrawForm } from "@/components/withdraw-form";
import { SendForm } from "@/components/send-form";
import { ExportKeyButton } from "@/components/export-key-button";
import { useArbitrumBalances } from "@/lib/wallet/arbitrum-balances";

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

function displayCoin(coin: string) {
  const idx = coin.indexOf(":");
  return idx >= 0 ? coin.slice(idx + 1) : coin;
}

export default function DashboardPage() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return <AuthUnavailable />;
  return (
    <Suspense fallback={<div className="text-[var(--text3)]">Loading portfolio...</div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { authenticated, getAccessToken, login } = usePrivy();
  const { wallets } = useWallets();
  const searchParams = useSearchParams();
  const showDeposit = searchParams.get("showDeposit") === "true";
  const address = wallets.find((w) => w.walletClientType === "privy")?.address ?? null;
  const { usdc, eth, loading: balLoading, refresh: refreshBalances } = useArbitrumBalances(address);
  const walletCardRef = useRef<HTMLDivElement>(null);

  const [copied, setCopied] = useState(false);
  const [depositHighlight, setDepositHighlight] = useState(showDeposit);
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

  // Compute real allocation from positions
  const realAllocation = useMemo(() => {
    if (positions.length === 0) return [];
    const totalValue = positions.reduce((sum, p) => sum + Math.abs(p.positionValue), 0);
    if (totalValue === 0) return [];
    return positions
      .map((p) => ({
        coin: displayCoin(p.coin),
        weight: Math.round((Math.abs(p.positionValue) / totalValue) * 100),
        value: Math.abs(p.positionValue),
      }))
      .sort((a, b) => b.weight - a.weight);
  }, [positions]);

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

  // Auto-scroll to wallet card when coming from onboarding deposit link
  useEffect(() => {
    if (showDeposit && walletCardRef.current) {
      setTimeout(() => {
        walletCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 400);
      // Remove highlight after 4 seconds
      const timer = setTimeout(() => setDepositHighlight(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [showDeposit]);

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-[640px] space-y-6">
        <div className="text-center">
          <h1 className="design-h1">Portfolio</h1>
          <p className="design-subtitle">Sign in to manage your positions, schedules, and DCA strategies on HyperLiquid.</p>
        </div>
        <div className="grid gap-[14px] md:grid-cols-3">
          {[
            { icon: "M3 3v18h18M7 16l4-4 4 4 6-8", title: "Live P&L tracking", desc: "Real-time account value, unrealized PnL, and position monitoring" },
            { icon: "M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", title: "Active schedules", desc: "View and manage your DCA automations across all baskets" },
            { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016Z", title: "Guardrail alerts", desc: "Auto-monitoring of leverage and liquidation risk per cycle" },
          ].map((f) => (
            <div key={f.title} className="card flex flex-col items-center p-[20px] text-center">
              <div className="mb-[10px] grid h-[40px] w-[40px] place-items-center rounded-[10px] bg-[var(--accentSoft)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={f.icon} /></svg>
              </div>
              <h3 className="mb-[4px] text-[14px] font-bold text-[var(--text)]">{f.title}</h3>
              <p className="m-0 text-[12.5px] leading-[1.5] text-[var(--text2)]">{f.desc}</p>
            </div>
          ))}
        </div>
        <div className="text-center">
          <button className="btn px-[24px] py-[11px] text-[14px]" onClick={login}>Sign in to view portfolio</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="design-h1">Portfolio</h1>
        <p className="design-subtitle mb-0">Your HyperLiquid positions, schedules, and performance.</p>
      </div>

      {!onboarded && (
        <div className="rounded-[8px] border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          Account setup incomplete — approve your agent on HyperLiquid before schedules can execute.{" "}
          <Link href="/onboarding" className="font-semibold text-amber-900 underline">
            Complete setup
          </Link>
        </div>
      )}

      {portfolioMessage && (
        <p className="text-[13px] text-[var(--text3)]">{portfolioMessage}</p>
      )}

      {guardrail && positions.length > 0 && (
        <div className="rounded-[8px] border border-[var(--neg)] bg-[var(--negSoft)] px-4 py-3 text-[13px] font-medium text-[var(--neg)]">
          Liquidation guardrail triggered — review leverage and margin.
        </div>
      )}

      {/* Wallet */}
      <div ref={walletCardRef} className={`card transition-all duration-500 ${depositHighlight ? "ring-2 ring-[var(--accent)] ring-offset-2" : ""}`}>
        {showDeposit && (
          <div className="mb-3 flex items-center justify-between rounded-[8px] bg-[var(--accentSoft)] px-3 py-2">
            <p className="m-0 text-[13px] font-medium text-[var(--accentText)]">
              Deposit USDC + ETH for gas, then go back to finish onboarding.
            </p>
            <Link href="/onboarding" className="btn-secondary ml-3 shrink-0 px-3 py-[5px] text-[12px] no-underline">
              Back to setup
            </Link>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="label m-0">Wallet</p>
          {address && (
            <button
              className="mono inline-flex items-center gap-1.5 text-[12px] text-[var(--text2)] hover:text-[var(--text)]"
              onClick={() => {
                navigator.clipboard.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {address.slice(0, 6)}...{address.slice(-4)}
              <span className="text-[11px]">{copied ? "Copied" : "Copy"}</span>
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-[8px] bg-[var(--surface2)] px-3 py-2">
            <p className="label m-0 text-[10px]">USDC (Arbitrum)</p>
            <p className="mono m-0 text-[16px] font-semibold text-[var(--text)]">
              {balLoading && usdc === null ? "..." : `${(usdc ?? 0).toFixed(2)}`}
            </p>
          </div>
          <div className="rounded-[8px] bg-[var(--surface2)] px-3 py-2">
            <p className="label m-0 text-[10px]">ETH (gas)</p>
            <p className={`mono m-0 text-[16px] font-semibold ${eth !== null && eth < 0.00005 ? "text-[var(--neg)]" : "text-[var(--text)]"}`}>
              {balLoading && eth === null ? "..." : `${(eth ?? 0).toFixed(5)}`}
            </p>
          </div>
        </div>

        {eth !== null && eth < 0.00005 && (
          <p className="m-0 mt-2 text-[12px] text-[var(--neg)]">
            Send ~$1 of ETH on Arbitrum to enable deposits.
          </p>
        )}

        <div className="mt-3 space-y-2">
          <DepositForm usdc={usdc} eth={eth} balLoading={balLoading} refreshBalances={refreshBalances} />
          <WithdrawForm withdrawable={withdrawable} hlLoading={hlLoading} isTestnet={hlTestnet} refreshHlBalance={refreshPortfolio} refreshArbitrumBalances={refreshBalances} />
          <details className="group">
            <summary className="cursor-pointer text-[12px] font-medium text-[var(--text3)] hover:text-[var(--text2)]">More options</summary>
            <div className="mt-2 space-y-2">
              <SendForm usdc={usdc} eth={eth} balLoading={balLoading} refreshBalances={refreshBalances} />
              <ExportKeyButton />
            </div>
          </details>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="stat-card">
          <p className="label">Account value</p>
          <p className="mono text-[22px] font-semibold text-[var(--text)]">${accountValue.toFixed(2)}</p>
          {withdrawable !== null && (
            <p className="text-[11px] text-[var(--text3)] mt-1">
              Withdrawable: {hlLoading ? "..." : `$${withdrawable.toFixed(2)}`}
            </p>
          )}
        </div>
        <div className="stat-card">
          <p className="label">All-time PnL</p>
          <p className={`mono text-[22px] font-semibold ${allTimePnl === null ? "text-[var(--text)]" : allTimePnl >= 0 ? "text-[var(--pos)]" : "text-[var(--neg)]"}`}>
            {hlLoading && allTimePnl === null
              ? "..."
              : allTimePnl === null
                ? "—"
                : `${allTimePnl >= 0 ? "+" : "-"}$${Math.abs(allTimePnl).toFixed(2)}`}
          </p>
        </div>
        <div className="stat-card">
          <p className="label">Open positions</p>
          <p className="mono text-[22px] font-semibold text-[var(--text)]">{positions.length}</p>
        </div>
        <div className="stat-card">
          <p className="label">Est. carry</p>
          <p className="mono text-[22px] font-semibold text-[var(--text)]">{carryPct !== null ? `${carryPct.toFixed(1)}%/yr` : "—"}</p>
        </div>
      </div>

      {/* Real allocation from positions */}
      {realAllocation.length > 0 && (
        <section className="card p-[18px]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="m-0 text-[15px] font-semibold text-[var(--text)]">Current allocation</h2>
            <span className="mono text-[12px] text-[var(--text3)]">{realAllocation.length} assets</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {realAllocation.map((a) => (
              <div key={a.coin} className="rounded-[8px] border border-[var(--border)] bg-[var(--surface2)] p-3">
                <div className="flex items-center justify-between">
                  <span className="mono text-[14px] font-semibold text-[var(--text)]">{a.coin}</span>
                  <span className="mono text-[12px] font-semibold text-[var(--text2)]">{a.weight}%</span>
                </div>
                <div className="mt-2 h-[6px] rounded-full bg-[var(--surface3)]">
                  <div className="h-[6px] rounded-full bg-[var(--accent)]" style={{ width: `${a.weight}%` }} />
                </div>
                <div className="mono mt-2 text-[11px] text-[var(--text3)]">${a.value.toFixed(0)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Positions table */}
      <section className="space-y-3">
        <h2 className="text-[16px] font-semibold text-[var(--text)]">Positions</h2>
        {positions.length === 0 ? (
          <p className="text-[13px] text-[var(--text3)]">No open positions on HyperLiquid.</p>
        ) : (
          <div className="overflow-x-auto rounded-[12px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Size</th>
                  <th className="text-right">Entry</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">uPnL</th>
                  <th className="hidden sm:table-cell text-right">Liq px</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={`${p.dex}:${p.coin}`}>
                    <td className="font-semibold text-[var(--text)]">{displayCoin(p.coin)}</td>
                    <td className="mono text-[13px] text-[var(--text2)]">{p.szi}</td>
                    <td className="mono text-right text-[13px] text-[var(--text)]">${p.entryPx.toFixed(2)}</td>
                    <td className="mono text-right text-[13px] font-medium text-[var(--text)]">${p.positionValue.toFixed(2)}</td>
                    <td className={`mono text-right text-[13px] font-semibold ${p.unrealizedPnl >= 0 ? "text-[var(--pos)]" : "text-[var(--neg)]"}`}>
                      {p.unrealizedPnl >= 0 ? "+" : ""}${p.unrealizedPnl.toFixed(2)}
                    </td>
                    <td className="hidden sm:table-cell mono text-right text-[13px] text-[var(--text2)]">{p.liquidationPx?.toFixed(2) ?? "—"}</td>
                    <td className="text-right">
                      <ClosePositionButton coin={p.coin} dex={p.dex} getAccessToken={getAccessToken} onClosed={refreshPortfolio} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Active schedules */}
      <section className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-[16px] font-semibold text-[var(--text)]">Active schedules</h2>
          <Link href="/baskets" className="text-[13px] font-semibold text-[var(--accentText)] no-underline">+ New schedule</Link>
        </div>
        {schedulesError ? (
          <p className="text-[13px] text-[var(--neg)]">{schedulesError}</p>
        ) : schedules.length === 0 ? (
          <p className="text-[13px] text-[var(--text3)]">No active schedules.</p>
        ) : (
          schedules.map((s) => (
            <div key={s.id} className="card flex justify-between items-center">
              <div>
                <p className="m-0 text-[14px] font-semibold text-[var(--text)]">{s.baskets?.name}</p>
                <p className="m-0 mt-1 text-[12.5px] text-[var(--text2)]">
                  ${s.amount_usd}/cycle · {s.leverage}x · {s.status}
                </p>
              </div>
              <CloseButton scheduleId={s.id} getAccessToken={getAccessToken} onClosed={refreshPortfolio} />
            </div>
          ))
        )}
      </section>

      {/* Followed baskets */}
      <section className="space-y-3">
        <h2 className="text-[16px] font-semibold text-[var(--text)]">Followed baskets</h2>
        {followedBaskets.length === 0 ? (
          <p className="text-[13px] text-[var(--text3)]">No followed baskets yet.</p>
        ) : (
          followedBaskets.map((follow) => (
            <div key={follow.id} className="card flex justify-between items-center">
              <div>
                <p className="m-0 text-[14px] font-semibold text-[var(--text)]">{follow.baskets?.name}</p>
                <p className="m-0 mt-1 text-[12.5px] text-[var(--text2)]">{follow.follow_mode} follow mode</p>
              </div>
              {follow.baskets?.id && (
                <Link href={`/baskets/${follow.baskets.id}`} className="btn-secondary px-3 py-[6px] text-[12.5px] no-underline">
                  View
                </Link>
              )}
            </div>
          ))
        )}
      </section>

      {/* Mirror history */}
      <section className="space-y-3">
        <h2 className="text-[16px] font-semibold text-[var(--text)]">Mirror history</h2>
        {mirrorHistory.length === 0 ? (
          <p className="text-[13px] text-[var(--text3)]">No mirror executions yet.</p>
        ) : (
          mirrorHistory.map((execution) => (
            <div key={execution.id} className="card flex justify-between items-center gap-4">
              <div>
                <p className="m-0 text-[14px] font-semibold text-[var(--text)]">{execution.baskets?.name ?? "Basket"}</p>
                <p className="m-0 mt-1 text-[12.5px] text-[var(--text2)]">
                  {new Date(execution.execution_time).toLocaleString()} · {execution.trades_executed.length} trades
                </p>
              </div>
              <span className={`rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold ${execution.success ? "bg-[var(--posSoft)] text-[var(--pos)]" : "bg-[var(--negSoft)] text-[var(--neg)]"}`}>
                {execution.success ? "Success" : "Failed"}
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
        className="rounded-[5px] border border-[var(--neg)] bg-[var(--negSoft)] px-[10px] py-[4px] text-[11px] font-semibold text-[var(--neg)] disabled:opacity-50"
        disabled={loading}
        onClick={close}
      >
        {loading ? "Closing..." : "Close"}
      </button>
      {error && <span className="text-[10px] text-[var(--neg)] mt-0.5">{error}</span>}
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
      <button
        className="rounded-[5px] border border-[var(--neg)] bg-[var(--negSoft)] px-3 py-[5px] text-[12px] font-semibold text-[var(--neg)] disabled:opacity-50"
        disabled={loading}
        onClick={close}
      >
        {loading ? "Closing..." : "Close"}
      </button>
      {error && <p className="text-[11px] text-[var(--neg)]">{error}</p>}
    </div>
  );
}
