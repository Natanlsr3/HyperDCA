export type HlNetwork = "mainnet" | "testnet";

export function getHlNetwork(): HlNetwork {
  return process.env.HL_NETWORK === "testnet" ? "testnet" : "mainnet";
}

export function getBuilderAddress(): `0x${string}` {
  const addr = process.env.BUILDER_ADDRESS;
  if (!addr) throw new Error("BUILDER_ADDRESS not set");
  return addr as `0x${string}`;
}

/** Builder max fee as decimal fraction, e.g. 0.001 = 0.1% (perp protocol max). */
export function getBuilderMaxFee(): number {
  return Number(process.env.BUILDER_MAX_FEE ?? "0.001");
}

/**
 * Builder fee for the order `f` param, expressed in tenths of a basis point
 * (integer). HL: value of 10 = 1 basis point = 0.01%. So 0.1% -> 100.
 * Perp protocol cap is 0.1% (=> 100). Clamped to be safe.
 */
export function getBuilderFeeTenthsBps(): number {
  const tenths = Math.round(getBuilderMaxFee() * 1_000_00); // fraction * 1e5
  return Math.min(tenths, 100);
}

export function getDefaultSlippage(): number {
  return 0.01;
}

export const CYCLE_DURATION_MS = 24 * 60 * 60 * 1000;
export const DEADLINE_OFFSET_MS = 23 * 60 * 60 * 1000;
