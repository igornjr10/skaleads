export const scaleAdsDesignTokens = {
  typography: {
    fontFamily: '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif',
    featureSettings: '"cv02", "cv03", "cv04", "cv11"',
  },
  radius: {
    base: "0.75rem",
    lg: "1rem",
    xl: "1.5rem",
    pill: "9999px",
  },
  colors: {
    background: "hsl(0 0% 5%)",
    foreground: "hsl(150 12% 97%)",
    card: "hsl(0 0% 8%)",
    primary: "hsl(160 84% 44%)",
    primaryGlow: "hsl(156 76% 62%)",
    secondary: "hsl(0 0% 12%)",
    muted: "hsl(0 0% 11%)",
    mutedForeground: "hsl(150 5% 58%)",
    border: "hsl(0 0% 14%)",
    success: "hsl(142 71% 45%)",
    warning: "hsl(38 92% 50%)",
    destructive: "hsl(0 72% 51%)",
    sidebarBackground: "hsl(0 0% 4%)",
    sidebarForeground: "hsl(150 6% 78%)",
    sidebarAccent: "hsl(0 0% 9%)",
  },
  gradients: {
    primary: "linear-gradient(135deg, hsl(160 84% 44%), hsl(174 82% 38%))",
    glow: "radial-gradient(ellipse 70% 40% at 80% 0%, hsl(160 84% 44% / 0.10), transparent 70%)",
  },
  shadows: {
    glow: "0 0 28px -4px hsl(160 84% 44% / 0.50)",
    card: "0 1px 4px hsl(0 0% 0% / 0.55), 0 1px 2px hsl(0 0% 0% / 0.45)",
    panel: "0 24px 80px rgba(0, 0, 0, 0.45)",
  },
  motion: {
    fast: "200ms",
    base: "300ms",
  },
} as const;

export const scaleAdsUtilityClasses = {
  ambientBackground: "bg-gradient-glow",
  elevatedCard: "shadow-card",
  glowingElement: "shadow-glow",
  interactiveCard: "card-hover",
  numericText: "tabular-nums",
} as const;
