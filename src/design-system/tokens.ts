export const marketProDesignTokens = {
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
    foreground: "hsl(30 15% 97%)",
    card: "hsl(0 0% 8%)",
    primary: "hsl(27 95% 53%)",
    primaryGlow: "hsl(27 100% 65%)",
    secondary: "hsl(0 0% 12%)",
    muted: "hsl(0 0% 11%)",
    mutedForeground: "hsl(30 6% 58%)",
    border: "hsl(0 0% 14%)",
    success: "hsl(142 71% 45%)",
    warning: "hsl(38 92% 50%)",
    destructive: "hsl(0 72% 51%)",
    sidebarBackground: "hsl(0 0% 4%)",
    sidebarForeground: "hsl(30 8% 78%)",
    sidebarAccent: "hsl(0 0% 9%)",
  },
  gradients: {
    primary: "linear-gradient(135deg, hsl(27 95% 53%), hsl(15 90% 48%))",
    glow: "radial-gradient(ellipse 70% 40% at 80% 0%, hsl(27 95% 53% / 0.10), transparent 70%)",
  },
  shadows: {
    glow: "0 0 28px -4px hsl(27 95% 53% / 0.50)",
    card: "0 1px 4px hsl(0 0% 0% / 0.55), 0 1px 2px hsl(0 0% 0% / 0.45)",
    panel: "0 24px 80px rgba(0, 0, 0, 0.45)",
  },
  motion: {
    fast: "200ms",
    base: "300ms",
  },
} as const;

export const marketProUtilityClasses = {
  ambientBackground: "bg-gradient-glow",
  elevatedCard: "shadow-card",
  glowingElement: "shadow-glow",
  interactiveCard: "card-hover",
  numericText: "tabular-nums",
} as const;
