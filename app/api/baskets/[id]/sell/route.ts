import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { closePositionInBasket } from "@/lib/baskets/mirror-engine";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser(req.headers.get("authorization"));
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { execute?: boolean };
    const result = await closePositionInBasket(user.id, id, body.execute === true);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to close basket positions";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
