import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { getDemoBasket } from "@/lib/baskets/demo-data";
import { getBasketDetail } from "@/lib/baskets/manager";
import { isServiceDbConfigured } from "@/lib/db/client";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isServiceDbConfigured()) {
      const basket = getDemoBasket(id);
      if (!basket) return NextResponse.json({ error: "Basket not found" }, { status: 404 });
      return NextResponse.json({ basket });
    }
    let userId: string | undefined;
    try {
      const user = await getAuthenticatedUser(req.headers.get("authorization"));
      userId = user.id;
    } catch {
      userId = undefined;
    }
    const basket = await getBasketDetail(id, userId);
    if (!basket) return NextResponse.json({ error: "Basket not found" }, { status: 404 });
    return NextResponse.json({ basket });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load basket";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
