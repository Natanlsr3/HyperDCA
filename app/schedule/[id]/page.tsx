"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface BasketAsset {
  coin: string;
  weight: number;
}

interface Basket {
  id: string;
  name: string;
  description: string;
  basket_assets: BasketAsset[];
}

export default function ScheduleSetupPage() {
  const { id } = useParams<{ id: string }>();
  const { authenticated, login, getAccessToken } = usePrivy();
  const router = useRouter();
  const [basket, setBasket] = useState<Basket | null>(null);
  const [amountUsd, setAmountUsd] = useState(50);
  const [leverage, setLeverage] = useState(1);
  const [intervalDays, setIntervalDays] = useState(1);
  const [strategy, setStrategy] = useState("simple_time");
  const [carryPct, setCarryPct] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/baskets?id=${id}`)
      .then((r) => r.json())
      .then((d) => setBasket(d.basket));
  }, [id]);

  useEffect(() => {
    if (!authenticated) return;
    (async () => {
      const token = await getAccessToken();
      const res = await fetch(`/api/portfolio?basketId=${id}&leverage=${leverage}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.carry) setCarryPct(data.carry.basketAnnualizedPct);
    })();
  }, [authenticated, id, leverage, getAccessToken]);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          basketId: id,
          amountUsd,
          intervalSeconds: intervalDays * 86400,
          leverage,
          strategyType: strategy,
          params: { slippage: 0.01, intraday_drop: 0.03, dip_threshold: 0.1 },
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create schedule");
    } finally {
      setLoading(false);
    }
  }

  if (!basket) return <p className="text-zinc-500">Loading...</p>;

  if (!authenticated) {
    return (
      <div className="card text-center space-y-4">
        <p>Sign in to set up a DCA schedule.</p>
        <button className="btn" onClick={login}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{basket.name}</h1>
        <p className="text-zinc-400 text-sm">{basket.description}</p>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="label">Amount per cycle (USD)</label>
          <input
            className="input"
            type="number"
            min={10}
            value={amountUsd}
            onChange={(e) => setAmountUsd(Number(e.target.value))}
          />
        </div>

        <div>
          <label className="label">Interval (days)</label>
          <input
            className="input"
            type="number"
            min={1}
            value={intervalDays}
            onChange={(e) => setIntervalDays(Number(e.target.value))}
          />
        </div>

        <div>
          <label className="label">Leverage: {leverage}x</label>
          <input
            type="range"
            min={1}
            max={5}
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="w-full"
          />
          {carryPct !== null && (
            <p className="text-xs text-zinc-500 mt-1">
              Est. carry ~{carryPct.toFixed(1)}%/yr at {leverage}x (expense-ratio framing)
            </p>
          )}
          {leverage > 1 && (
            <p className="text-xs text-amber-400 mt-1">
              Leverage &gt; 1x enables liquidation guardrail monitoring.
            </p>
          )}
        </div>

        <div>
          <label className="label">Strategy</label>
          <select
            className="input"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
          >
            <option value="simple_time">Smart DCA (time + intraday dip)</option>
            <option value="price_drop">Price drop only</option>
          </select>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button className="btn w-full" disabled={loading} onClick={submit}>
          {loading ? "Creating..." : "Start schedule"}
        </button>
      </div>

      <div className="text-xs text-zinc-500">
        Assets:{" "}
        {basket.basket_assets.map((a) => `${a.coin} (${(Number(a.weight) * 100).toFixed(0)}%)`).join(", ")}
      </div>
    </div>
  );
}
