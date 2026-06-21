import type { Basket, BasketAsset, Execution, Order, ScheduleWithRelations } from "./types";
import { createServiceClient } from "./client";

type DcaFillRow = Pick<Order, "coin" | "fill_px" | "created_at"> & {
  executions:
    | Pick<Execution, "cycle_start" | "detail">[]
    | Pick<Execution, "cycle_start" | "detail">
    | null;
};

export async function getPublicBaskets(): Promise<(Basket & { basket_assets: BasketAsset[] })[]> {
  const supa = createServiceClient();
  const { data, error } = await supa
    .from("baskets")
    .select("*, basket_assets(*)")
    .eq("is_public", true)
    .is("owner_user_id", null)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function getBasketById(id: string) {
  const supa = createServiceClient();
  const { data, error } = await supa
    .from("baskets")
    .select("*, basket_assets(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

// Never null out existing email/main_wallet: only write columns we actually have.
// main_wallet is linked separately via linkMainWallet once the embedded wallet exists.
export async function upsertUser(privyId: string, email?: string | null) {
  const supa = createServiceClient();
  const payload: { privy_id: string; email?: string } = { privy_id: privyId };
  if (email) payload.email = email;
  const { data, error } = await supa
    .from("users")
    .upsert(payload, { onConflict: "privy_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// Links the Privy embedded wallet (the HL master account) without clobbering it on
// subsequent logins. Caller must have ensured the user row exists (upsertUser first).
export async function linkMainWallet(privyId: string, wallet: string) {
  const supa = createServiceClient();
  const { data, error } = await supa
    .from("users")
    .update({ main_wallet: wallet })
    .eq("privy_id", privyId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getUserByPrivyId(privyId: string) {
  const supa = createServiceClient();
  const { data, error } = await supa.from("users").select("*").eq("privy_id", privyId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveAgentKey(
  userId: string,
  agentAddress: string,
  encryptedPrivateKey: Buffer,
) {
  const supa = createServiceClient();
  const { data, error } = await supa
    .from("agent_keys")
    .upsert(
      {
        user_id: userId,
        agent_address: agentAddress,
        encrypted_private_key: "\\x" + encryptedPrivateKey.toString("hex"),
        approved: false,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getAgentKey(userId: string) {
  const supa = createServiceClient();
  const { data, error } = await supa
    .from("agent_keys")
    .select("agent_address, encrypted_private_key, approved")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function markAgentApproved(userId: string) {
  const supa = createServiceClient();
  const { error: e1 } = await supa.from("agent_keys").update({ approved: true }).eq("user_id", userId);
  if (e1) throw e1;
  const { error: e2 } = await supa.from("users").update({ builder_fee_approved: true }).eq("id", userId);
  if (e2) throw e2;
}

export async function isUserOnboarded(userId: string) {
  const supa = createServiceClient();
  const [{ data: user, error: userErr }, { data: agent, error: agentErr }] = await Promise.all([
    supa.from("users").select("builder_fee_approved").eq("id", userId).single(),
    supa.from("agent_keys").select("approved").eq("user_id", userId).maybeSingle(),
  ]);
  if (userErr) throw userErr;
  if (agentErr) throw agentErr;
  return Boolean(user?.builder_fee_approved && agent?.approved);
}

// agent_keys has no FK to schedules; it joins via users (agent_keys.user_id -> users.id),
// so it must be embedded under users, not directly off schedules (else PGRST200).
const CLAIM_SELECT = `*, users!inner(main_wallet, agent_keys(agent_address, encrypted_private_key, approved))`;

type AgentKeyEmbed = ScheduleWithRelations["agent_keys"];

// PostgREST returns embedded to-many rows as arrays. agent_keys is unique per user,
// so collapse the array to the single key (or null).
function flattenClaimed(locked: Record<string, unknown>, assets: BasketAsset[]): ScheduleWithRelations {
  const users = locked.users as { main_wallet: string | null; agent_keys: AgentKeyEmbed[] | AgentKeyEmbed | null };
  const agentKey = Array.isArray(users.agent_keys)
    ? users.agent_keys[0] ?? null
    : users.agent_keys ?? null;
  return {
    ...locked,
    users: { main_wallet: users.main_wallet },
    agent_keys: agentKey,
    basket_assets: assets,
  } as ScheduleWithRelations;
}

export async function claimDueSchedules(limit = 20): Promise<ScheduleWithRelations[]> {
  const supa = createServiceClient();
  const now = new Date().toISOString();

  const { data: schedules, error } = await supa
    .from("schedules")
    .select(CLAIM_SELECT)
    .eq("status", "active")
    .lte("next_run_at", now)
    .or(`locked_until.is.null,locked_until.lte.${now}`)
    .limit(limit);

  if (error) throw error;
  if (!schedules?.length) return [];

  const claimed: ScheduleWithRelations[] = [];
  for (const row of schedules) {
    const lockUntil = new Date(Date.now() + 5 * 60_000).toISOString();
    const { data: locked, error: lockErr } = await supa
      .from("schedules")
      .update({ locked_until: lockUntil })
      .eq("id", row.id)
      .or(`locked_until.is.null,locked_until.lte.${now}`)
      .select(CLAIM_SELECT)
      .maybeSingle();

    if (lockErr || !locked) continue;

    const { data: assets, error: assetsErr } = await supa
      .from("basket_assets")
      .select("*")
      .eq("basket_id", locked.basket_id);
    if (assetsErr || !assets?.length) continue;

    claimed.push(flattenClaimed(locked, assets));
  }
  return claimed;
}

export async function advanceSchedule(
  scheduleId: string,
  intervalSeconds: number,
  sessionStartedAt?: string | null,
) {
  const supa = createServiceClient();
  const jitterMs = Math.floor(Math.random() * 5 * 60_000);
  const next = new Date(Date.now() + intervalSeconds * 1000 + jitterMs).toISOString();
  const patch: Record<string, unknown> = { next_run_at: next, locked_until: null };
  if (sessionStartedAt) patch.session_started_at = sessionStartedAt;
  const { error } = await supa.from("schedules").update(patch).eq("id", scheduleId);
  if (error) throw error;
}

export async function createExecution(
  scheduleId: string,
  userId: string,
  status: string,
  detail: Record<string, unknown>,
  cycleStart?: string | null,
) {
  const supa = createServiceClient();
  const { data, error } = await supa
    .from("executions")
    .insert({
      schedule_id: scheduleId,
      user_id: userId,
      status,
      detail,
      cycle_start: cycleStart ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateExecutionStatus(executionId: string, status: string) {
  const supa = createServiceClient();
  const { error } = await supa.from("executions").update({ status }).eq("id", executionId);
  if (error) throw error;
}

export async function createOrder(row: {
  execution_id: string;
  schedule_id: string;
  coin: string;
  dex: string;
  cloid: string;
  requested_usd: number;
  status: string;
  fill_px?: number | null;
  fill_sz?: number | null;
  notional?: number | null;
  error?: string | null;
}) {
  const supa = createServiceClient();
  const { data, error } = await supa.from("orders").insert(row).select("*").single();
  if (error) throw error;
  return data;
}

export async function getActiveSchedulesForGuardrail() {
  const supa = createServiceClient();
  // No basket_assets embed: it has no FK to schedules (PGRST200) and the
  // guardrail only reads the user, so we don't need it here.
  const { data, error } = await supa
    .from("schedules")
    .select("*, users!inner(id, main_wallet, guardrail_flagged)")
    .eq("status", "active")
    .gt("leverage", 1);
  if (error) throw error;
  return data ?? [];
}

export async function flagUserGuardrail(
  userId: string,
  flagged: boolean,
  detail: Record<string, unknown>,
) {
  const supa = createServiceClient();
  const { error } = await supa
    .from("users")
    .update({ guardrail_flagged: flagged, guardrail_detail: detail })
    .eq("id", userId);
  if (error) throw error;
}

export async function getUserSchedules(userId: string) {
  const supa = createServiceClient();
  // basket_assets joins via baskets (basket_assets.basket_id -> baskets.id),
  // so nest it under baskets rather than directly off schedules (PGRST200).
  const { data, error } = await supa
    .from("schedules")
    .select("*, baskets(name, theme, basket_assets(*))")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createSchedule(input: {
  user_id: string;
  basket_id: string;
  amount_usd: number;
  interval_seconds: number;
  leverage: number;
  strategy_type: string;
  params?: Record<string, unknown>;
}) {
  const supa = createServiceClient();
  const jitterMs = Math.floor(Math.random() * 5 * 60_000);
  const next = new Date(Date.now() + input.interval_seconds * 1000 + jitterMs).toISOString();
  const { data, error } = await supa
    .from("schedules")
    .insert({
      ...input,
      params: input.params ?? {},
      next_run_at: next,
      session_started_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getRecentDcaFills(scheduleId: string) {
  const supa = createServiceClient();
  const { data, error } = await supa
    .from("orders")
    .select("coin, fill_px, created_at, executions(cycle_start, detail)")
    .eq("schedule_id", scheduleId)
    .eq("status", "filled")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as DcaFillRow[]).map((row) => ({
    coin: row.coin,
    fill_px: row.fill_px,
    created_at: row.created_at,
    executions: (Array.isArray(row.executions) ? row.executions[0] : row.executions) ?? undefined,
  }));
}

export async function getScheduleByIdForUser(scheduleId: string, userId: string) {
  const supa = createServiceClient();
  // basket_assets joins via baskets; agent_keys joins via users — embed under
  // their real FK parents, then flatten to top-level fields for the caller.
  const { data, error } = await supa
    .from("schedules")
    .select("*, baskets!inner(basket_assets(*)), users!inner(main_wallet, agent_keys(*))")
    .eq("id", scheduleId)
    .eq("user_id", userId)
    .single();
  if (error) throw error;

  const baskets = data.baskets as { basket_assets: BasketAsset[] } | null;
  const users = data.users as { main_wallet: string | null; agent_keys: unknown[] | unknown | null };
  const agentKey = Array.isArray(users?.agent_keys)
    ? users.agent_keys[0] ?? null
    : users?.agent_keys ?? null;

  return {
    ...data,
    basket_assets: baskets?.basket_assets ?? [],
    agent_keys: agentKey,
  };
}

export async function closeSchedule(scheduleId: string, userId: string) {
  const supa = createServiceClient();
  const { error } = await supa
    .from("schedules")
    .update({ status: "closed" })
    .eq("id", scheduleId)
    .eq("user_id", userId);
  if (error) throw error;
}
