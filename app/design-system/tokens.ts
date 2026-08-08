/**
 * Design tokens from DESIGN.md front matter with WCAG 2.1 AA corrections (T6).
 * Routes may compose tokens but must not redefine visual constants.
 */

export const colors = {
  background: "#F8FAFC",
  surface: "#F8FAFC",
  surfaceRaised: "#FFFFFF",
  surfaceSunken: "#F1F5F9",
  surfaceMuted: "#E2E8F0",
  inkPrimary: "#0F172A",
  inkSecondary: "#334155",
  inkMuted: "#64748B",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  /** Non-text brand accent only — do not use for text on white. */
  accent: "#0EA5E9",
  accentOn: "#FFFFFF",
  accentSubtle: "#E0F2FE",
  /** AA-safe interactive / focus on light surfaces. */
  interactive: "#0369A1",
  interactiveOn: "#FFFFFF",
  focusRing: "#0369A1",
  stock: "#047857",
  stockSubtle: "#D1FAE5",
  oos: "#B91C1C",
  oosSubtle: "#FEE2E2",
  promo: "#92400E",
  promoSubtle: "#FEF3C7",
  stale: "#92400E",
  staleSubtle: "#FEF3C7",
} as const;

export const typography = {
  headlineLg: {
    fontFamily: "var(--font-sans)",
    fontSize: "32px",
    fontWeight: "700",
    lineHeight: "40px",
    letterSpacing: "-0.02em",
  },
  headlineMd: {
    fontFamily: "var(--font-sans)",
    fontSize: "24px",
    fontWeight: "600",
    lineHeight: "32px",
  },
  bodyLg: {
    fontFamily: "var(--font-sans)",
    fontSize: "16px",
    fontWeight: "400",
    lineHeight: "24px",
  },
  bodySm: {
    fontFamily: "var(--font-sans)",
    fontSize: "14px",
    fontWeight: "400",
    lineHeight: "20px",
  },
  dataTable: {
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    fontWeight: "500",
    lineHeight: "16px",
  },
  labelCaps: {
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    fontWeight: "700",
    lineHeight: "14px",
  },
} as const;

export const rounded = {
  sm: "2px",
  md: "4px",
  lg: "8px",
  full: "9999px",
} as const;

export const spacing = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "24px",
  6: "32px",
  gutter: "16px",
  marginMobile: "12px",
  containerMax: "1280px",
  rowHeightDense: "40px",
} as const;

export const components = {
  buttonOutbound: {
    background: colors.interactive,
    foreground: colors.interactiveOn,
    radius: rounded.md,
  },
  badgeStock: {
    background: colors.stockSubtle,
    foreground: colors.stock,
    radius: rounded.sm,
  },
  badgeOos: {
    background: colors.oosSubtle,
    foreground: colors.oos,
    radius: rounded.sm,
  },
  badgePromo: {
    background: colors.promoSubtle,
    foreground: colors.promo,
    radius: rounded.sm,
  },
  badgeStale: {
    background: colors.staleSubtle,
    foreground: colors.stale,
    radius: rounded.sm,
  },
  filterChipActive: {
    background: colors.accentSubtle,
    foreground: colors.inkPrimary,
    radius: rounded.full,
  },
  dataRow: {
    background: colors.surfaceRaised,
    border: colors.border,
    height: spacing.rowHeightDense,
  },
} as const;

/** Declared foreground/background pairs for automated contrast assertions. */
export const contrastPairs: ReadonlyArray<{
  name: string;
  foreground: string;
  background: string;
  minRatio: number;
}> = [
  { name: "ink-primary/background", foreground: colors.inkPrimary, background: colors.background, minRatio: 4.5 },
  { name: "ink-primary/surface-raised", foreground: colors.inkPrimary, background: colors.surfaceRaised, minRatio: 4.5 },
  { name: "ink-secondary/background", foreground: colors.inkSecondary, background: colors.background, minRatio: 4.5 },
  { name: "ink-muted/background", foreground: colors.inkMuted, background: colors.background, minRatio: 4.5 },
  { name: "interactive/surface-raised", foreground: colors.interactive, background: colors.surfaceRaised, minRatio: 4.5 },
  { name: "interactive-on/interactive", foreground: colors.interactiveOn, background: colors.interactive, minRatio: 4.5 },
  { name: "stock/stock-subtle", foreground: colors.stock, background: colors.stockSubtle, minRatio: 4.5 },
  { name: "oos/oos-subtle", foreground: colors.oos, background: colors.oosSubtle, minRatio: 4.5 },
  { name: "promo/promo-subtle", foreground: colors.promo, background: colors.promoSubtle, minRatio: 4.5 },
  { name: "stale/stale-subtle", foreground: colors.stale, background: colors.staleSubtle, minRatio: 4.5 },
  { name: "focus-ring/surface-raised", foreground: colors.focusRing, background: colors.surfaceRaised, minRatio: 3 },
  { name: "ink-secondary/surface-sunken", foreground: colors.inkSecondary, background: colors.surfaceSunken, minRatio: 4.5 },
];
