import { verifyPrivyToken } from "@/lib/auth/privy";
import { createServiceClient } from "@/lib/db/client";
import { getUserByPrivyId } from "@/lib/db/queries";
import type { User } from "@/lib/db/types";

function envAdmins() {
  return new Set(
    (process.env.HYPERDCA_ADMIN_PRIVY_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export async function getAuthenticatedUser(authHeader: string | null): Promise<User> {
  const claims = await verifyPrivyToken(authHeader);
  const user = await getUserByPrivyId(claims.userId);
  if (!user) throw new Error("User not found");
  return user as User;
}

export function isPlatformAdmin(user: Pick<User, "privy_id" | "is_admin">) {
  return Boolean(user.is_admin) || envAdmins().has(user.privy_id);
}

export async function canAdministerBasket(userId: string): Promise<boolean> {
  const supa = createServiceClient();
  const { data, error } = await supa.from("users").select("privy_id,is_admin").eq("id", userId).single();
  if (error) throw error;
  return isPlatformAdmin(data);
}

export async function canEditBasket(userId: string, basketId: string): Promise<boolean> {
  const supa = createServiceClient();
  const { data: user, error: userErr } = await supa
    .from("users")
    .select("privy_id,is_admin")
    .eq("id", userId)
    .single();
  if (userErr) throw userErr;
  if (isPlatformAdmin(user)) return true;

  const { data: basket, error: basketErr } = await supa
    .from("baskets")
    .select("owner_user_id")
    .eq("id", basketId)
    .single();
  if (basketErr) throw basketErr;
  return basket.owner_user_id === userId;
}
