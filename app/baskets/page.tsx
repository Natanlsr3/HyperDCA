"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BasketCard } from "@/components/baskets/basket-card";
import { readJsonResponse } from "@/lib/http/client";

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

export default function BasketsPage() {
  return (
    <Suspense fallback={<div className="text-[var(--text3)]">Loading baskets...</div>}>
      <BasketsContent />
    </Suspense>
  );
}

function BasketsContent() {
  const searchParams = useSearchParams();
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [query, setQuery] = useState(searchParams.get("q") ?? searchParams.get("creator") ?? "");
  const [sortBy, setSortBy] = useState("roi_30d");
  const [loading, setLoading] = useState(true);
  const view = searchParams.get("view") ?? "discover";

  useEffect(() => {
    setLoading(true);
    fetch(`/api/baskets?sortBy=${sortBy}`)
      .then((r) => readJsonResponse<{ baskets?: Basket[] }>(r))
      .then((d) => setBaskets(d.baskets ?? []))
      .finally(() => setLoading(false));
  }, [sortBy]);

  const filtered = useMemo(
    () => {
      const byQuery = baskets.filter((basket) =>
        `${basket.name} ${basket.theme} ${basket.description ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      );

      if (view === "following") return byQuery.slice(0, 2);
      if (view === "mine") return byQuery.filter((basket) => basket.theme?.toLowerCase().includes("cipher"));
      return byQuery;
    },
    [baskets, query, view],
  );
  const title = view === "following" ? "Following" : view === "mine" ? "My baskets" : "Discover baskets";
  const subtitle =
    view === "following"
      ? "Baskets you follow, ready for monitoring or mirroring."
      : view === "mine"
        ? "Strategies you own or manage."
        : "Explore and mirror trading strategies running live on Hyperliquid.";

  return (
    <div>
      <h1 className="design-h1">{title}</h1>
      <p className="design-subtitle">{subtitle}</p>

      <div className="mb-[14px] flex items-baseline justify-between gap-4">
        <h2 className="design-h2">{view === "discover" ? "Trending" : "Strategies"}</h2>
        <div className="flex items-center gap-[10px]">
          <span className="text-[12.5px] font-medium text-[var(--text3)]">{filtered.length} baskets</span>
          <select className="input w-40" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="roi_30d">ROI 30d</option>
            <option value="followers_count">Followers</option>
            <option value="hit_rate">Hit rate</option>
            <option value="created_at">Newest</option>
          </select>
        </div>
      </div>

      <div className="mb-[18px] max-w-[440px]">
        <input
          className="input"
          placeholder="Search baskets, assets, or creators..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-[var(--text3)]">Loading baskets...</p>
      ) : filtered.length === 0 ? (
        <div className="card text-sm text-[var(--text2)]">
          {view === "mine"
            ? "No owned baskets yet. Create and publish a strategy once Supabase is connected."
            : view === "following"
              ? "No followed baskets yet. Follow a public basket from Discover to see it here."
              : "No baskets found. If you expected live data, check your Supabase env vars in `.env.local`."}
        </div>
      ) : (
        <div data-testid="basket-grid" className="basket-grid mb-[42px]">
          {filtered.map((basket) => (
            <BasketCard key={basket.id} basket={basket} />
          ))}
        </div>
      )}

      <div className="mb-[14px] flex items-center justify-between">
        <h2 className="design-h2">Top performers</h2>
        <div className="flex gap-[3px] rounded-[8px] border border-[var(--border)] bg-[var(--surface3)] p-[3px]">
          {["30D", "YTD", "Followers"].map((tab, index) => (
            <button key={tab} className={`rounded-[6px] px-[10px] py-[6px] text-[12.5px] font-semibold ${index === 0 ? "bg-white shadow-[var(--shadow)]" : "text-[var(--text2)]"}`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <table className="data-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Basket</th>
              <th className="text-right">ROI 30D</th>
              <th className="text-right">Hit rate</th>
              <th className="text-right">Followers</th>
              <th className="text-right">AUM</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((basket, index) => (
              <tr key={basket.id}>
                <td className="mono text-[12.5px] font-semibold text-[var(--text3)]">#{index + 1}</td>
                <td>
                  <div className="text-[14px] font-semibold text-[var(--text)]">{basket.name}</div>
                  <div className="mono text-[11.5px] font-medium text-[var(--text3)]">{basket.theme}</div>
                </td>
                <td className="mono text-right text-[13.5px] font-semibold text-[var(--pos)]">{((basket.roi_30d ?? 0) * 100).toFixed(1)}%</td>
                <td className="mono text-right text-[13px] font-medium text-[var(--text)]">{((basket.hit_rate ?? 0) * 100).toFixed(0)}%</td>
                <td className="mono text-right text-[13px] font-medium text-[var(--text2)]">{basket.followers_count ?? 0}</td>
                <td className="mono text-right text-[13px] font-medium text-[var(--text2)]">${((basket.followers_count ?? 0) * 850).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
