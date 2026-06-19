import { ExchangeClient } from "@nktkas/hyperliquid";
import type { PrivateKeyAccount } from "viem/accounts";
import { createExchangeClient, getTransport } from "./client";
import { getBuilderAddress, getBuilderMaxFee, getHlNetwork } from "./config";

export function createMainExchangeClient(wallet: PrivateKeyAccount): ExchangeClient {
  return new ExchangeClient({ transport: getTransport(), wallet });
}

export async function approveAgent(
  mainWallet: PrivateKeyAccount,
  agentAddress: `0x${string}`,
  agentName = "hyperdca-agent",
) {
  const client = createMainExchangeClient(mainWallet);
  return client.approveAgent({ agentAddress, agentName });
}

export async function approveBuilderFee(mainWallet: PrivateKeyAccount) {
  const client = createMainExchangeClient(mainWallet);
  const maxFeeRate = `${(getBuilderMaxFee() * 100).toFixed(4)}%`;
  return client.approveBuilderFee({
    builder: getBuilderAddress(),
    maxFeeRate,
  });
}

export async function enableAgentDexAbstraction(agentKey: PrivateKeyAccount) {
  const client = createExchangeClient(agentKey);
  try {
    return await client.agentEnableDexAbstraction();
  } catch (e) {
    return { status: "error" as const, error: String(e) };
  }
}

export function getApproveAgentTypedData(agentAddress: `0x${string}`, agentName = "hyperdca-agent") {
  return {
    type: "approveAgent" as const,
    signatureChainId: "0x66eee" as const,
    hyperliquidChain: getHlNetwork() === "testnet" ? ("Testnet" as const) : ("Mainnet" as const),
    agentAddress,
    agentName,
    nonce: Date.now(),
  };
}

export function getApproveBuilderFeeTypedData() {
  const maxFeeRate = `${(getBuilderMaxFee() * 100).toFixed(4)}%`;
  return {
    type: "approveBuilderFee" as const,
    signatureChainId: "0x66eee" as const,
    hyperliquidChain: getHlNetwork() === "testnet" ? ("Testnet" as const) : ("Mainnet" as const),
    builder: getBuilderAddress(),
    maxFeeRate,
    nonce: Date.now(),
  };
}
