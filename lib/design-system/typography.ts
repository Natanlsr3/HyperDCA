export const TYPOGRAPHY = {
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  monoFamily: "'JetBrains Mono', monospace",
  h1: { size: "34px", weight: 700, letterSpacing: "-0.025em", lineHeight: 1.2 },
  h2: { size: "18px", weight: 700, letterSpacing: "-0.01em", lineHeight: 1.2 },
  body: { size: "15px", weight: 400, lineHeight: 1.5 },
  input: { size: "13.5px", weight: 400, lineHeight: 1.4 },
  buttonLabel: { size: "12.5px", weight: 600, lineHeight: 1.2 },
  tableHeader: { size: "11px", weight: 600, letterSpacing: "0.04em", textTransform: "uppercase" },
  chip: { size: "11px", weight: 600, lineHeight: 1.2 },
  mono: { size: "12.5px", weight: 500, fontFamily: "'JetBrains Mono', monospace" },
} as const;

