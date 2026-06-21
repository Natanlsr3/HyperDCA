"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { arbitrum } from "viem/chains";

// Native USDC on Arbitrum One (the token HyperLiquid's bridge accepts).
const ARBITRUM_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const;

const client = createPublicClient({ chain: arbitrum, transport: http() });

export interface ArbitrumBalances {
  /** Native USDC balance (human units), or null until loaded. */
  usdc: number | null;
  /** ETH balance (human units), or null until loaded. */
  eth: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Reads the wallet's native-USDC and ETH balances on Arbitrum One. */
export function useArbitrumBalances(address?: string | null): ArbitrumBalances {
  const [usdc, setUsdc] = useState<number | null>(null);
  const [eth, setEth] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!address) return;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [usdcRaw, ethRaw] = await Promise.all([
          client.readContract({
            address: ARBITRUM_USDC,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address as `0x${string}`],
          }),
          client.getBalance({ address: address as `0x${string}` }),
        ]);
        setUsdc(Number(formatUnits(usdcRaw, 6)));
        setEth(Number(formatUnits(ethRaw, 18)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to read balances");
      } finally {
        setLoading(false);
      }
    })();
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { usdc, eth, loading, error, refresh };
}
