/** "#10b981" -> "160 84% 39%", o formato das variaveis HSL do tema (index.css). */
export function hexParaHsl(hex: string): string | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return null;
  const [r, g, b] = m.slice(1).map(v => parseInt(v, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const VARIAVEIS_DA_COR = ["--primary", "--ring", "--sidebar-primary"] as const;

/** Aplica (ou, com null, devolve ao tema padrao) a cor da empresa. */
export function aplicarCorDaMarca(hex: string | null, raiz: HTMLElement = document.documentElement) {
  const hsl = hex ? hexParaHsl(hex) : null;
  for (const v of VARIAVEIS_DA_COR) {
    if (hsl) raiz.style.setProperty(v, hsl);
    else raiz.style.removeProperty(v);
  }
}
