import type { Metadata } from "next";
import { getDemoBasket } from "@/lib/baskets/demo-data";
import { isServiceDbConfigured } from "@/lib/db/client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    if (!isServiceDbConfigured()) {
      const basket = getDemoBasket(id);
      return { title: basket?.name ?? "Basket" };
    }
    const { getBasketDetail } = await import("@/lib/baskets/manager");
    const basket = await getBasketDetail(id);
    return { title: basket?.name ?? "Basket" };
  } catch {
    return { title: "Basket" };
  }
}

export default function BasketDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
