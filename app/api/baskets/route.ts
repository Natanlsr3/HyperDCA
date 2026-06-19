import { NextResponse } from "next/server";
import { getPublicBaskets, getBasketById } from "@/lib/db/queries";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  try {
    if (id) {
      const basket = await getBasketById(id);
      return NextResponse.json({ basket });
    }
    const baskets = await getPublicBaskets();
    return NextResponse.json({ baskets });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load baskets";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
