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

/** Final-hour force-buy / catch-up window. Mirrors dca_bot.py (24h cycle, 23h deadline => 1h window). */
export const CATCH_UP_WINDOW_MS = 60 * 60 * 1000;

/** Schedule DB floor is 3600s (1h). Keep cycles >= that. */
const MIN_CYCLE_MS = 60 * 60 * 1000;

/** Cycle length derived from the schedule's interval, not a hardcoded 24h. */
export function cycleDurationMs(intervalSeconds: number): number {
  return Math.max(intervalSeconds * 1000, MIN_CYCLE_MS);
}

/**
 * Deadline offset within a cycle: force-buy in the final hour.
 * For a 24h cycle this is 23h (matches the prototype). For a 1h cycle it
 * collapses to 0 => the schedule always force-buys (sane for short cadences).
 */
export function deadlineOffsetMs(intervalSeconds: number): number {
  return Math.max(cycleDurationMs(intervalSeconds) - CATCH_UP_WINDOW_MS, 0);
}
