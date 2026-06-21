"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState } from "react";

/**
 * Self-custody escape hatch. Privy assembles the private key on a separate
 * origin inside a secure modal, so neither the app nor Privy ever sees it.
 * The exported key can be imported into MetaMask/Rabby to use the SAME account
 * directly on app.hyperliquid.xyz or to move funds anywhere.
 */
export function ExportKeyButton() {
  const { wallets } = useWallets();
  const embedded = wallets.find((w) => w.walletClientType === "privy");
  const { exportWallet } = usePrivy();
  const [error, setError] = useState<string | null>(null);

  if (!embedded) return null;

  async function handleExport() {
    setError(null);
    try {
      await exportWallet({ address: embedded!.address });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    }
  }

  return (
    <div className="space-y-2 border-t border-zinc-800 pt-3">
      <label className="label">Self-custody — export your private key</label>
      <p className="text-xs text-zinc-500">
        This wallet is yours and stays the same every time you log in. Export the
        key to import it into MetaMask/Rabby — then you can connect the same
        account on app.hyperliquid.xyz or move funds anywhere. Privy shows the key
        in a secure window; only you can see it.
      </p>
      <button
        className="text-sm border border-zinc-700 rounded px-3 py-1.5 text-zinc-200 hover:bg-zinc-800"
        onClick={handleExport}
      >
        Export private key
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
