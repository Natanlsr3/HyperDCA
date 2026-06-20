import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { executeMirrorTrades, getMirrorPlan } from "@/lib/baskets/mirror-engine";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser(req.headers.get("authorization"));
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      allocationUsd?: number;
      leverage?: number;
      slippage?: number;
      execute?: boolean;
    };
    if (!body.execute) {
      const plan = await getMirrorPlan(user.id, id, { allocationUsd: body.allocationUsd });
      return NextResponse.json({ success: true, dryRun: true, plan, trades: plan.trades });
    }
    const result = await executeMirrorTrades(user.id, id, body);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to mirror basket";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
