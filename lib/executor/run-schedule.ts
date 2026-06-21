import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { ScheduleWithRelations, TradeIntent, TradeResult } from "@/lib/db/types";
import { decryptPrivateKey } from "@/lib/crypto/envelope";
import {
  advanceSchedule,
  createExecution,
  createOrder,
  getRecentDcaFills,
  updateExecutionStatus,
} from "@/lib/db/queries";
import type { ExecuteTradeResult } from "@/lib/hl/order";
import { executeTradeForAsset, makeCloid } from "@/lib/hl/order";
import { getPerpAccountBalances } from "@/lib/hl/read";
import { planSimpleTimeBuys } from "@/lib/strategies/simple_time";
import { planSimpleDcaBuys } from "@/lib/strategies/simple_dca";
import { planPriceDropBuys } from "@/lib/strategies/price_drop";

function parseBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") {
    if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
    return Buffer.from(value, "base64");
  }
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new Error("Invalid encrypted_private_key format");
}

export async function executeSchedule(schedule: ScheduleWithRelations): Promise<{
  status: string;
  trades: TradeResult[];
}> {
  const mainWallet = schedule.users.main_wallet;
  const agentMeta = schedule.agent_keys;

  if (!mainWallet) {
    return { status: "skipped", trades: [{ coin: "*", status: "skipped", error: "no main wallet" }] };
  }
  if (!agentMeta?.approved) {
    return { status: "skipped", trades: [{ coin: "*", status: "skipped", error: "agent not approved" }] };
  }

  const { withdrawable } = await getPerpAccountBalances(mainWallet);
  if (withdrawable < Number(schedule.amount_usd)) {
    return {
      status: "skipped",
      trades: [{ coin: "*", status: "skipped", error: `awaiting funds (${withdrawable.toFixed(2)} USDC)` }],
    };
  }

  const privateKey = decryptPrivateKey(parseBuffer(agentMeta.encrypted_private_key));
  const agentAccount = privateKeyToAccount(privateKey as `0x${string}`);
  const assets = schedule.basket_assets;
  const now = new Date();
  const recentFills = await getRecentDcaFills(schedule.id);

  const alreadyBoughtThisCycle = (coin: string, cycleStart: Date) =>
    recentFills.some((f) => {
      const exec = f.executions as { cycle_start?: string; detail?: { deadline_catch_up?: boolean } } | null;
      return (
        f.coin === coin &&
        exec?.cycle_start &&
        new Date(exec.cycle_start).getTime() === cycleStart.getTime()
      );
    });

  const deadlineAttempted = (cycleStart: Date) =>
    recentFills.some((f) => {
      const exec = f.executions as { cycle_start?: string; detail?: { deadline_catch_up?: boolean } } | null;
      return (
        exec?.cycle_start &&
        new Date(exec.cycle_start).getTime() === cycleStart.getTime() &&
        exec.detail?.deadline_catch_up
      );
    });

  let intents: TradeIntent[] = [];
  let cycleStart: Date | null = null;
  let skipped: string[] = [];
  const sessionStartedAt = schedule.session_started_at
    ? new Date(schedule.session_started_at)
    : new Date(schedule.created_at);

  const isSimpleMode = schedule.params?.mode === "simple";
  const isDip = schedule.strategy_type === "price_drop";

  if (isDip) {
    const plan = await planPriceDropBuys({
      assets,
      amountUsd: Number(schedule.amount_usd),
      params: schedule.params,
      recentFills,
    });
    intents = plan.intents;
    skipped = plan.skipped;
  } else if (isSimpleMode) {
    const plan = planSimpleDcaBuys({
      assets,
      amountUsd: Number(schedule.amount_usd),
      intervalSeconds: schedule.interval_seconds,
      sessionStartedAt,
      now,
      alreadyBoughtThisCycle,
    });
    intents = plan.intents;
    cycleStart = plan.cycleStart;
    skipped = plan.skipped;
  } else {
    const plan = await planSimpleTimeBuys({
      assets,
      amountUsd: Number(schedule.amount_usd),
      params: schedule.params,
      intervalSeconds: schedule.interval_seconds,
      sessionStartedAt,
      now,
      alreadyBoughtThisCycle,
      deadlineAttempted,
      recentFills,
    });
    intents = plan.intents;
    cycleStart = plan.cycleStart;
    skipped = plan.skipped;
  }

  if (!intents.length) {
    await advanceSchedule(schedule.id, schedule.interval_seconds);
    return { status: "skipped", trades: skipped.map((s) => ({ coin: s, status: "skipped" })) };
  }

  const execution = await createExecution(
    schedule.id,
    schedule.user_id,
    "partial",
    {
      type: isDip ? "dip" : "dca",
      skipped,
      deadline_catch_up: cycleStart ? deadlineAttempted(cycleStart) : false,
    },
    cycleStart?.toISOString() ?? null,
  );

  const trades: TradeResult[] = [];
  const slippage = Number(schedule.params.slippage ?? 0.01);

  for (const intent of intents) {
    const cloid = makeCloid("hdca", schedule.id, intent.asset.coin);

    let result: ExecuteTradeResult;
    try {
      result = await executeTradeForAsset(
        agentAccount,
        mainWallet,
        intent.asset,
        intent.marginUsd,
        schedule.leverage,
        slippage,
        cloid,
      );
    } catch (e) {
      result = {
        coin: intent.asset.coin,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      };
    }

    try {
      await createOrder({
        execution_id: execution.id,
        schedule_id: schedule.id,
        coin: intent.asset.coin,
        dex: intent.asset.dex,
        cloid,
        requested_usd: intent.marginUsd,
        status: result.status === "filled" ? "filled" : "error",
        fill_px: result.price ? Number(result.price) : null,
        fill_sz: result.size ? Number(result.size) : null,
        notional: result.notional ?? null,
        error: result.error ?? null,
      });
    } catch (e) {
      console.error("createOrder failed", cloid, e instanceof Error ? e.message : e);
    }

    trades.push({
      ...result,
      trigger: intent.trigger,
      refPrice: intent.refPrice,
      dropPct: intent.dropPct,
      cloid,
    });
  }

  const filled = trades.filter((t) => t.status === "filled").length;
  const status = filled === trades.length ? "success" : filled > 0 ? "partial" : "error";

  // Persist the final status (execution row is created as "partial" up front).
  await updateExecutionStatus(execution.id, status);

  await advanceSchedule(
    schedule.id,
    schedule.interval_seconds,
    schedule.session_started_at ? undefined : sessionStartedAt.toISOString(),
  );

  return { status, trades };
}

export function generateAgentKeypair() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { privateKey, address: account.address };
}
