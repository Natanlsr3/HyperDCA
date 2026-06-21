// Per-asset dip-tuning ported verbatim from the live prototype's bot/config.json.
// Used as defaults when a schedule's params carry no override, restoring the
// prototype's per-coin tuning without any schema/migration change.
//   intraday_drop  -> Smart DCA early-buy trigger within a cycle (~3%)
//   dip_threshold  -> Price-drop opportunistic buy vs reference (~10%)
export interface AssetThreshold {
  intraday_drop: number;
  dip_threshold: number;
}

export const ASSET_THRESHOLDS: Record<string, AssetThreshold> = {
  BTC: { intraday_drop: 0.03, dip_threshold: 0.1 },
  HYPE: { intraday_drop: 0.03, dip_threshold: 0.1 },
  SOL: { intraday_drop: 0.03, dip_threshold: 0.1 },
  TRX: { intraday_drop: 0.015, dip_threshold: 0.05 },
  CC: { intraday_drop: 0.03, dip_threshold: 0.1 },
  AAVE: { intraday_drop: 0.04, dip_threshold: 0.1 },
  "vntl:MAG7": { intraday_drop: 0.015, dip_threshold: 0.05 },
  ETH: { intraday_drop: 0.03, dip_threshold: 0.1 },
  NEAR: { intraday_drop: 0.03, dip_threshold: 0.08 },
  MORPHO: { intraday_drop: 0.035, dip_threshold: 0.08 },
  "xyz:SKHX": { intraday_drop: 0.02, dip_threshold: 0.07 },
  "xyz:COPPER": { intraday_drop: 0.02, dip_threshold: 0.06 },
  "xyz:SNDK": { intraday_drop: 0.025, dip_threshold: 0.07 },
};

const DEFAULT_INTRADAY_DROP = 0.03;
const DEFAULT_DIP_THRESHOLD = 0.1;

// Precedence: per-coin schedule override -> global schedule override ->
// per-asset prototype default -> global default.
export function intradayDropFor(coin: string, params: Record<string, unknown>): number {
  return Number(
    params[`intraday_drop_${coin}`] ??
      params.intraday_drop ??
      ASSET_THRESHOLDS[coin]?.intraday_drop ??
      DEFAULT_INTRADAY_DROP,
  );
}

export function dipThresholdFor(coin: string, params: Record<string, unknown>): number {
  return Number(
    params[`dip_threshold_${coin}`] ??
      params.dip_threshold ??
      ASSET_THRESHOLDS[coin]?.dip_threshold ??
      DEFAULT_DIP_THRESHOLD,
  );
}
