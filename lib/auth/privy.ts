import { PrivyClient } from "@privy-io/server-auth";
import { createRemoteJWKSet, jwtVerify } from "jose";

let privyClient: PrivyClient | null = null;

export function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) throw new Error("Missing Privy credentials");
    privyClient = new PrivyClient(appId, appSecret);
  }
  return privyClient;
}

const JWKS = createRemoteJWKSet(
  new URL(
    `https://auth.privy.io/api/v1/apps/${process.env.NEXT_PUBLIC_PRIVY_APP_ID}/jwks.json`,
  ),
);

export async function verifyPrivyToken(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing Bearer token");
  }
  const token = authHeader.slice(7);

  try {
    const client = getPrivyClient();
    const claims = await client.verifyAuthToken(token);
    return claims;
  } catch {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: "privy.io",
      audience: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    });
    return {
      userId: payload.sub as string,
      appId: payload.aud as string,
    };
  }
}

export function requireCronSecret(authHeader: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET not configured");
  if (authHeader !== `Bearer ${secret}`) {
    throw new Error("Unauthorized cron request");
  }
}
