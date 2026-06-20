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
    if (!agent?.approved) {
      return NextResponse.json({ error: "Agent not approved" }, { status: 400 });
    }

    const wallet = user.main_wallet;
    if (!wallet) {
      return NextResponse.json({ error: "No wallet" }, { status: 400 });
    }

    const assets = schedule.basket_assets as BasketAsset[];
    const assetCoins = new Set(assets.map((a) => a.coin));
    const positions = await getMergedPositions(wallet);
    const toClose = positions.filter((p) => assetCoins.has(p.coin));

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

    await closeSchedule(id, user.id);

    return NextResponse.json({ closed: results.length, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Close failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
