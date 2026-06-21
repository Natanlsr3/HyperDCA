"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

const navItems = [
  { href: "/baskets", label: "Discover", icon: "M12 2 2 7l10 5 10-5-10-5Z" },
  { href: "/leaderboard", label: "Leaderboard", icon: "M4 19V9m8 10V5m8 14v-7" },
  { href: "/portfolio", label: "Portfolio", icon: "M3 12h18M7 16h10M9 8h6" },
];

export function Nav() {
  const hasPrivy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
  return hasPrivy ? <PrivyShell /> : <StaticShell />;
}

function StaticShell() {
  return <Shell walletLabel="Not connected" walletMeta="Sign in to start" statusLabel="Demo mode" isConnected={false} />;
}

function PrivyShell() {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const embeddedAddress = wallets.find((w) => w.walletClientType === "privy")?.address ?? null;
  const walletLabel = embeddedAddress
    ? `${embeddedAddress.slice(0, 6)}...${embeddedAddress.slice(-4)}`
    : "Creating wallet...";
  const [onboarded, setOnboarded] = useState(true);

  useEffect(() => {
    if (!authenticated) return;
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/onboarding", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setOnboarded(Boolean(data.onboarded));
      } catch { /* silent */ }
    })();
  }, [authenticated, getAccessToken]);

  return (
    <Shell
      walletLabel={authenticated ? walletLabel : "Connect wallet"}
      walletMeta={authenticated ? "Live account" : "Sign in to start"}
      statusLabel={ready && authenticated ? undefined : "Sign in"}
      onStatusClick={authenticated ? logout : login}
      showOnboardingLink={authenticated && !onboarded}
      isConnected={ready && authenticated}
    />
  );
}

function Shell({
  walletLabel,
  walletMeta,
  statusLabel,
  onStatusClick,
  showOnboardingLink,
  isConnected,
}: {
  walletLabel: string;
  walletMeta: string;
  statusLabel?: string;
  onStatusClick?: () => void;
  showOnboardingLink?: boolean;
  isConnected?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("creator") ?? searchParams.get("q") ?? "");
  const basketView = searchParams.get("view") ?? "discover";
  const topTabs = [
    { href: "/baskets?view=discover", label: "Discover", active: pathname.startsWith("/baskets") && basketView === "discover" },
    { href: "/baskets?view=following", label: "Following", active: pathname.startsWith("/baskets") && basketView === "following" },
    { href: "/baskets?view=mine", label: "My baskets", active: pathname.startsWith("/baskets") && basketView === "mine" },
  ];

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = search.trim();
    if (!value) return;
    router.push(`/leaderboard?creator=${encodeURIComponent(value)}`);
  }

  return (
    <>
      <aside className="app-sidebar">
        <Link href="/baskets" className="flex items-center gap-[11px] px-2 pb-[22px] pt-[6px] no-underline">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-[9px] bg-[var(--accent)] text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 2 7l10 5 10-5-10-5Z" />
              <path d="m2 17 10 5 10-5" />
              <path d="m2 12 10 5 10-5" />
            </svg>
          </span>
          <span className="leading-none">
            <span className="block text-[15px] font-bold tracking-[-0.02em] text-[var(--text)]">Baskets</span>
            <span className="mt-1 block text-[10.5px] font-medium tracking-[0.02em] text-[var(--text3)]">Hyperliquid</span>
          </span>
        </Link>

        <nav className="flex flex-col gap-[3px]">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href === "/baskets" && pathname.startsWith("/baskets"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-[9px] rounded-[8px] px-[10px] py-[9px] text-[13px] font-semibold no-underline transition ${
                  active
                    ? "bg-[var(--accentSoft)] text-[var(--accentText)]"
                    : "text-[var(--text2)] hover:bg-[var(--surface3)] hover:text-[var(--text)]"
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
                <span className="flex flex-1 items-center justify-between">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          {showOnboardingLink && (
            <Link
              href="/onboarding"
              className="flex items-center gap-[9px] rounded-[8px] border border-amber-800 bg-amber-950/30 px-[10px] py-[9px] text-[13px] font-semibold text-amber-300 no-underline transition hover:bg-amber-950/50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <span>Account setup</span>
            </Link>
          )}
          {process.env.NODE_ENV === "development" && (
            <Link
              href="/debug/status"
              className={`flex items-center justify-between rounded-[8px] border border-[var(--border)] px-[10px] py-[8px] text-[12px] font-semibold no-underline ${
                pathname === "/debug/status"
                  ? "bg-[var(--accentSoft)] text-[var(--accentText)]"
                  : "bg-[var(--surface2)] text-[var(--text3)] hover:text-[var(--text)]"
              }`}
            >
              <span>Diagnostics</span>
              <span className="mono text-[10px] uppercase">Dev</span>
            </Link>
          )}
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface3)] p-[14px]">
          <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text3)]">Wallet</div>
          <div className="mb-[6px] flex items-center gap-[7px]">
            <span className={`h-[7px] w-[7px] rounded-full ${isConnected ? "bg-[var(--pos)] shadow-[0_0_0_3px_var(--posSoft)]" : "bg-[var(--text3)]"}`} />
            <span className="mono text-[12.5px] font-medium text-[var(--text)]">{walletLabel}</span>
          </div>
          <div className="mono text-[13px] font-semibold text-[var(--text)]">{walletMeta}</div>
          </div>
        </div>
      </aside>

      <header className="app-topbar">
        <form className="relative flex-1 max-w-[440px]" onSubmit={submitSearch}>
          <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            className="input pl-9"
            placeholder="Search baskets, assets, or creators..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </form>
        <div className="flex-1" />
        <div className="hidden items-center gap-[3px] rounded-[8px] border border-[var(--border)] bg-[var(--surface3)] p-[3px] md:flex">
          {topTabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-[6px] px-[11px] py-[6px] text-[12.5px] font-semibold no-underline ${
                tab.active ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow)]" : "text-[var(--text2)] hover:text-[var(--text)]"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        {statusLabel ? (
          <button className="btn-secondary hidden sm:block" onClick={onStatusClick}>{statusLabel}</button>
        ) : null}
        <div className="hidden items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-[13px] py-[7px] sm:flex">
          <span className={`h-[7px] w-[7px] rounded-full ${isConnected ? "bg-[var(--pos)]" : "bg-[var(--text3)]"}`} />
          <span className="mono text-[12.5px] font-medium text-[var(--text)]">{walletLabel}</span>
        </div>
      </header>

      <nav className="app-bottombar">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href === "/baskets" && pathname.startsWith("/baskets"));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-[3px] py-[8px] text-[10.5px] font-semibold no-underline transition ${
                active ? "text-[var(--accentText)]" : "text-[var(--text3)]"
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2" : "1.6"} strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              {item.label}
            </Link>
          );
        })}
        {statusLabel ? (
          <button
            className="flex flex-1 flex-col items-center gap-[3px] border-0 bg-transparent py-[8px] text-[10.5px] font-semibold text-[var(--text3)] transition"
            onClick={onStatusClick}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" />
            </svg>
            {statusLabel}
          </button>
        ) : null}
      </nav>
    </>
  );
}
