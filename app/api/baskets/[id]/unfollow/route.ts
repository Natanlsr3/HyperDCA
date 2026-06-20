import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { unfollowBasket } from "@/lib/baskets/manager";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser(req.headers.get("authorization"));
    const { id } = await params;
    await unfollowBasket(user.id, id);
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to unfollow basket";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
