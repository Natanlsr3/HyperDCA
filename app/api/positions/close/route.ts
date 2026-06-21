import { NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { verifyPrivyToken } from "@/lib/auth/privy";
import { getAgentKey, getUserByPrivyId } from "@/lib/db/queries";
import { decryptPrivateKey } from "@/lib/crypto/envelope";
import { closePositionForAsset, makeCloid } from "@/lib/hl/order";
import { getMergedPositions, getSzDecimals } from "@/lib/hl/read";
import type { BasketAsset } from "@/lib/db/types";

export const maxDuration = 60;

function parseBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") {
    if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
    return Buffer.from(value, "base64");
  }
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new Error("Invalid encrypted_private_key format");
}

// Manually close a single open position (any basket) via the agent wallet —
// a reduce-only IOC sell. Independent of schedules; does not touch them.
export async function POST(req: Request) {
  try {
    const claims = await verifyPrivyToken(req.headers.get("authorization"));
    const user = await getUserByPrivyId(claims.userId);
    if (!user?.main_wallet) {
      return NextResponse.json({ error: "Wallet not linked" }, { status: 400 });
    }

    const body = await req.json();
    const coin: string = body.coin;
    const dex: string = body.dex ?? "";
    if (!coin) return NextResponse.json({ error: "coin required" }, { status: 400 });

    const positions = await getMergedPositions(user.main_wallet);
    const pos = positions.find((p) => p.coin === coin && p.dex === dex);
    if (!pos || pos.szi === 0) {
      return NextResponse.json({ error: `No open position for ${coin}` }, { status: 404 });
    }

    const agent = await getAgentKey(user.id);
    if (!agent?.approved) {
      return NextResponse.json(
        { error: "Trading agent not ready. Complete onboarding and try again." },
        { status: 409 },
      );
    }

    const szDecimals = await getSzDecimals(coin, dex);
    if (szDecimals === null) {
      return NextResponse.json({ error: `Unknown asset ${coin}` }, { status: 400 });
    }

    const privateKey = decryptPrivateKey(parseBuffer(agent.encrypted_private_key));
    const agentAccount = privateKeyToAccount(privateKey as `0x${string}`);
    const asset: BasketAsset = {
      id: "",
      basket_id: "",
      coin,
      dex,
      weight: 0,
      sz_decimals: szDecimals,
      collateral: "USDC",
      swap_pair: null,
      is_cross: true,
    };

    const cloid = makeCloid("manualclose", user.id, coin);
    const result = await closePositionForAsset(agentAccount, asset, Math.abs(pos.szi), 0.02, cloid);

    if (result.status !== "filled") {
      return NextResponse.json(
        { error: `Could not close ${coin}: ${result.error ?? "unknown"}`, result },
        { status: 409 },
      );
    }
    return NextResponse.json({ closed: 1, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to close position";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
