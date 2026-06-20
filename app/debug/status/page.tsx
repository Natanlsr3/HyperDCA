"use client";

import { useEffect, useMemo, useState } from "react";
import type { HealthStatus, SystemHealth } from "@/lib/qa/health-monitor";
import { readJsonResponse } from "@/lib/http/client";

interface ValidationReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
}

export default function StatusPage() {
  const hasPrivy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [lastReport, setLastReport] = useState<ValidationReport | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      const response = await fetch("/api/debug/status");
      const data = await readJsonResponse<{ health?: SystemHealth; lastReport?: ValidationReport | null }>(response);
      if (!cancelled) {
        setHealth(data.health ?? null);
        setLastReport(data.lastReport ?? null);
      }
    }

    fetchStatus().catch(() => undefined);
    if (!autoRefresh) return () => {
      cancelled = true;
    };

    const interval = window.setInterval(() => fetchStatus().catch(() => undefined), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [autoRefresh]);

  const checks = useMemo(() => health ? [
    ["Frontend", health.frontend] as const,
    ["Backend API", health.backend] as const,
    ["Database", health.database] as const,
    ["Hyperliquid", health.hyperliquid] as const,
    ["Telegram Bot", health.telegramBot] as const,
    ["AI Advisor", health.aiAdvisor] as const,
  ] : [], [health]);

  if (!health) return <div className="text-[var(--text3)]">Loading dev diagnostics...</div>;

  return (
    <div>
      <div className="mb-[26px] flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-[8px] inline-flex rounded-[5px] bg-[var(--surface3)] px-[8px] py-[4px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--text3)]">
            Temporary dev panel
          </div>
          <h1 className="design-h1">System diagnostics</h1>
          <p className="design-subtitle mb-0">Temporary dev-only panel for config and integration health.</p>
        </div>
        <button className="btn" onClick={() => setAutoRefresh((value) => !value)}>
          Auto-refresh {autoRefresh ? "on" : "off"}
        </button>
      </div>

      <div className="mb-[18px] grid gap-[16px] md:grid-cols-3">
        <ReportCard label="Tests" value={lastReport ? `${lastReport.passed}/${lastReport.totalTests}` : "No run"} />
        <ReportCard label="Failures" value={`${lastReport?.failed ?? 0}`} tone={(lastReport?.failed ?? 0) > 0 ? "bad" : "good"} />
        <ReportCard label="Warnings" value={`${lastReport?.warnings ?? 0}`} tone={(lastReport?.warnings ?? 0) > 0 ? "warn" : "good"} />
      </div>

      <div className="mb-[26px] grid gap-[18px] lg:grid-cols-2">
        {checks.map(([title, item]) => (
          <StatusCard key={title} title={title} health={item} />
        ))}
      </div>

      <section className="card p-[22px]">
        <div className="mb-[16px] flex items-center justify-between">
          <h2 className="m-0 text-[18px] font-bold tracking-[-0.01em] text-[var(--text)]">What this means</h2>
          <span className="mono text-[12px] text-[var(--text3)]">{lastReport ? new Date(lastReport.timestamp).toLocaleString() : "No report"}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <DevNote title="Privy auth" detail={hasPrivy ? "Configured. Wallet login is available and the app can show a live account." : "Missing Privy keys. Wallet-only pages stay in demo mode until configured."} />
          <DevNote title="Supabase database" detail="Not configured yet. Public basket screens use demo fallback data; schedules, onboarding persistence, and real portfolios need Supabase keys." />
          <DevNote title="Telegram bot" detail="Optional for now. Add `TELEGRAM_BOT_TOKEN` only when notification delivery is ready." />
          <DevNote title="AI advisor" detail="Optional conversational layer for Telegram. Add `OPENAI_API_KEY` or `GEMINI_API_KEY`, then restart the bot process." />
          <DevNote title="Final app" detail="Diagnostics stays accessible for development, but it is no longer presented as a primary product section." />
        </div>
      </section>
    </div>
  );
}

function StatusCard({ title, health }: { title: string; health: HealthStatus }) {
  const tone =
    health.status === "healthy"
      ? "border-[var(--pos)] bg-[var(--posSoft)] text-[var(--pos)]"
      : health.status === "degraded"
        ? "border-[#D97706] bg-[#FFFBEB] text-[#92400E]"
        : "border-[var(--neg)] bg-[var(--negSoft)] text-[var(--neg)]";

  return (
    <article className={`rounded-[12px] border p-[20px] shadow-[var(--shadow)] ${tone}`}>
      <div className="mb-[8px] flex items-start justify-between gap-3">
        <h2 className="m-0 text-[17px] font-bold tracking-[-0.01em]">{title}</h2>
        <span className="mono text-[11px] font-bold uppercase">{health.status}</span>
      </div>
      <p className="mb-[10px] text-[14px] text-[var(--text2)]">{health.details}</p>
      <p className="mono m-0 text-[12px] text-[var(--text3)]">{new Date(health.lastCheck).toLocaleString()}</p>
    </article>
  );
}

function ReportCard({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "bad" ? "text-[var(--neg)]" : tone === "warn" ? "text-[#D97706]" : "text-[var(--text)]";
  return (
    <div className="stat-card">
      <p className="label">{label}</p>
      <p className={`mono text-[24px] font-semibold tracking-[-0.01em] ${color}`}>{value}</p>
    </div>
  );
}

function DevNote({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface2)] p-[14px]">
      <h3 className="m-0 text-[14px] font-semibold text-[var(--text)]">{title}</h3>
      <p className="mt-[6px] text-[13px] text-[var(--text2)]">{detail}</p>
    </div>
  );
}
