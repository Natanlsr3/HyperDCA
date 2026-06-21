"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";

/**
 * Links the user's Privy embedded wallet (their HL master account) to their DB
 * user row as soon as it exists, on ANY authenticated page. In Privy v2 the
 * email-created embedded wallet lives in useWallets() (walletClientType==="privy"),
 * NOT user.wallet.address — reading the wrong place left main_wallet null forever.
 */
export function WalletLinker() {
  const { authenticated, user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const linkedAddress = useRef<string | null>(null);
  const embeddedAddress =
    wallets.find((w) => w.walletClientType === "privy")?.address ?? null;

  useEffect(() => {
    if (!authenticated || !embeddedAddress) return;
    if (linkedAddress.current === embeddedAddress) return;
    linkedAddress.current = embeddedAddress;

    (async () => {
      try {
        const token = await getAccessToken();
        await fetch("/api/onboarding", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "link-wallet",
            mainWallet: embeddedAddress,
            email: user?.email?.address,
          }),
        });
      } catch {
        linkedAddress.current = null; // allow retry on next render
      }
    })();
  }, [authenticated, embeddedAddress, user?.email?.address]);

  return null;
}
