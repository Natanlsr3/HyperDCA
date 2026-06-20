import { getLeaderboard as getManagedLeaderboard } from "@/lib/baskets/manager";
import { createServiceClient } from "@/lib/db/client";
import type { BasketSortKey, NetworkFilter } from "@/lib/db/types";

export async function calculateROI30d(basketId: string): Promise<number> {
  const supa = createServiceClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supa
    .from("mirror_executions")
    .select("success,total_slippage")
    .eq("basket_id", basketId)
    .gte("execution_time", since);
  if (error) throw error;
  if (!data?.length) return 0;
  const successRate = data.filter((row) => row.success).length / data.length;
  const avgSlippage =
    data.reduce((sum, row) => sum + Number(row.total_slippage ?? 0), 0) / data.length;
  return Number((successRate * 0.1 - avgSlippage).toFixed(4));
}

export async function calculateROI_YTD(basketId: string): Promise<number> {
  const supa = createServiceClient();
  const since = new Date(new Date().getFullYear(), 0, 1).toISOString();
  const { data, error } = await supa
    .from("mirror_executions")
    .select("success,total_slippage")
    .eq("basket_id", basketId)
    .gte("execution_time", since);
  if (error) throw error;
  if (!data?.length) return 0;
  const successRate = data.filter((row) => row.success).length / data.length;
  const avgSlippage =
    data.reduce((sum, row) => sum + Number(row.total_slippage ?? 0), 0) / data.length;
  return Number((successRate * 0.22 - avgSlippage).toFixed(4));
}

export async function calculateHitRate(basketId: string): Promise<number> {
  const supa = createServiceClient();
  const { data, error } = await supa
    .from("mirror_executions")
    .select("success")
    .eq("basket_id", basketId);
  if (error) throw error;
  if (!data?.length) return 0.5;
  return data.filter((row) => row.success).length / data.length;
}

export async function refreshBasketAnalytics(basketId: string) {
  const [roi30d, roiYtd, hitRate] = await Promise.all([
    calculateROI30d(basketId),
    calculateROI_YTD(basketId),
    calculateHitRate(basketId),
  ]);
  const supa = createServiceClient();
  const { error } = await supa
    .from("baskets")
    .update({ roi_30d: roi30d, roi_ytd: roiYtd, hit_rate: hitRate })
    .eq("id", basketId);
  if (error) throw error;
  return { roi30d, roiYtd, hitRate };
}

export async function getLeaderboard(
  network: NetworkFilter = "all",
  sortBy: BasketSortKey = "roi_30d",
  limit = 100,
) {
  const baskets = await getManagedLeaderboard(network, sortBy, limit);
  return baskets.map((basket, index) => ({ rank: index + 1, ...basket }));
}
