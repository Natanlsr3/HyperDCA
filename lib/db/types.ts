export type ScheduleStatus = "active" | "paused" | "closed";
export type StrategyType = "simple_time" | "price_drop";
export type ExecutionStatus = "success" | "partial" | "skipped" | "error";
export type OrderStatus = "pending" | "filled" | "error" | "skipped";

export interface User {
  id: string;
  privy_id: string;
  email: string | null;
  main_wallet: string | null;
  builder_fee_approved: boolean;
  guardrail_flagged: boolean;
  guardrail_detail: Record<string, unknown> | null;
  created_at: string;
}

export interface AgentKey {
  id: string;
  user_id: string;
  agent_address: string;
  encrypted_private_key: string;
  approved: boolean;
  created_at: string;
}

export interface Basket {
  id: string;
  owner_user_id: string | null;
  name: string;
  theme: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
}

export interface BasketAsset {
  id: string;
  basket_id: string;
  coin: string;
  dex: string;
  weight: number;
  sz_decimals: number;
  collateral: string;
  swap_pair: string | null;
  is_cross: boolean;
}

export interface Schedule {
  id: string;
  user_id: string;
  basket_id: string;
  amount_usd: number;
  interval_seconds: number;
  leverage: number;
  strategy_type: StrategyType;
  params: Record<string, unknown>;
  take_profit_pct: number | null;
  stop_loss_pct: number | null;
  status: ScheduleStatus;
  next_run_at: string;
  locked_until: string | null;
  session_started_at: string | null;
  created_at: string;
}

export interface ScheduleWithRelations extends Schedule {
  users: Pick<User, "main_wallet">;
  agent_keys: Pick<AgentKey, "agent_address" | "encrypted_private_key" | "approved"> | null;
  basket_assets: BasketAsset[];
}

export interface Execution {
  id: string;
  schedule_id: string;
  user_id: string;
  ran_at: string;
  cycle_start: string | null;
  status: ExecutionStatus;
  detail: Record<string, unknown>;
}

export interface Order {
  id: string;
  execution_id: string;
  schedule_id: string;
  coin: string;
  dex: string;
  cloid: string;
  requested_usd: number;
  status: OrderStatus;
  fill_px: number | null;
  fill_sz: number | null;
  notional: number | null;
  error: string | null;
  created_at: string;
}

export interface TradeIntent {
  asset: BasketAsset;
  marginUsd: number;
  trigger: string;
  refPrice?: number;
  dropPct?: number;
}

export interface TradeResult {
  coin: string;
  status: "filled" | "error" | "skipped";
  size?: string;
  price?: string;
  notional?: number;
  error?: string;
  trigger?: string;
  refPrice?: number;
  dropPct?: number;
  cloid?: string;
}
