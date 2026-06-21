import { ExchangeClient, HttpTransport } from "@nktkas/hyperliquid";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { arbitrum } from "viem/chains";

/** HyperLiquid flat withdrawal fee (deducted from the bridged amount). */
export const WITHDRAW_FEE_USD = 1;

/**
 * Client-side HL withdrawal.
 *
 * The user's MAIN wallet (Privy embedded wallet / HL master account) must sign
 * `withdraw3` as EIP-712 typed data. Agent wallets cannot withdraw.
 *
 * Per HL docs, `clearinghouseState.withdrawable` is the perp-side limit — no
 * `usdClassTransfer` is needed when funds sit in perp margin (spot can be empty).
 */
export interface SubmitWithdrawParams {
  provider: EIP1193Provider;
  account: `0x${string}`;
  /** Arbitrum address to receive USDC (same as master wallet). */
  destination: `0x${string}`;
  /** Gross USD amount passed to withdraw3 (1 = $1). */
  amountUsd: number;
  isTestnet: boolean;
}

export async function submitWithdraw(params: SubmitWithdrawParams) {
  const walletClient = createWalletClient({
    account: params.account,
    chain: arbitrum,
    transport: custom(params.provider),
  });

  const exchange = new ExchangeClient({
    transport: new HttpTransport({ isTestnet: params.isTestnet }),
    wallet: walletClient,
  });

  return exchange.withdraw3({
    destination: params.destination,
    amount: String(params.amountUsd),
  });
}
