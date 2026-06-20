"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ASSET_COLORS } from "@/lib/design-system";
import { readJsonResponse } from "@/lib/http/client";

interface BasketAsset {
  coin: string;
  weight: number;
}

interface Row {
  id: string;
  rank: number;
  name: string;
  theme?: string;
  roi_30d?: number;
  roi_ytd?: number;
  hit_rate?: number;
  followers_count?: number;
  basket_assets?: BasketAsset[];
}

function pct(value?: number, signed = false) {
  const n = (value ?? 0) * 100;
  return `${signed && n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function compact(value?: number) {
  const n = value ?? 0;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<div className="text-[var(--text3)]">Loading leaderboard...</div>}>
      <LeaderboardContent />
    </Suspense>
  );
}

function LeaderboardContent() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [sortBy, setSortBy] = useState("roi_30d");
  const creatorQuery = searchParams.get("creator") ?? "";

  useEffect(() => {
    fetch(`/api/leaderboard?sortBy=${sortBy}`)
      .then((res) => readJsonResponse<{ leaderboard?: Row[] }>(res))
      .then((data) => setRows(data.leaderboard ?? []));
  }, [sortBy]);

  const visibleRows = useMemo(() => {
    if (!creatorQuery) return rows;
    const needle = creatorQuery.toLowerCase();
    return rows.filter((row) => `${row.name} ${row.theme ?? ""}`.toLowerCase().includes(needle));
  }, [creatorQuery, rows]);
  const rankedRows = visibleRows.map((row, index) => ({ ...row, rank: index + 1 }));
  const topRows = useMemo(() => rankedRows.slice(0, 3), [rankedRows]);
  const totalFollowers = rankedRows.reduce((sum, row) => sum + Number(row.followers_count ?? 0), 0);
  const avgHitRate = rankedRows.length ? rankedRows.reduce((sum, row) => sum + Number(row.hit_rate ?? 0), 0) / rankedRows.length : 0;

  return (
    <div>
      <div className="mb-[26px] flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="design-h1">Leaderboard</h1>
          <p className="design-subtitle mb-0">
            {creatorQuery ? `Creator leaderboard for "${creatorQuery}".` : "Rank baskets by momentum, hit rate, and follower conviction."}
          </p>
        </div>
        <select className="input w-full lg:w-[320px]" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="roi_30d">ROI 30d</option>
          <option value="roi_ytd">ROI YTD</option>
          <option value="followers_count">Followers</option>
          <option value="hit_rate">Hit rate</option>
        </select>
      </div>

      <div className="mb-[18px] grid gap-[16px] md:grid-cols-3">
        <SummaryCard label={creatorQuery ? "Creator baskets" : "Tracked baskets"} value={`${rankedRows.length}`} />
        <SummaryCard label="Total followers" value={compact(totalFollowers)} />
        <SummaryCard label="Avg. hit rate" value={`${(avgHitRate * 100).toFixed(0)}%`} />
      </div>

      <div className="mb-[26px] grid gap-[18px] lg:grid-cols-3">
        {topRows.map((row) => (
          <Link key={row.id} href={`/baskets/${row.id}`} className="card block p-[20px] no-underline transition hover:-translate-y-0.5 hover:border-[var(--borderStrong)] hover:shadow-[var(--shadowHover)]">
            <div className="mb-[14px] flex items-start justify-between gap-3">
              <div>
                <div className="mb-[6px] inline-flex rounded-[5px] bg-[var(--accentSoft)] px-[7px] py-[3px] text-[11px] font-bold text-[var(--accentText)]">
                  #{row.rank}
                </div>
                <h2 className="m-0 text-[18px] font-bold tracking-[-0.01em] text-[var(--text)]">{row.name}</h2>
                <p className="mono mt-1 text-[12px] font-medium text-[var(--text3)]">{row.theme ?? "Hyperliquid"}</p>
              </div>
              <span className="basket-roi is-positive">{pct(row.roi_30d, true)}</span>
            </div>
            <div className="mb-[14px] flex flex-wrap gap-[6px]">
              {(row.basket_assets ?? []).slice(0, 4).map((asset) => (
                <span
                  key={asset.coin}
                  className="asset-chip"
                  style={{
                    color: ASSET_COLORS[asset.coin] ?? "#64748B",
                    background: "var(--surface2)",
                    borderColor: "var(--border)",
                  }}
                >
                  {asset.coin}
                  <span className="opacity-65">{Math.round(Number(asset.weight) * 100)}%</span>
                </span>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
              <MiniMetric label="Hit rate" value={`${((row.hit_rate ?? 0) * 100).toFixed(0)}%`} />
              <MiniMetric label="Followers" value={compact(row.followers_count)} />
            </div>
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <table className="data-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Basket</th>
              <th>Assets</th>
              <th className="text-right">ROI 30d</th>
              <th className="text-right">ROI YTD</th>
              <th className="text-right">Hit rate</th>
              <th className="text-right">Followers</th>
            </tr>
          </thead>
          <tbody>
            {rankedRows.map((row) => (
              <tr key={row.id}>
                <td className="mono text-[12.5px] font-semibold text-[var(--text3)]">#{row.rank}</td>
                <td>
                  <Link href={`/baskets/${row.id}`} className="text-[14px] font-semibold text-[var(--text)] no-underline">
                    {row.name}
                  </Link>
                  <div className="mono text-[11.5px] font-medium text-[var(--text3)]">{row.theme ?? "Hyperliquid"}</div>
                </td>
                <td>
                  <div className="flex flex-wrap gap-[5px]">
                    {(row.basket_assets ?? []).slice(0, 4).map((asset) => (
                      <span key={asset.coin} className="rounded-[5px] bg-[var(--surface3)] px-[7px] py-[3px] mono text-[11px] font-semibold text-[var(--text2)]">
                        {asset.coin}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="mono text-right text-[13.5px] font-semibold text-[var(--pos)]">{pct(row.roi_30d)}</td>
                <td className="mono text-right text-[13px] font-medium text-[var(--text)]">{pct(row.roi_ytd)}</td>
                <td className="mono text-right text-[13px] font-medium text-[var(--text)]">{((row.hit_rate ?? 0) * 100).toFixed(0)}%</td>
                <td className="mono text-right text-[13px] font-medium text-[var(--text2)]">{compact(row.followers_count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rankedRows.length ? (
          <div className="border-t border-[var(--border)] p-5 text-sm text-[var(--text2)]">
            No creator or basket matched this search. Try a handle like <span className="mono">0xCipher.hl</span> or a basket name.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <p className="label">{label}</p>
      <p className="mono text-[24px] font-semibold tracking-[-0.01em] text-[var(--text)]">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.04em] text-[var(--text3)]">{label}</div>
      <div className="mono text-[13px] font-semibold text-[var(--text)]">{value}</div>
    </div>
  );
}
