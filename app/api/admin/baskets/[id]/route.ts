import { NextResponse } from "next/server";
import { canEditBasket, getAuthenticatedUser } from "@/lib/auth/permissions";
import { detectBasketChange, notifyFollowers } from "@/lib/baskets/change-detector";
import { updateBasketComposition } from "@/lib/baskets/manager";
import { createServiceClient } from "@/lib/db/client";
import type { CompositionItem } from "@/lib/db/types";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser(req.headers.get("authorization"));
    const { id } = await params;
    if (!(await canEditBasket(user.id, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = (await req.json()) as {
      name?: string;
      theme?: string;
      description?: string;
      is_public?: boolean;
      composition?: CompositionItem[];
    };
    let notified_followers = 0;
    let change = null;
    if (body.composition) {
      change = await detectBasketChange(id, body.composition, user.id);
    }
    let basket;
    if (body.composition) {
      basket = await updateBasketComposition(id, body.composition, {
        name: body.name,
        theme: body.theme,
        description: body.description,
        is_public: body.is_public,
      });
    } else {
      const supa = createServiceClient();
      const { data, error } = await supa
        .from("baskets")
        .update({
          name: body.name,
          theme: body.theme,
          description: body.description,
          is_public: body.is_public,
        })
        .eq("id", id)
        .select("*, basket_assets(*)")
        .single();
      if (error) throw error;
      basket = data;
    }
    if (change) notified_followers = await notifyFollowers(id, change);
    return NextResponse.json({ basket, notified_followers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update basket";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
