import { NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/auth/privy";
import { isServiceDbConfigured } from "@/lib/db/client";
import {
  upsertUser,
  linkMainWallet,
  getUserByPrivyId,
  saveAgentKey,
  isUserOnboarded,
} from "@/lib/db/queries";
import { createServiceClient } from "@/lib/db/client";
import { encryptPrivateKey } from "@/lib/crypto/envelope";
import { generateAgentKeypair } from "@/lib/executor/run-schedule";
import {
  checkApprovals,
  getApproveAgentTypedData,
  getApproveBuilderFeeTypedData,
} from "@/lib/hl/approve";

export async function POST(req: Request) {
  try {
    if (!isServiceDbConfigured()) {
      return NextResponse.json(
        {
          error: "Onboarding unlocks when Supabase is connected.",
          code: "DATABASE_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }

    const claims = await verifyPrivyToken(req.headers.get("authorization"));
    const body = await req.json().catch(() => ({}));
    const email = body.email as string | undefined;
    const mainWallet = body.mainWallet as string | undefined;
    const action = body.action as string | undefined;

    let user = await upsertUser(claims.userId, email);

    // Link the embedded wallet (HL master account) once it exists. Idempotent.
    if (mainWallet) {
      user = await linkMainWallet(claims.userId, mainWallet);
    }

    if (action === "link-wallet") {
      return NextResponse.json({ ok: true, user });
    }

    if (action === "generate-agent") {
      const supa = createServiceClient();
      const { data: existing, error: existingErr } = await supa
        .from("agent_keys")
        .select("agent_address")
        .eq("user_id", user.id)
        .maybeSingle();
      if (existingErr) throw existingErr;

      if (existing?.agent_address) {
        const address = existing.agent_address as `0x${string}`;
        return NextResponse.json({
          userId: user.id,
          agentAddress: address,
          existing: true,
          approveAgent: getApproveAgentTypedData(address),
          approveBuilderFee: getApproveBuilderFeeTypedData(),
        });
      }

      const { privateKey, address } = generateAgentKeypair();
      const encrypted = encryptPrivateKey(privateKey);
      await saveAgentKey(user.id, address, encrypted);
      return NextResponse.json({
        userId: user.id,
        agentAddress: address,
        existing: false,
        approveAgent: getApproveAgentTypedData(address as `0x${string}`),
        approveBuilderFee: getApproveBuilderFeeTypedData(),
      });
    }

    if (action === "check-approval-status") {
      if (!user.main_wallet) {
        return NextResponse.json(
          { error: "No main wallet on file. Reconnect your wallet and retry." },
          { status: 400 },
        );
      }

      const supa = createServiceClient();
      const { data: agentKey, error: agentErr } = await supa
        .from("agent_keys")
        .select("agent_address")
        .eq("user_id", user.id)
        .maybeSingle();
      if (agentErr) throw agentErr;
      if (!agentKey?.agent_address) {
        return NextResponse.json(
          { error: "No agent key found. Generate an agent first." },
          { status: 400 },
        );
      }

      const status = await checkApprovals(
        user.main_wallet as `0x${string}`,
        agentKey.agent_address as `0x${string}`,
      );

      return NextResponse.json({ ok: true, ...status });
    }

    if (action === "verify-approval") {
      if (!user.main_wallet) {
        return NextResponse.json(
          { error: "No main wallet on file. Reconnect your wallet and retry." },
          { status: 400 },
        );
      }

      const supa = createServiceClient();
      const { data: agentKey, error: agentErr } = await supa
        .from("agent_keys")
        .select("agent_address")
        .eq("user_id", user.id)
        .maybeSingle();
      if (agentErr) throw agentErr;
      if (!agentKey?.agent_address) {
        return NextResponse.json(
          { error: "No agent key found. Generate an agent first." },
          { status: 400 },
        );
      }

      const status = await checkApprovals(
        user.main_wallet as `0x${string}`,
        agentKey.agent_address as `0x${string}`,
      );

      if (status.agentApproved && status.builderApproved) {
        const { markAgentApproved } = await import("@/lib/db/queries");
        await markAgentApproved(user.id);
        return NextResponse.json({ ok: true, approved: true, ...status });
      }

      return NextResponse.json({ ok: false, approved: false, ...status });
    }

    return NextResponse.json({ user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Onboarding failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

export async function GET(req: Request) {
  try {
    if (!isServiceDbConfigured()) {
      return NextResponse.json({
        user: null,
        demo: true,
        onboarded: false,
        code: "DATABASE_NOT_CONFIGURED",
        message: "Onboarding unlocks when Supabase is connected.",
      });
    }

    const claims = await verifyPrivyToken(req.headers.get("authorization"));
    const user = await getUserByPrivyId(claims.userId);
    if (!user) {
      return NextResponse.json({
        user: null,
        onboarded: false,
        agentAddress: null,
        approved: false,
      });
    }

    const supa = createServiceClient();
    const { data: agentKey, error: agentErr } = await supa
      .from("agent_keys")
      .select("agent_address, approved")
      .eq("user_id", user.id)
      .maybeSingle();
    if (agentErr) throw agentErr;

    const onboarded = await isUserOnboarded(user.id);
    const agentAddress = agentKey?.agent_address ?? null;
    const approved = Boolean(agentKey?.approved);

    const payload: Record<string, unknown> = {
      user,
      onboarded,
      agentAddress,
      approved,
    };

    if (agentAddress && !onboarded) {
      payload.approveAgent = getApproveAgentTypedData(agentAddress as `0x${string}`);
      payload.approveBuilderFee = getApproveBuilderFeeTypedData();
    }

    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
