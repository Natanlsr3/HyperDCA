import { NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/auth/privy";
import { upsertUser, getUserByPrivyId, saveAgentKey } from "@/lib/db/queries";
import { encryptPrivateKey } from "@/lib/crypto/envelope";
import { generateAgentKeypair } from "@/lib/executor/run-schedule";
import {
  getApproveAgentTypedData,
  getApproveBuilderFeeTypedData,
} from "@/lib/hl/approve";

export async function POST(req: Request) {
  try {
    const claims = await verifyPrivyToken(req.headers.get("authorization"));
    const body = await req.json().catch(() => ({}));
    const email = body.email as string | undefined;
    const mainWallet = body.mainWallet as string | undefined;
    const action = body.action as string | undefined;

    const user = await upsertUser(claims.userId, email, mainWallet);

    if (action === "generate-agent") {
      const { privateKey, address } = generateAgentKeypair();
      const encrypted = encryptPrivateKey(privateKey);
      await saveAgentKey(user.id, address, encrypted);
      return NextResponse.json({
        userId: user.id,
        agentAddress: address,
        approveAgent: getApproveAgentTypedData(address as `0x${string}`),
        approveBuilderFee: getApproveBuilderFeeTypedData(),
      });
    }

    if (action === "mark-approved") {
      const { markAgentApproved } = await import("@/lib/db/queries");
      await markAgentApproved(user.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Onboarding failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

export async function GET(req: Request) {
  try {
    const claims = await verifyPrivyToken(req.headers.get("authorization"));
    const user = await getUserByPrivyId(claims.userId);
    return NextResponse.json({ user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
