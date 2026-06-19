import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { SymbolConverter } from "@nktkas/hyperliquid/utils";
import type { PrivateKeyAccount } from "viem/accounts";
import { getHlNetwork } from "./config";

let sharedTransport: HttpTransport | null = null;

export function getTransport(): HttpTransport {
  if (!sharedTransport) {
    sharedTransport = new HttpTransport({ isTestnet: getHlNetwork() === "testnet" });
  }
  return sharedTransport;
}

export function createInfoClient(): InfoClient {
  return new InfoClient({ transport: getTransport() });
}

export async function createSymbolConverter(dexNames: string[]) {
  const dexs = dexNames.filter(Boolean);
  return SymbolConverter.create({
    transport: getTransport(),
    dexs: dexs.length ? dexs : undefined,
  });
}

export function createExchangeClient(
  wallet: PrivateKeyAccount,
  dexNames: string[] = [],
): ExchangeClient {
  const dexs = dexNames.filter(Boolean);
  return new ExchangeClient({
    transport: getTransport(),
    wallet,
    defaultDex: dexs[0] || undefined,
  });
}

export function uniqueDexNames(assets: { dex: string }[]): string[] {
  const set = new Set(assets.map((a) => a.dex || ""));
  const dexs = [...set];
  if (!dexs.includes("")) dexs.unshift("");
  return dexs;
}
