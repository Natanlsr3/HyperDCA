import type { ClearinghouseStateResponse } from "@nktkas/hyperliquid/api/info";
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth/privy";
import { flagUserGuardrail, getActiveSchedulesForGuardrail } from "@/lib/db/queries";
import {
  computeLiquidationDistance,
  getAllDexsClearinghouseState,
  getMergedPositions,
} from "@/lib/hl/read";

const GUARDRAIL_THRESHOLD_PCT = 15;

export async function POST(req: Request) {
  try {
    requireCronSecret(req.headers.get("authorization"));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schedules = await getActiveSchedulesForGuardrail();
  const checked = new Set<string>();
  const alerts: { userId: string; wallet: string; distancePct: number; worstCoin: string | null }[] = [];

  for (const schedule of schedules) {
    const user = schedule.users as { id: string; main_wallet: string; guardrail_flagged: boolean };
    if (!user.main_wallet || checked.has(user.id)) continue;
    checked.add(user.id);

    try {
      const allState = await getAllDexsClearinghouseState(user.main_wallet);
      let accountValue = 0;
      let totalMarginUsed = 0;

      for (const state of Object.values(allState) as ClearinghouseStateResponse[]) {
        accountValue += Number(state.marginSummary?.accountValue ?? 0);
        totalMarginUsed += Number(state.marginSummary?.totalMarginUsed ?? 0);
      }

      const positions = await getMergedPositions(user.main_wallet);
      const { minDistancePct, worstCoin } = computeLiquidationDistance(
        accountValue,
        totalMarginUsed,
        positions,
      );

      const breached = minDistancePct < GUARDRAIL_THRESHOLD_PCT;
      if (breached !== user.guardrail_flagged) {
        await flagUserGuardrail(user.id, breached, {
          minDistancePct,
          worstCoin,
          accountValue,
          totalMarginUsed,
          checkedAt: new Date().toISOString(),
        });
      }

      if (breached) {
        alerts.push({
          userId: user.id,
          wallet: user.main_wallet,
          distancePct: minDistancePct,
          worstCoin,
        });
      }
    } catch (e) {
      console.error("guardrail check failed", user.id, e);
    }
  }

  return NextResponse.json({
    checked: checked.size,
    alerts,
    thresholdPct: GUARDRAIL_THRESHOLD_PCT,
  });
}

export async function GET(req: Request) {
  return POST(req);
}
