"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EIP1193Provider } from "viem";
import { submitApprovals } from "@/lib/hl/approve-client";

interface ApprovalParams {
  agentAddress: `0x${string}`;
  agentName: string;
  builder: `0x${string}`;
  maxFeeRate: string;
  isTestnet: boolean;
}

interface OnboardingState {
  agentAddress: string | null;
  approveAgent?: {
    agentAddress: `0x${string}`;
    agentName: string;
    hyperliquidChain: string;
  };
  approveBuilderFee?: {
    builder: `0x${string}`;
    maxFeeRate: string;
  };
}

function approvalFromPayload(data: OnboardingState): ApprovalParams | null {
  if (!data.approveAgent || !data.approveBuilderFee) return null;
  return {
    agentAddress: data.approveAgent.agentAddress,
    agentName: data.approveAgent.agentName,
    builder: data.approveBuilderFee.builder,
    maxFeeRate: data.approveBuilderFee.maxFeeRate,
    isTestnet: data.approveAgent.hyperliquidChain === "Testnet",
  };
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<p className="text-zinc-500">Loading...</p>}>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const { authenticated, login, user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [step, setStep] = useState(1);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [approval, setApproval] = useState<ApprovalParams | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
  const hasExistingAgent = Boolean(agentAddress);

  const applyOnboardingState = useCallback((data: OnboardingState & { onboarded?: boolean }) => {
    if (data.onboarded) {
      setStep(3);
      setStatus("Onboarding complete. Deposit USDC on Arbitrum → bridge to HyperLiquid.");
      return;
    }
    if (data.agentAddress) {
      setAgentAddress(data.agentAddress);
      const nextApproval = approvalFromPayload(data);
      if (nextApproval) setApproval(nextApproval);
      setStep(2);
      setStatus("Your agent is ready. Sign approveAgent + approveBuilderFee with your wallet.");
    }
  }, []);

  useEffect(() => {
    if (!authenticated) {
      setHydrating(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/onboarding", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        applyOnboardingState(data);
      } catch (e) {
        if (!cancelled) {
          setStatus(e instanceof Error ? e.message : "Failed to load onboarding state");
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken, applyOnboardingState]);

  async function generateAgent() {
    if (hasExistingAgent) return;

    setLoading(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "generate-agent",
          mainWallet: embeddedWallet?.address,
          email: user?.email?.address,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      applyOnboardingState(data);
      if (!data.existing) {
        setStatus("Click below to sign approveAgent + approveBuilderFee with your wallet.");
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function fetchApprovalStatus(token: string) {
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "check-approval-status" }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data as { agentApproved: boolean; builderApproved: boolean };
  }

  async function verifyApprovalWithRetry(token: string) {
    const maxAttempts = 5;
    const delayMs = 2000;
    let last: {
      approved?: boolean;
      agentApproved?: boolean;
      builderApproved?: boolean;
      error?: string;
    } = {};

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "verify-approval" }),
      });
      const data = await res.json();
      last = data;
      if (data.error) throw new Error(data.error);
      if (data.approved) return data;

      if (attempt < maxAttempts - 1) {
        setStatus(
          `Waiting for HyperLiquid to index approvals (${attempt + 1}/${maxAttempts})…`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const missing = [
      !last.agentApproved && "agent approval",
      !last.builderApproved && "builder-fee approval",
    ]
      .filter(Boolean)
      .join(" + ");
    throw new Error(
      missing
        ? `HyperLiquid has not registered ${missing} yet. Wait a moment and retry.`
        : "HyperLiquid verification failed. Retry in a moment.",
    );
  }

  async function approveOnHL() {
    if (!approval) {
      setStatus("Generate an agent first.");
      return;
    }
    const embedded = embeddedWallet;
    if (!embedded) {
      setStatus("Wallet not ready yet. Wait a moment and retry.");
      return;
    }

    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setStatus("Session expired. Sign in again.");
        return;
      }
      const onChain = await fetchApprovalStatus(token);

      if (onChain.agentApproved && onChain.builderApproved) {
        setStatus("Approvals already registered on HyperLiquid. Verifying…");
        await verifyApprovalWithRetry(token);
        setStep(3);
        setStatus("Onboarding complete. Deposit USDC on Arbitrum → bridge to HyperLiquid.");
        return;
      }

      const skipAgent = onChain.agentApproved;
      const skipBuilder = onChain.builderApproved;
      const pending = [
        !skipAgent && "approveAgent",
        !skipBuilder && "approveBuilderFee",
      ]
        .filter(Boolean)
        .join(" + ");

      setStatus(`Signing ${pending} on HyperLiquid (sign in your wallet)…`);
      const provider = (await embedded.getEthereumProvider()) as unknown as EIP1193Provider;
      await submitApprovals({
        provider,
        account: embedded.address as `0x${string}`,
        isTestnet: approval.isTestnet,
        agentAddress: approval.agentAddress,
        agentName: approval.agentName,
        builder: approval.builder,
        maxFeeRate: approval.maxFeeRate,
        skipAgent,
        skipBuilder,
      });

      setStatus("Verifying approvals on-chain…");
      await verifyApprovalWithRetry(token);

      setStep(3);
      setStatus("Onboarding complete. Deposit USDC on Arbitrum → bridge to HyperLiquid.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setLoading(false);
    }
  }

  if (!authenticated) {
    return (
      <div className="card text-center space-y-4 max-w-md mx-auto">
        <h1 className="text-xl font-bold">Get started</h1>
        <p className="text-zinc-400 text-sm">Sign in with email to create your HyperDCA account.</p>
        <button className="btn w-full" onClick={login}>
          Sign in with Privy
        </button>
      </div>
    );
  }

  if (hydrating) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Onboarding</h1>
        <p className="text-sm text-zinc-400">Loading your onboarding status…</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Onboarding</h1>

      <div className="card space-y-4">
        <Step n={1} active={step === 1} title="Create agent key">
          <p className="text-sm text-zinc-400">
            We generate an API agent wallet (cannot withdraw). It trades on your behalf after one-time approval.
          </p>
          <button
            className="btn"
            disabled={loading || step > 1 || hasExistingAgent}
            onClick={generateAgent}
          >
            {hasExistingAgent ? "Agent already created" : "Generate agent"}
          </button>
          {agentAddress && (
            <p className="text-xs text-zinc-500 break-all">Agent: {agentAddress}</p>
          )}
        </Step>

        <Step n={2} active={step === 2} title="Approve on HyperLiquid">
          <p className="text-sm text-zinc-400">
            Your wallet will sign two one-time actions —{" "}
            <code className="text-cyan-400">approveAgent</code> (lets us trade for you) and{" "}
            <code className="text-cyan-400">approveBuilderFee</code> — submitted directly to
            HyperLiquid. We verify both on-chain before unlocking trading.
          </p>
          <button className="btn" disabled={loading || step !== 2} onClick={approveOnHL}>
            {loading ? "Approving…" : "Sign & approve on HyperLiquid"}
          </button>
        </Step>

        <Step n={3} active={step === 3} title="Start investing">
          <p className="text-sm text-zinc-400">
            Pick a basket and set your DCA amount, interval, and leverage dial.
          </p>
          <button className="btn" onClick={() => router.push(returnTo ?? "/baskets")}>
            {returnTo ? "Continue to schedule" : "Browse baskets"}
          </button>
        </Step>
      </div>

      {status && <p className="text-sm text-zinc-400">{status}</p>}
    </div>
  );
}

function Step({
  n,
  active,
  title,
  children,
}: {
  n: number;
  active: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-2 ${active ? "" : "opacity-50"}`}>
      <h3 className="font-medium">
        {n}. {title}
      </h3>
      {children}
    </div>
  );
}
