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

type Breach = { userId: string; wallet: string; distancePct: number; worstCoin: string | null };

// Minimal email alert via Resend HTTP API (no SDK dependency).
// No-op with a warning when RESEND_API_KEY / ALERT_EMAIL are unset — never hardcode keys.
async function sendBreachAlert(breaches: Breach[]): Promise<boolean> {
  if (breaches.length === 0) return false;

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL;
  if (!apiKey || !to) {
    console.warn(
      "guardrail: RESEND_API_KEY or ALERT_EMAIL unset — skipping email for",
      breaches.length,
      "breach(es)",
    );
    return false;
  }

  const from = process.env.ALERT_FROM ?? "HyperDCA Guardrail <onboarding@resend.dev>";
  const lines = breaches
    .map((b) => `• ${b.wallet} — ${b.distancePct.toFixed(1)}% to liquidation (worst: ${b.worstCoin ?? "n/a"})`)
    .join("\n");
  const text = `Liquidation-distance breach (< ${GUARDRAIL_THRESHOLD_PCT}%) on ${breaches.length} account(s):\n\n${lines}`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: `HyperDCA guardrail: ${breaches.length} liquidation-distance breach(es)`,
        text,
      }),
    });
    if (!res.ok) {
      console.error("guardrail: email send failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("guardrail: email send error", e);
    return false;
  }
}

export async function POST(req: Request) {
  try {
    requireCronSecret(req.headers.get("authorization"));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schedules = await getActiveSchedulesForGuardrail();
  const checked = new Set<string>();
  const alerts: Breach[] = [];
  const newlyBreached: Breach[] = [];

  for (const schedule of schedules) {
    const user = schedule.users as { id: string; main_wallet: string; guardrail_flagged: boolean };
    if (!user.main_wallet || checked.has(user.id)) continue;
    checked.add(user.id);

    try {
      const allState = await getAllDexsClearinghouseState(user.main_wallet);
      let accountValue = 0;
      let maintenanceMarginUsed = 0;

      for (const state of Object.values(allState) as ClearinghouseStateResponse[]) {
        accountValue += Number(state.marginSummary?.accountValue ?? 0);
        maintenanceMarginUsed += Number(state.crossMaintenanceMarginUsed ?? 0);
      }

      const positions = await getMergedPositions(user.main_wallet);
      const { minDistancePct, worstCoin } = computeLiquidationDistance(
        accountValue,
        maintenanceMarginUsed,
        positions,
      );

      const breached = minDistancePct < GUARDRAIL_THRESHOLD_PCT;
      const breach: Breach = {
        userId: user.id,
        wallet: user.main_wallet,
        distancePct: minDistancePct,
        worstCoin,
      };
      if (breached !== user.guardrail_flagged) {
        await flagUserGuardrail(user.id, breached, {
          minDistancePct,
          worstCoin,
          accountValue,
          maintenanceMarginUsed,
          checkedAt: new Date().toISOString(),
        });
        // Email only on the transition into a breach, so the cron doesn't re-spam.
        if (breached) newlyBreached.push(breach);
      }

      if (breached) {
        alerts.push(breach);
      }
    } catch (e) {
      console.error("guardrail check failed", user.id, e);
    }
  }

  const emailed = await sendBreachAlert(newlyBreached);

  return NextResponse.json({
    checked: checked.size,
    alerts,
    newlyBreached: newlyBreached.length,
    emailed,
    thresholdPct: GUARDRAIL_THRESHOLD_PCT,
  });
}

export async function GET(req: Request) {
  return POST(req);
}
