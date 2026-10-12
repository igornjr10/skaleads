export type Plataforma =
  | "instagram" | "tiktok" | "youtube" | "facebook" | "drive" | "pinterest" | "site" | "arquivo" | "outro";
export type TipoCriativo = "video" | "reels" | "imagem" | "carrossel" | "story" | "texto" | "outro";
export type CategoriaIdeia = "anuncio" | "video" | "storytelling" | "oferta" | "organico" | "outro";

export const PLATAFORMAS: { valor: Plataforma; rotulo: string }[] = [
  { valor: "instagram", rotulo: "Instagram" },
  { valor: "tiktok", rotulo: "TikTok" },
  { valor: "youtube", rotulo: "YouTube" },
  { valor: "facebook", rotulo: "Facebook" },
  { valor: "drive", rotulo: "Google Drive" },
  { valor: "pinterest", rotulo: "Pinterest" },
  { valor: "site", rotulo: "Site" },
  { valor: "arquivo", rotulo: "Arquivo enviado" },
  { valor: "outro", rotulo: "Outro" },
];

export const TIPOS_CRIATIVO: { valor: TipoCriativo; rotulo: string }[] = [
  { valor: "video", rotulo: "Vídeo" },
  { valor: "reels", rotulo: "Reels" },
  { valor: "imagem", rotulo: "Imagem" },
  { valor: "carrossel", rotulo: "Carrossel" },
  { valor: "story", rotulo: "Story" },
  { valor: "texto", rotulo: "Texto" },
  { valor: "outro", rotulo: "Outro" },
];

export const CATEGORIAS_IDEIA: { valor: CategoriaIdeia; rotulo: string }[] = [
  { valor: "anuncio", rotulo: "Anúncio" },
  { valor: "video", rotulo: "Vídeo" },
  { valor: "storytelling", rotulo: "Storytelling" },
  { valor: "oferta", rotulo: "Oferta" },
  { valor: "organico", rotulo: "Orgânico" },
  { valor: "outro", rotulo: "Outro" },
];

function rotuloDe<T extends string>(lista: { valor: T; rotulo: string }[], valor: string) {
  return lista.find(x => x.valor === valor)?.rotulo ?? "Outro";
}

export const rotuloPlataforma = (v: string) => rotuloDe(PLATAFORMAS, v);
export const rotuloTipo = (v: string) => rotuloDe(TIPOS_CRIATIVO, v);
export const rotuloCategoria = (v: string) => rotuloDe(CATEGORIAS_IDEIA, v);

export const LIMITE_UPLOAD = 50 * 1024 * 1024;

/** Aceita link colado sem protocolo ("instagram.com/p/x") e devolve null se nao for URL. */
export function normalizarUrl(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  const comProtocolo = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(comProtocolo);
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function hostDe(url: string): string | null {
  const n = normalizarUrl(url);
  if (!n) return null;
  return new URL(n).hostname.toLowerCase().replace(/^www\.|^m\./, "");
}

function casa(host: string, dominio: string) {
  return host === dominio || host.endsWith(`.${dominio}`);
}

export function detectarPlataforma(url: string): Plataforma {
  const host = hostDe(url);
  if (!host) return "outro";
  if (casa(host, "instagram.com") || casa(host, "instagr.am")) return "instagram";
  if (casa(host, "tiktok.com")) return "tiktok";
  if (casa(host, "youtube.com") || casa(host, "youtu.be") || casa(host, "youtube-nocookie.com")) return "youtube";
  if (casa(host, "facebook.com") || casa(host, "fb.com") || casa(host, "fb.watch")) return "facebook";
  if (casa(host, "drive.google.com") || casa(host, "docs.google.com")) return "drive";
  if (casa(host, "pinterest.com") || casa(host, "pin.it") || /(^|\.)pinterest\.[a-z.]+$/.test(host)) return "pinterest";
  return "site";
}

/** Sugestao de tipo pelo formato do link; a pessoa pode trocar. */
export function sugerirTipoPorUrl(url: string): TipoCriativo | null {
  const n = normalizarUrl(url);
  if (!n) return null;
  const { pathname } = new URL(n);
  const plataforma = detectarPlataforma(n);
  if (plataforma === "instagram") {
    if (pathname.startsWith("/reel")) return "reels";
    if (pathname.startsWith("/stories")) return "story";
    return null;
  }
  if (plataforma === "youtube") return pathname.startsWith("/shorts") ? "reels" : "video";
  if (plataforma === "tiktok") return "video";
  if (plataforma === "facebook" && (pathname.includes("/reel") || pathname.includes("/videos") || pathname.startsWith("/watch"))) return "video";
  return null;
}

const ID_YOUTUBE = /^[\w-]{11}$/;

export function idDoYoutube(url: string | null | undefined): string | null {
  if (!url) return null;
  const n = normalizarUrl(url);
  if (!n || detectarPlataforma(n) !== "youtube") return null;
  const u = new URL(n);
  const host = u.hostname.toLowerCase();
  let candidato: string | null = null;
  if (host.endsWith("youtu.be")) {
    candidato = u.pathname.split("/")[1] ?? null;
  } else if (u.pathname === "/watch") {
    candidato = u.searchParams.get("v");
  } else {
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
    candidato = m?.[1] ?? null;
  }
  return candidato && ID_YOUTUBE.test(candidato) ? candidato : null;
}

export const embedDoYoutube = (id: string) => `https://www.youtube-nocookie.com/embed/${id}`;
export const capaDoYoutube = (id: string) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

export type TipoArquivo = "imagem" | "video" | "outro";

export function tipoDoArquivo(mime: string | null | undefined, nome?: string | null): TipoArquivo {
  if (mime?.startsWith("image/")) return "imagem";
  if (mime?.startsWith("video/")) return "video";
  const ext = nome?.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "avif"].includes(ext)) return "imagem";
  if (["mp4", "mov", "webm", "m4v"].includes(ext)) return "video";
  return "outro";
}

/** "a, b  #c" -> ["a","b","c"], sem repetir e em minusculas. */
export function normalizarTags(texto: string): string[] {
  const vistas = new Set<string>();
  for (const parte of texto.split(/[,;\n]+/)) {
    const tag = parte.trim().replace(/^#+/, "").trim().toLowerCase();
    if (tag) vistas.add(tag);
  }
  return [...vistas];
}

export function nomeSeguroDeArquivo(nome: string) {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_");
}

export function tamanhoLegivel(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export interface IdeiaFiltravel {
  titulo: string;
  descricao: string | null;
  tags: string[];
  client_id: string | null;
  plataforma: string;
  tipo_criativo: string;
  categoria: string;
  favorita: boolean;
  created_by: string | null;
}

export const TODOS = "todos";
export const SEM_CLIENTE = "sem";

export interface FiltrosIdeia {
  busca: string;
  cliente: string;
  plataforma: string;
  tipo: string;
  categoria: string;
  soFavoritas: boolean;
  soMinhas: boolean;
}

export const FILTROS_INICIAIS: FiltrosIdeia = {
  busca: "",
  cliente: TODOS,
  plataforma: TODOS,
  tipo: TODOS,
  categoria: TODOS,
  soFavoritas: false,
  soMinhas: false,
};

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function filtrarIdeias<T extends IdeiaFiltravel>(
  ideias: T[],
  f: FiltrosIdeia,
  opcoes: { usuarioId?: string | null; nomeDoCliente?: (id: string) => string | undefined } = {},
): T[] {
  const termos = semAcento(f.busca.trim()).split(/\s+/).filter(Boolean);
  return ideias.filter(i => {
    if (f.cliente === SEM_CLIENTE && i.client_id) return false;
    if (f.cliente !== TODOS && f.cliente !== SEM_CLIENTE && i.client_id !== f.cliente) return false;
    if (f.plataforma !== TODOS && i.plataforma !== f.plataforma) return false;
    if (f.tipo !== TODOS && i.tipo_criativo !== f.tipo) return false;
    if (f.categoria !== TODOS && i.categoria !== f.categoria) return false;
    if (f.soFavoritas && !i.favorita) return false;
    if (f.soMinhas && (!opcoes.usuarioId || i.created_by !== opcoes.usuarioId)) return false;
    if (termos.length === 0) return true;
    const cliente = i.client_id ? opcoes.nomeDoCliente?.(i.client_id) ?? "" : "";
    const texto = semAcento([i.titulo, i.descricao ?? "", i.tags.join(" "), cliente].join(" "));
    return termos.every(t => texto.includes(t));
  });
}

export function contarPorCategoria(ideias: { categoria: string }[]) {
  const contagem = new Map<string, number>();
  for (const i of ideias) contagem.set(i.categoria, (contagem.get(i.categoria) ?? 0) + 1);
  return CATEGORIAS_IDEIA
    .map(c => ({ ...c, total: contagem.get(c.valor) ?? 0 }))
    .filter(c => c.total > 0);
}

export function filtrosAtivos(f: FiltrosIdeia) {
  return (
    f.busca.trim() !== "" || f.cliente !== TODOS || f.plataforma !== TODOS || f.tipo !== TODOS ||
    f.categoria !== TODOS || f.soFavoritas || f.soMinhas
  );
}

/** Tabela ou bucket ainda nao criados: a migration nao foi aplicada no banco. */
export function faltaMigration(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "42P01" || code === "PGRST205" || code === "PGRST202") return true;
  const m = typeof message === "string" ? message.toLowerCase() : "";
  return m.includes("schema cache") || (m.includes("relation") && m.includes("does not exist"));
}
