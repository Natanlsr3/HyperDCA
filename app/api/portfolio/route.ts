import { NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/auth/privy";
import { getUserByPrivyId } from "@/lib/db/queries";
import type { ClearinghouseStateResponse } from "@nktkas/hyperliquid/api/info";
import {
  estimateCarryForAssets,
  getMergedPositions,
  getAllDexsClearinghouseState,
  getUserFunding,
} from "@/lib/hl/read";
import { getBasketById } from "@/lib/db/queries";

export async function GET(req: Request) {
  try {
    const claims = await verifyPrivyToken(req.headers.get("authorization"));
    const user = await getUserByPrivyId(claims.userId);
    if (!user?.main_wallet) {
      return NextResponse.json({ error: "Wallet not linked" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const basketId = searchParams.get("basketId");
    const leverage = Number(searchParams.get("leverage") ?? 1);

    const wallet = user.main_wallet;
    const positions = await getMergedPositions(wallet);
    const allState = await getAllDexsClearinghouseState(wallet);

    let accountValue = 0;
    let totalMarginUsed = 0;
    for (const state of Object.values(allState) as ClearinghouseStateResponse[]) {
      accountValue += Number(state.marginSummary?.accountValue ?? 0);
      totalMarginUsed += Number(state.marginSummary?.totalMarginUsed ?? 0);
    }

    const startTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const funding = await getUserFunding(wallet, startTime);

    let carry = null;
    if (basketId) {
      const basket = await getBasketById(basketId);
      carry = await estimateCarryForAssets(basket.basket_assets, leverage);
    }

    return NextResponse.json({
      wallet,
      accountValue,
      totalMarginUsed,
      positions,
      funding: funding.slice(0, 50),
      carry,
      guardrailFlagged: user.guardrail_flagged,
      guardrailDetail: user.guardrail_detail,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load portfolio";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
