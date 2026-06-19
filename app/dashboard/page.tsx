"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import Link from "next/link";

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

export default function DashboardPage() {
  const { authenticated, getAccessToken, login } = usePrivy();
  const [positions, setPositions] = useState<Position[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [accountValue, setAccountValue] = useState(0);
  const [carryPct, setCarryPct] = useState<number | null>(null);
  const [guardrail, setGuardrail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) return;
    (async () => {
      try {
        const token = await getAccessToken();
        const [portRes, schedRes] = await Promise.all([
          fetch("/api/portfolio", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/schedules", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const port = await portRes.json();
        const sched = await schedRes.json();
        if (port.error) throw new Error(port.error);
        setPositions(port.positions ?? []);
        setAccountValue(port.accountValue ?? 0);
        setGuardrail(port.guardrailFlagged ?? false);
        setSchedules(sched.schedules ?? []);
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
      <h1 className="text-2xl font-bold">Dashboard</h1>
      {error && <p className="text-red-400">{error}</p>}
      {guardrail && (
        <div className="card border-red-800 bg-red-950/30 text-red-300">
          Liquidation guardrail triggered — review leverage and margin.
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="label">Account value</p>
          <p className="text-2xl font-semibold">${accountValue.toFixed(2)}</p>
        </div>
        <div className="card">
          <p className="label">Open positions</p>
          <p className="text-2xl font-semibold">{positions.length}</p>
        </div>
        <div className="card">
          <p className="label">Est. carry (if set)</p>
          <p className="text-2xl font-semibold">
            {carryPct !== null ? `${carryPct.toFixed(1)}%/yr` : "—"}
          </p>
        </div>
      </div>

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
