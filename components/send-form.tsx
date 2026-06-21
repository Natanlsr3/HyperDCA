"use client";

import { useSendTransaction } from "@privy-io/react-auth";
import { useState } from "react";
import { encodeFunctionData, erc20Abi, isAddress, parseUnits } from "viem";

// Native USDC on Arbitrum One. Sends from the embedded (in-app) wallet to any
// external address — a personal wallet or a CEX deposit address.
const ARBITRUM_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const ARBITRUM_CHAIN_ID = 42161;
const MIN_GAS_ETH = 0.00005;

export function SendForm({
  usdc,
  eth,
  balLoading,
  refreshBalances,
}: {
  usdc: number | null;
  eth: number | null;
  balLoading: boolean;
  refreshBalances: () => void;
}) {
  const { sendTransaction } = useSendTransaction();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const noGas = eth !== null && eth < MIN_GAS_ETH;

  async function send() {
    if (!isAddress(to)) {
      setStatus("Enter a valid 0x… Arbitrum address.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus("Enter an amount greater than 0.");
      return;
    }
    if (usdc !== null && amount > usdc) {
      setStatus(`This wallet only holds ${usdc.toFixed(2)} USDC.`);
      return;
    }
    if (noGas) {
      setStatus("No ETH for gas on Arbitrum One — add a little ETH (~$1) first.");
      return;
    }
    setLoading(true);
    setStatus("Submitting transfer…");
    try {
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [to as `0x${string}`, parseUnits(String(amount), 6)],
      });
      const result = await sendTransaction({ to: ARBITRUM_USDC, data, chainId: ARBITRUM_CHAIN_ID });
      const hash = (result as { hash?: string })?.hash;
      setStatus(
        `Sent${hash ? ` (${hash.slice(0, 10)}…)` : ""}. ${amount} USDC is on its way to ${to.slice(0, 6)}…${to.slice(-4)} on Arbitrum One.`,
      );
      setTimeout(refreshBalances, 4000);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-zinc-800 pt-3">
      <label className="label">Send USDC out (Arbitrum One → any address)</label>
      <input
        className="input w-full font-mono text-sm"
        placeholder="0x… destination address"
        value={to}
        onChange={(e) => setTo(e.target.value)}
      />
      <div className="flex gap-2">
        <input
          className="input flex-1"
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <button className="btn" disabled={loading || balLoading || noGas} onClick={send}>
          {loading ? "Sending…" : "Send"}
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        Moves USDC from your in-app wallet to an external wallet or exchange. First
        use <span className="text-zinc-300">Withdraw</span> above to bring funds
        from HyperLiquid to Arbitrum, then send them out here. Needs a little ETH
        for gas. Double-check the address — transfers are irreversible.
      </p>
      {status && <p className="text-xs text-zinc-400">{status}</p>}
    </div>
  );
}
