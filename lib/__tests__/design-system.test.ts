import { ASSET_COLORS, COLORS, SPACING, TYPOGRAPHY } from "@/lib/design-system";

export function assertDesignSystemTokens() {
  if (COLORS.primary !== "#1E40AF") throw new Error("Primary color must be #1E40AF");
  if (COLORS.positive !== "#059669") throw new Error("Positive color must be #059669");
  if (COLORS.text !== "#111827") throw new Error("Text color must be #111827");
  if (TYPOGRAPHY.h1.size !== "34px") throw new Error("H1 size must be 34px");
  if (SPACING.sidebarWidth !== "236px") throw new Error("Sidebar width must be 236px");
  if (SPACING.headerHeight !== "60px") throw new Error("Header height must be 60px");
  if (ASSET_COLORS.BTC !== "#F7931A") throw new Error("BTC color must be #F7931A");
}

