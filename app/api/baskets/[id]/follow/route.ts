import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { followBasket } from "@/lib/baskets/manager";
import type { FollowMode } from "@/lib/db/types";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser(req.headers.get("authorization"));
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { mode?: FollowMode };
    const basket_follower = await followBasket(user.id, id, body.mode ?? "manual");
    return NextResponse.json({ success: true, basket_follower });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to follow basket";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
