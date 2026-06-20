import { COLORS, SPACING, TYPOGRAPHY } from "@/lib/design-system";

export const designSystemConfig = {
  colors: COLORS,
  spacing: {
    sidebar: SPACING.sidebarWidth,
  },
  fontSize: {
    h1: [TYPOGRAPHY.h1.size, { fontWeight: TYPOGRAPHY.h1.weight, letterSpacing: TYPOGRAPHY.h1.letterSpacing }],
    h2: [TYPOGRAPHY.h2.size, { fontWeight: TYPOGRAPHY.h2.weight, letterSpacing: TYPOGRAPHY.h2.letterSpacing }],
    body: [TYPOGRAPHY.body.size, { fontWeight: TYPOGRAPHY.body.weight }],
  },
  borderRadius: {
    lg: SPACING.radiusLg,
    sm: SPACING.radiusSm,
    xs: SPACING.radiusTiny,
  },
} as const;

