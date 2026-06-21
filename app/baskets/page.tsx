"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BasketCard } from "@/components/baskets/basket-card";
import { formatTheme } from "@/lib/design-system";
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
  const { authenticated, getAccessToken } = usePrivy();
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [query, setQuery] = useState(searchParams.get("q") ?? searchParams.get("creator") ?? "");
  const [sortBy, setSortBy] = useState("roi_30d");
  const [loading, setLoading] = useState(true);
  const view = searchParams.get("view") ?? "discover";

  // IDs of baskets the user follows or has schedules for
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [scheduleIds, setScheduleIds] = useState<Set<string>>(new Set());
  const [userDataLoading, setUserDataLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/baskets?sortBy=${sortBy}`)
      .then((r) => readJsonResponse<{ baskets?: Basket[] }>(r))
      .then((d) => setBaskets(d.baskets ?? []))
      .finally(() => setLoading(false));
  }, [sortBy]);

  // Fetch user-specific data for Following/My baskets views
  useEffect(() => {
    if (!authenticated || view === "discover") return;
    setUserDataLoading(true);
    (async () => {
      try {
        const token = await getAccessToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [portRes, schedRes] = await Promise.all([
          fetch("/api/portfolio", { headers }),
          fetch("/api/schedules", { headers }),
        ]);
        const port = await portRes.json();
        const sched = await schedRes.json();

        const fIds = new Set<string>();
        for (const f of port.baskets_followed ?? []) {
          if (f.baskets?.id) fIds.add(f.baskets.id);
        }
        setFollowedIds(fIds);

        const sIds = new Set<string>();
        for (const s of sched.schedules ?? []) {
          if (s.basket_id) sIds.add(s.basket_id);
        }
        setScheduleIds(sIds);
      } catch { /* silent */ }
      finally { setUserDataLoading(false); }
    })();
  }, [authenticated, getAccessToken, view]);

  const filtered = useMemo(
    () => {
      const byQuery = baskets.filter((basket) =>
        `${basket.name} ${basket.theme} ${basket.description ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      );

      if (view === "following") return byQuery.filter((b) => followedIds.has(b.id));
      if (view === "mine") return byQuery.filter((b) => scheduleIds.has(b.id));
      return byQuery;
    },
    [baskets, query, view, followedIds, scheduleIds],
  );
  const title = view === "following" ? "Following" : view === "mine" ? "My baskets" : "Discover baskets";
  const subtitle =
    view === "following"
      ? "Baskets you follow, ready for monitoring or mirroring."
      : view === "mine"
        ? "Baskets where you have active DCA schedules."
        : "Explore and mirror trading strategies running live on Hyperliquid.";

  const isViewLoading = loading || ((view === "following" || view === "mine") && userDataLoading);

  return (
    <div>
      <h1 className="design-h1">{title}</h1>
      <p className="design-subtitle">{subtitle}</p>

      <div className="mb-[14px] flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
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

      {isViewLoading ? (
        <p className="text-[var(--text3)]">Loading baskets...</p>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center py-[40px] text-center">
          <div className="mb-[12px] grid h-[48px] w-[48px] place-items-center rounded-[12px] bg-[var(--surface3)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={view === "following" ? "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" : view === "mine" ? "M12 2 2 7l10 5 10-5-10-5Zm0 13 10-5m-10 5L2 12" : "M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"} />
            </svg>
          </div>
          <p className="mb-[4px] text-[15px] font-semibold text-[var(--text)]">
            {view === "following" ? "No followed baskets yet" : view === "mine" ? "No active schedules" : "No baskets found"}
          </p>
          <p className="m-0 max-w-[320px] text-[13px] text-[var(--text2)]">
            {view === "mine"
              ? "Start a DCA schedule on any basket to see it here."
              : view === "following"
                ? "Follow baskets from Discover to track them here and get notifications."
                : "Try adjusting your search or check your database connection."}
          </p>
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
                  <div className="mono text-[11.5px] font-medium text-[var(--text3)]">{formatTheme(basket.theme)}</div>
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
