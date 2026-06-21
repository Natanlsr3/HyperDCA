import {
  ApiRequestError,
  ExchangeClient,
  HttpTransport,
  HyperliquidError,
} from "@nktkas/hyperliquid";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { arbitrum } from "viem/chains";

/**
 * Client-side HL approval submission.
 *
 * The user's MAIN wallet (their Privy embedded wallet, which also funds HL) must
 * sign two HL L1 actions as EIP-712 typed data and POST them to the exchange:
 *  - `approveAgent`     -> registers our server-generated agent address so the
 *                          executor can trade on their behalf.
 *  - `approveBuilderFee`-> authorizes our builder address + max fee.
 *
 * The `@nktkas/hyperliquid` ExchangeClient builds the typed data (nonce,
 * signatureChainId, hyperliquidChain), asks the wallet to sign it, and submits
 * it. The agent private key is NEVER involved here — it stays server-side.
 */
export interface SubmitApprovalsParams {
  /** EIP-1193 provider from the user's Privy embedded wallet. */
  provider: EIP1193Provider;
  /** User's main wallet address (the embedded wallet / HL master account). */
  account: `0x${string}`;
  isTestnet: boolean;
  agentAddress: `0x${string}`;
  agentName: string;
  builder: `0x${string}`;
  /** Percent string per HL API, e.g. "0.1%". */
  maxFeeRate: string;
  /** Skip approveAgent when the agent is already registered on-chain. */
  skipAgent?: boolean;
  /** Skip approveBuilderFee when the builder fee is already approved on-chain. */
  skipBuilder?: boolean;
}

/** HL expects `^[0-9]+(\.[0-9]+)?%` — normalize trailing zeros (e.g. "0.1000%" -> "0.1%"). */
export function normalizeMaxFeeRate(maxFeeRate: string): string {
  const match = maxFeeRate.match(/^([0-9]+(?:\.[0-9]+)?)%$/);
  if (!match) return maxFeeRate;
  return `${parseFloat(match[1])}%`;
}

type HlExchangeResult = { status?: string; response?: unknown };

function hlErrorMessage(label: string, result: HlExchangeResult): string {
  const response = result.response;
  if (typeof response === "string" && response.length > 0) return `${label}: ${response}`;
  if (response != null) return `${label}: ${JSON.stringify(response)}`;
  return `${label}: HyperLiquid returned status "${result.status ?? "unknown"}"`;
}

function assertHlOk(label: string, result: unknown): void {
  const r = result as HlExchangeResult;
  if (r?.status === "err") {
    throw new Error(hlErrorMessage(label, r));
  }
}

function wrapHlError(label: string, error: unknown): Error {
  if (error instanceof ApiRequestError) {
    const response = error.response as HlExchangeResult | string | undefined;
    if (typeof response === "string" && response.length > 0) {
      return new Error(`${label}: ${response}`);
    }
    if (response && typeof response === "object" && "response" in response) {
      return new Error(hlErrorMessage(label, response as HlExchangeResult));
    }
    return new Error(`${label}: ${error.message}`);
  }
  if (error instanceof HyperliquidError) {
    return new Error(`${label}: ${error.message}`);
  }
  if (error instanceof Error) {
    return new Error(`${label}: ${error.message}`);
  }
  return new Error(`${label}: ${String(error)}`);
}

export async function submitApprovals(params: SubmitApprovalsParams) {
  const walletClient = createWalletClient({
    account: params.account,
    chain: arbitrum,
    transport: custom(params.provider),
  });

  const exchange = new ExchangeClient({
    transport: new HttpTransport({ isTestnet: params.isTestnet }),
    wallet: walletClient,
  });

  const maxFeeRate = normalizeMaxFeeRate(params.maxFeeRate);

  let agent: unknown = { status: "skipped" };
  if (!params.skipAgent) {
    try {
      agent = await exchange.approveAgent({
        agentAddress: params.agentAddress,
        agentName: params.agentName,
      });
    } catch (error) {
      throw wrapHlError("approveAgent failed", error);
    }
    assertHlOk("approveAgent failed", agent);
  }

  let builderFee: unknown = { status: "skipped" };
  if (!params.skipBuilder) {
    try {
      builderFee = await exchange.approveBuilderFee({
        builder: params.builder,
        maxFeeRate,
      });
    } catch (error) {
      throw wrapHlError("approveBuilderFee failed", error);
    }
    assertHlOk("approveBuilderFee failed", builderFee);
  }

  return { agent, builderFee };
}
