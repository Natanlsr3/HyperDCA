"use client";

import { useWallets } from "@privy-io/react-auth";
import { useState } from "react";
import type { EIP1193Provider } from "viem";
import { submitWithdraw, WITHDRAW_FEE_USD } from "@/lib/hl/withdraw-client";

export function WithdrawForm({
  withdrawable,
  hlLoading,
  isTestnet,
  refreshHlBalance,
  refreshArbitrumBalances,
}: {
  withdrawable: number | null;
  hlLoading: boolean;
  isTestnet: boolean;
  refreshHlBalance: () => void;
  refreshArbitrumBalances: () => void;
}) {
  const { wallets } = useWallets();
  const embedded = wallets.find((w) => w.walletClientType === "privy");
  const [amount, setAmount] = useState(5);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const maxGross = withdrawable;
  const maxNet =
    withdrawable !== null ? Math.max(0, withdrawable - WITHDRAW_FEE_USD) : null;

  async function withdraw() {
    if (!embedded) {
      setStatus("Wallet not ready yet. Wait a moment and retry.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus("Enter an amount greater than 0.");
      return;
    }
    if (amount <= WITHDRAW_FEE_USD) {
      setStatus(`Amount must be greater than the $${WITHDRAW_FEE_USD} HL fee.`);
      return;
    }
    if (withdrawable === null) {
      setStatus("HyperLiquid balance still loading.");
      return;
    }
    if (amount > withdrawable) {
      setStatus(
        maxGross !== null
          ? `Max withdrawable is $${maxGross.toFixed(2)}.`
          : "Not enough withdrawable balance.",
      );
      return;
    }

    setLoading(true);
    setStatus("Sign withdrawal in your wallet…");
    try {
      const provider = (await embedded.getEthereumProvider()) as unknown as EIP1193Provider;
      const account = embedded.address as `0x${string}`;
      await submitWithdraw({
        provider,
        account,
        destination: account,
        amountUsd: amount,
        isTestnet,
      });
      const net = Math.max(0, amount - WITHDRAW_FEE_USD);
      setStatus(
        `Withdrawal submitted. ~$${net.toFixed(2)} USDC will arrive on Arbitrum in a few minutes ($${WITHDRAW_FEE_USD} HL fee).`,
      );
      setTimeout(() => {
        refreshHlBalance();
        refreshArbitrumBalances();
      }, 4000);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Withdrawal failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-zinc-800 pt-3">
      <label className="label">Withdraw USDC from HyperLiquid to Arbitrum One</label>
      <p className="text-xs text-zinc-500">
        Withdrawable on HL:{" "}
        {hlLoading && withdrawable === null
          ? "…"
          : `$${(withdrawable ?? 0).toFixed(2)}`}
        {maxNet !== null && maxNet > 0 && (
          <span className="text-zinc-600"> (max ~${maxNet.toFixed(2)} received after fee)</span>
        )}
      </p>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <button
          className="btn"
          disabled={loading || hlLoading || withdrawable === null || (maxNet !== null && maxNet <= 0)}
          onClick={withdraw}
        >
          {loading ? "Withdrawing…" : "Withdraw"}
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        Signed by your master wallet (not the agent). ~${WITHDRAW_FEE_USD} flat HL fee; funds arrive at the same address on Arbitrum in ~5 min.
      </p>
      {status && <p className="text-xs text-zinc-400">{status}</p>}
    </div>
  );
}
