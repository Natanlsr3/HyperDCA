"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthUnavailable } from "@/components/auth-unavailable";
import { readJsonResponse } from "@/lib/http/client";

export default function OnboardingPage() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return <AuthUnavailable />;
  return <OnboardingContent />;
}

function OnboardingContent() {
  const { authenticated, login, user, getAccessToken } = usePrivy();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    (async () => {
      const token = await getAccessToken();
      const wallet = user?.wallet?.address;
      await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: user?.email?.address, mainWallet: wallet }),
      });
    })();
  }, [authenticated, getAccessToken, user]);

  async function generateAgent() {
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
          mainWallet: user?.wallet?.address,
          email: user?.email?.address,
        }),
      });
      const data = await readJsonResponse<{ error?: string; agentAddress?: string }>(res);
      if (data.error) throw new Error(data.error);
      if (!data.agentAddress) throw new Error("Agent address missing from onboarding response");
      setAgentAddress(data.agentAddress);
      setStep(2);
      setStatus("Sign approveAgent + approveBuilderFee in your wallet (HL UI or SDK).");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function markApproved() {
    setLoading(true);
    try {
      const token = await getAccessToken();
      await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "mark-approved" }),
      });
      setStep(3);
      setStatus("Onboarding complete. Deposit USDC on Arbitrum → bridge to HyperLiquid.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed");
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

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Onboarding</h1>

      <div className="card space-y-4">
        <Step n={1} active={step === 1} title="Create agent key">
          <p className="text-sm text-zinc-400">
            We generate an API agent wallet (cannot withdraw). It trades on your behalf after one-time approval.
          </p>
          <button className="btn" disabled={loading || step > 1} onClick={generateAgent}>
            Generate agent
          </button>
          {agentAddress && (
            <p className="text-xs text-zinc-500 break-all">Agent: {agentAddress}</p>
          )}
        </Step>

        <Step n={2} active={step === 2} title="Approve on HyperLiquid">
          <ol className="text-sm text-zinc-400 list-decimal list-inside space-y-1">
            <li>Deposit USDC to your HL account via Arbitrum bridge</li>
            <li>Sign <code className="text-cyan-400">approveAgent</code> for the agent address above</li>
            <li>Sign <code className="text-cyan-400">approveBuilderFee</code> for builder code</li>
          </ol>
          <button className="btn" disabled={loading || step !== 2} onClick={markApproved}>
            I&apos;ve approved both
          </button>
        </Step>

        <Step n={3} active={step === 3} title="Start investing">
          <p className="text-sm text-zinc-400">
            Pick a basket and set your DCA amount, interval, and leverage dial.
          </p>
          <button className="btn" onClick={() => router.push("/baskets")}>
            Browse baskets
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
