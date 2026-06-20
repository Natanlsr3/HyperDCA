"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { useEffect } from "react";
import type { ReactNode } from "react";

function usePrivyDevConsoleFilter() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const originalError = console.error;

    console.error = (...args: unknown[]) => {
      const message = args.map((arg) => (typeof arg === "string" ? arg : "")).join(" ");
      const isPrivyNestingWarning =
        message.includes("In HTML, <div> cannot be a descendant of <p>") ||
        message.includes("<p> cannot contain a nested <div>");

      if (isPrivyNestingWarning) {
        return;
      }

      originalError(...args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);
}

export function Providers({ children }: { children: ReactNode }) {
  usePrivyDevConsoleFilter();
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    return <>{children}</>;
  }
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google"],
        appearance: { theme: "dark", accentColor: "#22d3ee" },
        embeddedWallets: { createOnLogin: "users-without-wallets" },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
