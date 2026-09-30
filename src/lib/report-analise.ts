import type { ReportAd, ReportData } from "./report-types";

// Anuncio com R$ 3 de gasto e CTR de 9% nao e destaque, e ruido: so concorre
// quem levou uma fatia relevante do investimento do periodo.
export const FATIA_MINIMA = 0.05;

export function escolherCriativoDestaque(ads: ReportAd[]): (ReportAd & { reason: string }) | null {
  const total = ads.reduce((s, a) => s + (a.spend || 0), 0);
  if (total <= 0) return null;
  const relevantes = ads.filter(a => a.spend >= total * FATIA_MINIMA && a.impressions > 0);
  if (!relevantes.length) return null;

  const melhor = [...relevantes].sort((a, b) => b.ctr - a.ctr || a.cpc - b.cpc)[0];
  const fatia = Math.round((melhor.spend / total) * 100);
  return {
    ...melhor,
    reason: `Maior CTR (${melhor.ctr.toFixed(2).replace(".", ",")}%) entre os anúncios com investimento relevante — levou ${fatia}% da verba dos anúncios`,
  };
}

/** Uma linha por item; aceita "- ", "* " e "• " no começo. */
export function itensDoTexto(texto?: string | null): string[] {
  return (texto ?? "")
    .split(/\r?\n/)
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

export function temAnalise(a: ReportData["analysis"]) {
  return !!a && [a.highlights, a.attention, a.nextSteps, a.notes].some(t => itensDoTexto(t).length > 0);
}

export interface SugestaoAnalise {
  highlights: string;
  attention: string;
  nextSteps: string;
}

/**
 * A IA devolve texto livre; o pedido e JSON, mas o modelo as vezes cerca de
 * markdown ou comenta antes. Pega o primeiro objeto que parsear.
 */
export function lerSugestaoDaIA(resposta: string): SugestaoAnalise | null {
  const inicio = resposta.indexOf("{");
  const fim = resposta.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  try {
    const obj = JSON.parse(resposta.slice(inicio, fim + 1));
    const lista = (v: unknown) => (Array.isArray(v) ? v.map(String).join("\n") : typeof v === "string" ? v : "");
    const s = { highlights: lista(obj.destaques), attention: lista(obj.atencao), nextSteps: lista(obj.proximos_passos) };
    return s.highlights || s.attention || s.nextSteps ? s : null;
  } catch {
    return null;
  }
}

/** Reduz o print para caber no PDF e no banco: lado maior de ate `maxLado` px, JPEG. */
export function comprimirImagem(arquivo: File, maxLado = 1400, qualidade = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Navegador sem suporte a canvas"));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", qualidade));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Não consegui ler a imagem ${arquivo.name}`));
    };
    img.src = url;
  });
}
