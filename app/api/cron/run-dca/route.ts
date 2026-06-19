import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth/privy";
import { claimDueSchedules } from "@/lib/db/queries";
import { executeSchedule } from "@/lib/executor/run-schedule";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    requireCronSecret(req.headers.get("authorization"));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schedules = await claimDueSchedules(20);
  const results: { scheduleId: string; status: string; trades: unknown[] }[] = [];

  for (const schedule of schedules) {
    try {
      const result = await executeSchedule(schedule);
      results.push({ scheduleId: schedule.id, ...result });
    } catch (e) {
      results.push({
        scheduleId: schedule.id,
        status: "error",
        trades: [{ error: e instanceof Error ? e.message : String(e) }],
      });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}

export async function GET(req: Request) {
  return POST(req);
}
