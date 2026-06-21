import { NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/auth/privy";
import { isServiceDbConfigured } from "@/lib/db/client";
import {
  closeSchedule,
  getScheduleByIdForUser,
  getUserByPrivyId,
} from "@/lib/db/queries";
import { decryptPrivateKey } from "@/lib/crypto/envelope";
import { closePositionForAsset, makeCloid } from "@/lib/hl/order";
import { getMergedPositions } from "@/lib/hl/read";
import { privateKeyToAccount } from "viem/accounts";
import type { BasketAsset } from "@/lib/db/types";

function parseBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") {
    if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
    return Buffer.from(value, "base64");
  }
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new Error("Invalid encrypted_private_key format");
}

function clientCloseError(e: unknown): string {
  if (!(e instanceof Error)) return "Failed to close basket positions";
  const msg = e.message.toLowerCase();
  if (msg.includes("authenticate data") || msg.includes("unsupported state")) {
    return "Agent key could not be decrypted. Re-approve your agent and try again.";
  }
  return "Failed to close basket positions";
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!isServiceDbConfigured()) {
      return NextResponse.json(
        {
          error: "Closing schedules unlocks when Supabase is connected.",
          code: "DATABASE_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }

    const { id } = await params;
    const claims = await verifyPrivyToken(req.headers.get("authorization"));
    const user = await getUserByPrivyId(claims.userId);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const schedule = await getScheduleByIdForUser(id, user.id);
    const agent = schedule.agent_keys as { encrypted_private_key: unknown; approved: boolean } | null;

    const wallet = user.main_wallet;
    const assets = schedule.basket_assets as BasketAsset[];
    const assetCoins = new Set(assets.map((a) => a.coin));

    let toClose: Awaited<ReturnType<typeof getMergedPositions>> = [];
    if (wallet) {
      const positions = await getMergedPositions(wallet);
      toClose = positions.filter((p) => assetCoins.has(p.coin));
    }

    if (toClose.length === 0) {
      await closeSchedule(id, user.id);
      return NextResponse.json({ closed: 0, results: [] });
    }

    if (!agent?.approved || !wallet) {
      return NextResponse.json(
        { error: "Open positions remain but the trading agent is not ready. Complete onboarding and try again." },
        { status: 409 },
      );
    }

    const privateKey = decryptPrivateKey(parseBuffer(agent.encrypted_private_key));
    const agentAccount = privateKeyToAccount(privateKey as `0x${string}`);

    const results = [];
    for (const pos of toClose) {
      const asset = assets.find((a) => a.coin === pos.coin);
      if (!asset) continue;
      const size = Math.abs(pos.szi);
      const cloid = makeCloid("close", id, pos.coin);
      const result = await closePositionForAsset(agentAccount, asset, size, 0.02, cloid);
      results.push(result);
    }

    const failed = results.filter((r) => r.status !== "filled");
    if (failed.length > 0) {
      const coins = failed.map((r) => r.coin).join(", ");
      return NextResponse.json(
        {
          error: `Could not close ${failed.length} position(s) (${coins}). Schedule remains active — try again.`,
          results,
        },
        { status: 409 },
      );
    }

    await closeSchedule(id, user.id);
    return NextResponse.json({ closed: results.length, results });
  } catch (e) {
    return NextResponse.json({ error: clientCloseError(e) }, { status: 409 });
  }
}
