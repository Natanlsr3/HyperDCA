"use client";

import { useSendTransaction } from "@privy-io/react-auth";
import { useState } from "react";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";

// HyperLiquid native bridge (Arbitrum). Sending native USDC here credits the
// sender's HL trading account in ~1 min. Min 5 USDC or funds are lost.
const ARBITRUM_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const HL_BRIDGE = "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7";
const ARBITRUM_CHAIN_ID = 42161;
const MIN_DEPOSIT = 5;
// User pays gas on Arbitrum. An ERC20 transfer costs a tiny amount of ETH;
// below this we know the tx can't be signed and Privy just shows "add funds".
const MIN_GAS_ETH = 0.00005;

export function DepositForm({
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
  const [amount, setAmount] = useState(10);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const noGas = eth !== null && eth < MIN_GAS_ETH;
  const lowUsdc = usdc !== null && usdc < MIN_DEPOSIT;

  async function deposit() {
    if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) {
      setStatus(`Minimum deposit is ${MIN_DEPOSIT} USDC.`);
      return;
    }
    if (noGas) {
      setStatus(
        "You have 0 ETH for gas on Arbitrum One. Add a little ETH (~$1) to your wallet above, then try again.",
      );
      return;
    }
    setLoading(true);
    setStatus("Submitting deposit…");
    try {
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [HL_BRIDGE, parseUnits(String(amount), 6)],
      });
      // User pays gas (a little ETH on Arbitrum). The from-address must be the
      // user's own wallet — HL's bridge credits the sending address.
      const result = await sendTransaction({ to: ARBITRUM_USDC, data, chainId: ARBITRUM_CHAIN_ID });
      const hash = (result as { hash?: string })?.hash;
      setStatus(
        `Deposit submitted${hash ? ` (${hash.slice(0, 10)}…)` : ""}. It will credit your HyperLiquid balance in ~1 minute.`,
      );
      setTimeout(refreshBalances, 4000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Deposit failed";
      setStatus(
        /insufficient|gas|funds/i.test(msg)
          ? `${msg} — make sure your wallet holds native USDC and a little ETH (for gas) on Arbitrum One.`
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-zinc-800 pt-3">
      <label className="label">Deposit USDC to HyperLiquid (Arbitrum One)</label>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          type="number"
          min={MIN_DEPOSIT}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <button className="btn" disabled={loading || balLoading || noGas} onClick={deposit}>
          {loading ? "Depositing…" : "Deposit"}
        </button>
      </div>
      {noGas && (
        <p className="text-xs text-red-400">
          No ETH for gas on Arbitrum One. Send a little ETH (~$1) to your wallet above to enable deposits.
        </p>
      )}
      {!noGas && lowUsdc && (
        <p className="text-xs text-amber-400">
          Wallet holds {usdc?.toFixed(2)} USDC — below the {MIN_DEPOSIT} USDC minimum.
        </p>
      )}
      <p className="text-xs text-zinc-500">
        Requires native USDC + a little ETH (gas) on Arbitrum One in your wallet above. Min {MIN_DEPOSIT} USDC.
      </p>
      {status && <p className="text-xs text-zinc-400">{status}</p>}
    </div>
  );
}
