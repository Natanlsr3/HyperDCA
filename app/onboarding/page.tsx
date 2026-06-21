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
      <div className="mx-auto max-w-[560px] space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-[14px] grid h-[48px] w-[48px] place-items-center rounded-[12px] bg-[var(--accentSoft)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></svg>
          </div>
          <h1 className="mb-[6px] text-[26px] font-extrabold tracking-[-0.03em] text-[var(--text)]">Set up your account</h1>
          <p className="mx-auto max-w-[400px] text-[15px] text-[var(--text2)]">Three steps to start automated DCA on HyperLiquid.</p>
        </div>
        <div className="space-y-[12px]">
          {[
            { num: "1", title: "Sign in & create wallet", desc: "Log in with email or Google. We generate a secure embedded wallet automatically.", icon: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" },
            { num: "2", title: "Approve trading agent", desc: "Sign two on-chain approvals — the agent can trade for you but cannot withdraw funds.", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016Z" },
            { num: "3", title: "Pick a basket & invest", desc: "Choose a strategy, set your DCA amount and interval, and the bot handles the rest.", icon: "M12 2 2 7l10 5 10-5-10-5Z" },
          ].map((s) => (
            <div key={s.num} className="card flex items-start gap-[14px] p-[18px]">
              <div className="grid h-[36px] w-[36px] flex-none place-items-center rounded-[9px] bg-[var(--accentSoft)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={s.icon} /></svg>
              </div>
              <div>
                <h3 className="mb-[2px] text-[14px] font-bold text-[var(--text)]">{s.num}. {s.title}</h3>
                <p className="m-0 text-[13px] leading-[1.5] text-[var(--text2)]">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center">
          <button className="btn px-[24px] py-[11px] text-[14px]" onClick={login}>Sign in to get started</button>
        </div>
        <p className="text-center text-[12px] text-[var(--text3)]">
          Your agent key is encrypted and can only trade — it cannot withdraw or transfer funds.
        </p>
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
