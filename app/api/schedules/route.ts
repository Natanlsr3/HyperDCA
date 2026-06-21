import { NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/auth/privy";
import {
  createSchedule,
  getScheduleByIdForUser,
  getUserByPrivyId,
  getUserSchedules,
  isUserOnboarded,
} from "@/lib/db/queries";
import { isServiceDbConfigured } from "@/lib/db/client";
import { executeSchedule } from "@/lib/executor/run-schedule";
import type { ScheduleWithRelations } from "@/lib/db/types";

// First buy runs inline at creation (placing HL orders), so allow headroom.
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    if (!isServiceDbConfigured()) {
      return NextResponse.json({
        schedules: [],
        demo: true,
        code: "DATABASE_NOT_CONFIGURED",
        message: "Schedules unlock when Supabase is connected.",
      });
    }

    const claims = await verifyPrivyToken(req.headers.get("authorization"));
    const user = await getUserByPrivyId(claims.userId);
    if (!user) return NextResponse.json({ schedules: [] });
    const schedules = await getUserSchedules(user.id);
    return NextResponse.json({ schedules });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    if (!isServiceDbConfigured()) {
      return NextResponse.json(
        {
          error: "Schedules unlock when Supabase is connected.",
          code: "DATABASE_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }

    const claims = await verifyPrivyToken(req.headers.get("authorization"));
    const user = await getUserByPrivyId(claims.userId);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (!(await isUserOnboarded(user.id))) {
      return NextResponse.json(
        {
          error: "onboarding_required",
          message: "Complete account setup (agent + builder fee approval) before starting a schedule.",
        },
        { status: 409 },
      );
    }

    const body = await req.json();
    // Product is Simple-DCA only: force the simple time strategy regardless of
    // what the client sends (smart / price_drop are disabled).
    const slippage = Number(body.params?.slippage ?? 0.01);
    const schedule = await createSchedule({
      user_id: user.id,
      basket_id: body.basketId,
      amount_usd: Number(body.amountUsd),
      interval_seconds: Number(body.intervalSeconds ?? 86400),
      leverage: Number(body.leverage ?? 1),
      strategy_type: "simple_time",
      params: { slippage, mode: "simple" },
    });

    // Fire the FIRST buy immediately so the user doesn't wait a full interval
    // for the cron. Best-effort: never fail creation if the first trade errors.
    let firstRun: { status: string; error?: string } | null = null;
    try {
      const full = await getScheduleByIdForUser(schedule.id, user.id);
      const result = await executeSchedule(full as unknown as ScheduleWithRelations);
      firstRun = { status: result.status };
    } catch (e) {
      firstRun = { status: "error", error: e instanceof Error ? e.message : String(e) };
    }

    return NextResponse.json({ schedule, firstRun });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create schedule";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
