import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { createServiceClient, isServiceDbConfigured } from "@/lib/db/client";

export async function GET(req: Request) {
  try {
    if (!isServiceDbConfigured()) {
      return NextResponse.json({
        notifications: [],
        totalCount: 0,
        demo: true,
        code: "DATABASE_NOT_CONFIGURED",
        message: "Notifications unlock when Supabase is connected.",
      });
    }

    const user = await getAuthenticatedUser(req.headers.get("authorization"));
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit") ?? 20);
    const offset = Number(searchParams.get("offset") ?? 0);
    const supa = createServiceClient();
    const { data, count, error } = await supa
      .from("notifications")
      .select("*, baskets(name)", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return NextResponse.json({ notifications: data ?? [], totalCount: count ?? 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load notifications";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
