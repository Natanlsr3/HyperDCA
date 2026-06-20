import { NextResponse } from "next/server";
import { canAdministerBasket, getAuthenticatedUser } from "@/lib/auth/permissions";
import { createPublicBasket } from "@/lib/baskets/manager";
import type { CompositionItem } from "@/lib/db/types";

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req.headers.get("authorization"));
    if (!(await canAdministerBasket(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = (await req.json()) as {
      name: string;
      description?: string;
      theme?: string;
      composition: CompositionItem[];
      network?: "mainnet" | "testnet";
    };
    const basket = await createPublicBasket({
      name: body.name,
      description: body.description,
      theme: body.theme,
      composition: body.composition,
      network: body.network,
      createdByUserId: user.id,
    });
    return NextResponse.json({ basket, id: basket?.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create basket";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
