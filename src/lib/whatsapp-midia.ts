export type TipoMidia = "audio" | "imagem" | "video" | "documento" | "figurinha";

/** messageType da uazapi (AudioMessage, ImageMessage...) para o que a tela sabe mostrar. */
export function tipoDeMidia(tipo: string | null | undefined): TipoMidia | null {
  const t = (tipo ?? "").toLowerCase();
  if (t.includes("audio") || t.includes("ptt")) return "audio";
  if (t.includes("image")) return "imagem";
  if (t.includes("video")) return "video";
  if (t.includes("sticker")) return "figurinha";
  if (t.includes("document")) return "documento";
  return null;
}

/** Sem legenda o webhook grava "[ImageMessage]": isso nao e texto para mostrar. */
export function ehMarcadorDeMidia(texto: string | null) {
  return !texto || /^\[\w+\]$/.test(texto.trim());
}
