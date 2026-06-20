export type DiversificationRating = "Concentrated" | "Balanced" | "Highly diversified";

export interface DiversificationInput {
  weight: number;
  sector: string;
}

export interface DiversificationScore {
  score: number;
  rating: DiversificationRating;
  topAssetWeight: number;
  sectorCount: number;
  effectiveAssets: number;
  notes: string[];
}

export function calculateDiversificationScore(assets: DiversificationInput[]): DiversificationScore {
  if (!assets.length) {
    return {
      score: 0,
      rating: "Concentrated",
      topAssetWeight: 0,
      sectorCount: 0,
      effectiveAssets: 0,
      notes: ["No assets in basket."],
    };
  }

  const weights = assets.map((asset) => Number(asset.weight));
  const topAssetWeight = Math.max(...weights);
  const sectorCount = new Set(assets.map((asset) => asset.sector)).size;
  const hhi = weights.reduce((sum, weight) => sum + weight ** 2, 0);
  const effectiveAssets = hhi > 0 ? 1 / hhi : 0;
  const concentrationScore = Math.max(0, 1 - topAssetWeight) * 38;
  const breadthScore = Math.min(1, effectiveAssets / 6) * 34;
  const sectorScore = Math.min(1, sectorCount / 4) * 28;
  const score = Math.round(concentrationScore + breadthScore + sectorScore);

  const rating: DiversificationRating =
    score >= 74 ? "Highly diversified" : score >= 48 ? "Balanced" : "Concentrated";
  const notes = [
    `${sectorCount} sectors represented`,
    `${effectiveAssets.toFixed(1)} effective equally weighted assets`,
    `Largest position ${(topAssetWeight * 100).toFixed(0)}%`,
  ];

  return { score, rating, topAssetWeight, sectorCount, effectiveAssets, notes };
}
