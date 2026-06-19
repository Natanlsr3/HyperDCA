"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";

export function Nav() {
  const { ready, authenticated, login, logout, user } = usePrivy();

  return (
    <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
      <Link href="/" className="text-xl font-bold text-cyan-400 no-underline">
        HyperDCA
      </Link>
      <nav className="flex gap-4 items-center text-sm">
        <Link href="/baskets" className="text-zinc-300 no-underline hover:text-white">
          Baskets
        </Link>
        <Link href="/dashboard" className="text-zinc-300 no-underline hover:text-white">
          Dashboard
        </Link>
        {ready && !authenticated && (
          <button className="btn text-sm" onClick={login}>
            Sign in
          </button>
        )}
        {authenticated && (
          <>
            <span className="text-zinc-500 hidden sm:inline">
              {user?.email?.address ?? user?.wallet?.address?.slice(0, 8)}
            </span>
            <button className="btn text-sm" onClick={logout}>
              Logout
            </button>
          </>
        )}
      </nav>
    </header>
  );
}
