import { NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/auth/privy";
import { createSchedule, getUserByPrivyId, getUserSchedules } from "@/lib/db/queries";

export async function GET(req: Request) {
  try {
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
    const claims = await verifyPrivyToken(req.headers.get("authorization"));
    const user = await getUserByPrivyId(claims.userId);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await req.json();
    const schedule = await createSchedule({
      user_id: user.id,
      basket_id: body.basketId,
      amount_usd: Number(body.amountUsd),
      interval_seconds: Number(body.intervalSeconds ?? 86400),
      leverage: Number(body.leverage ?? 1),
      strategy_type: body.strategyType ?? "simple_time",
      params: body.params ?? {},
    });

    return NextResponse.json({ schedule });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create schedule";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
