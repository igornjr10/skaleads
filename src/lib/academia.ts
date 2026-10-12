export type CategoriaAcademia = "trafego" | "criativos" | "clientes" | "operacao" | "outro";
export type TipoAula = "video" | "pdf" | "link" | "texto";

export interface ModuloAcademia {
  id: string;
  titulo: string;
  descricao: string | null;
  categoria: CategoriaAcademia;
  ordem: number;
  created_at: string;
}

export interface AulaAcademia {
  id: string;
  modulo_id: string;
  titulo: string;
  descricao: string | null;
  tipo: TipoAula;
  url: string | null;
  conteudo: string | null;
  duracao_min: number | null;
  checklist: string[];
  ordem: number;
  created_at: string;
}

export interface ProgressoAula {
  aula_id: string;
  user_id: string;
  concluida_em: string | null;
  checklist_feitos: number[];
  updated_at: string;
}

export const CATEGORIAS: { id: CategoriaAcademia; label: string }[] = [
  { id: "trafego", label: "Tráfego pago" },
  { id: "criativos", label: "Criativos" },
  { id: "clientes", label: "Clientes" },
  { id: "operacao", label: "Operação" },
  { id: "outro", label: "Outros" },
];

export const TIPOS_AULA: { id: TipoAula; label: string }[] = [
  { id: "video", label: "Vídeo" },
  { id: "pdf", label: "PDF" },
  { id: "link", label: "Link" },
  { id: "texto", label: "Texto" },
];

export function categoriaLabel(c: string): string {
  return CATEGORIAS.find(x => x.id === c)?.label ?? "Outros";
}

export function tipoLabel(t: string): string {
  return TIPOS_AULA.find(x => x.id === t)?.label ?? t;
}

export function normalizarCategoria(c: string | null | undefined): CategoriaAcademia {
  return CATEGORIAS.some(x => x.id === c) ? (c as CategoriaAcademia) : "outro";
}

export function normalizarTipo(t: string | null | undefined): TipoAula {
  return TIPOS_AULA.some(x => x.id === t) ? (t as TipoAula) : "link";
}

/** Converte o jsonb do banco num array de strings, ignorando lixo. */
export function lerChecklist(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map(v => v.trim());
}

/** Converte o jsonb de indices marcados num array de inteiros unicos e ordenados. */
export function lerIndices(valor: unknown): number[] {
  if (!Array.isArray(valor)) return [];
  const nums = valor.filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0);
  return [...new Set(nums)].sort((a, b) => a - b);
}

/** Um item por linha no formulario do ADM. */
export function checklistDeTexto(texto: string): string[] {
  return texto.split(/\r?\n/).map(l => l.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean);
}

export function alternarIndice(feitos: number[], indice: number): number[] {
  return feitos.includes(indice) ? feitos.filter(i => i !== indice) : [...feitos, indice].sort((a, b) => a - b);
}

function parseUrl(url: string): URL | null {
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

function idDoYoutube(u: URL): string | null {
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") return u.pathname.split("/")[1] || null;
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
  if (u.pathname === "/watch") return u.searchParams.get("v");
  const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
  return m ? m[1] : null;
}

/**
 * URL que pode ir num iframe, ou null quando o link so abre em nova aba.
 * Drive/Docs precisam do /preview: o /view e o /edit recusam ser embutidos.
 */
export function urlDeEmbed(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = parseUrl(url);
  if (!u) return null;
  const host = u.hostname.replace(/^www\./, "");

  const yt = idDoYoutube(u);
  if (yt && /^[\w-]+$/.test(yt)) return `https://www.youtube.com/embed/${yt}`;

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/(?:^|\/)(\d+)(?:\/([0-9a-f]+))?/i);
    if (m) {
      const hash = m[2] ?? u.searchParams.get("h");
      return `https://player.vimeo.com/video/${m[1]}${hash ? `?h=${hash}` : ""}`;
    }
    return null;
  }

  if (host === "drive.google.com") {
    const porCaminho = u.pathname.match(/\/file\/d\/([^/]+)/);
    const id = porCaminho?.[1] ?? (u.pathname === "/open" || u.pathname.startsWith("/uc") ? u.searchParams.get("id") : null);
    return id ? `https://drive.google.com/file/d/${id}/preview` : null;
  }

  if (host === "docs.google.com") {
    const m = u.pathname.match(/^\/(document|presentation|spreadsheets|forms)\/d\/([^/]+)/);
    if (!m) return null;
    if (m[1] === "forms") return `https://docs.google.com/forms/d/${m[2]}/viewform?embedded=true`;
    return `https://docs.google.com/${m[1]}/d/${m[2]}/preview`;
  }

  if (/\.pdf$/i.test(u.pathname)) return u.toString();
  return null;
}

export function ordenarPorOrdem<T extends { ordem: number; titulo: string; created_at?: string }>(itens: T[]): T[] {
  return [...itens].sort((a, b) =>
    a.ordem - b.ordem || (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.titulo.localeCompare(b.titulo)
  );
}

export function proximaOrdem(itens: { ordem: number }[]): number {
  return itens.reduce((m, i) => Math.max(m, i.ordem), 0) + 1;
}

/**
 * Move um item para cima/baixo dentro de `itens` e devolve so as ordens que
 * mudaram. Com ordens distintas troca as duas, para nao renumerar a trilha
 * inteira quando `itens` e so um grupo (uma categoria); com empate renumera 1..n.
 */
export function mover<T extends { id: string; ordem: number; titulo: string; created_at?: string }>(
  itens: T[], id: string, direcao: -1 | 1
): { id: string; ordem: number }[] {
  const lista = ordenarPorOrdem(itens);
  const i = lista.findIndex(x => x.id === id);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= lista.length) return [];
  const [a, b] = [lista[i], lista[j]];
  if (a.ordem !== b.ordem) return [{ id: a.id, ordem: b.ordem }, { id: b.id, ordem: a.ordem }];
  [lista[i], lista[j]] = [b, a];
  return lista
    .map((x, idx) => ({ id: x.id, ordem: idx + 1, antes: x.ordem }))
    .filter(x => x.ordem !== x.antes)
    .map(({ id: xid, ordem }) => ({ id: xid, ordem }));
}

export interface ResumoProgresso {
  concluidas: number;
  total: number;
  pct: number;
}

function resumo(concluidas: number, total: number): ResumoProgresso {
  return { concluidas, total, pct: total > 0 ? Math.round((concluidas / total) * 100) : 0 };
}

/** Aulas concluidas por um usuario (ids). */
export function concluidasDe(progresso: ProgressoAula[], userId: string): Set<string> {
  return new Set(progresso.filter(p => p.user_id === userId && p.concluida_em).map(p => p.aula_id));
}

export function progressoDoModulo(aulas: AulaAcademia[], moduloId: string, concluidas: Set<string>): ResumoProgresso {
  const doModulo = aulas.filter(a => a.modulo_id === moduloId);
  return resumo(doModulo.filter(a => concluidas.has(a.id)).length, doModulo.length);
}

/** Progresso que so conta aulas que ainda existem (progresso de aula apagada nao infla o numero). */
export function progressoGeral(aulas: AulaAcademia[], concluidas: Set<string>): ResumoProgresso {
  return resumo(aulas.filter(a => concluidas.has(a.id)).length, aulas.length);
}

export interface ProgressoPessoa {
  userId: string;
  geral: ResumoProgresso;
  porModulo: Record<string, ResumoProgresso>;
  ultimaAtividade: string | null;
}

export function progressoDaEquipe(
  pessoas: { id: string }[], modulos: ModuloAcademia[], aulas: AulaAcademia[], progresso: ProgressoAula[]
): ProgressoPessoa[] {
  const aulaIds = new Set(aulas.map(a => a.id));
  return pessoas.map(p => {
    const concl = concluidasDe(progresso, p.id);
    const porModulo: Record<string, ResumoProgresso> = {};
    for (const m of modulos) porModulo[m.id] = progressoDoModulo(aulas, m.id, concl);
    const ultima = progresso
      .filter(r => r.user_id === p.id && aulaIds.has(r.aula_id))
      .map(r => r.concluida_em && r.concluida_em > r.updated_at ? r.concluida_em : r.updated_at)
      .sort()
      .pop() ?? null;
    return { userId: p.id, geral: progressoGeral(aulas, concl), porModulo, ultimaAtividade: ultima };
  });
}

export function aulasDoModulo(aulas: AulaAcademia[], moduloId: string): AulaAcademia[] {
  return ordenarPorOrdem(aulas.filter(a => a.modulo_id === moduloId));
}

/** Aula anterior/proxima dentro do mesmo modulo. */
export function vizinhas(aulas: AulaAcademia[], aulaId: string): { anterior: AulaAcademia | null; proxima: AulaAcademia | null } {
  const atual = aulas.find(a => a.id === aulaId);
  if (!atual) return { anterior: null, proxima: null };
  const lista = aulasDoModulo(aulas, atual.modulo_id);
  const i = lista.findIndex(a => a.id === aulaId);
  return { anterior: lista[i - 1] ?? null, proxima: lista[i + 1] ?? null };
}

export function urlValida(url: string): boolean {
  return parseUrl(url) !== null;
}

export function formatarDuracao(min: number | null | undefined): string | null {
  if (!min || min <= 0) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}

/** Linhas cruas do banco (jsonb e texto livre) para os tipos da tela. */
export function paraModulo(r: { id: string; titulo: string; descricao: string | null; categoria: string; ordem: number; created_at: string }): ModuloAcademia {
  return { id: r.id, titulo: r.titulo, descricao: r.descricao, categoria: normalizarCategoria(r.categoria), ordem: r.ordem, created_at: r.created_at };
}

export function paraAula(r: {
  id: string; modulo_id: string; titulo: string; descricao: string | null; tipo: string; url: string | null;
  conteudo: string | null; duracao_min: number | null; checklist: unknown; ordem: number; created_at: string;
}): AulaAcademia {
  return {
    id: r.id, modulo_id: r.modulo_id, titulo: r.titulo, descricao: r.descricao, tipo: normalizarTipo(r.tipo), url: r.url,
    conteudo: r.conteudo, duracao_min: r.duracao_min, checklist: lerChecklist(r.checklist), ordem: r.ordem, created_at: r.created_at,
  };
}

export function paraProgresso(r: { aula_id: string; user_id: string; concluida_em: string | null; checklist_feitos: unknown; updated_at: string }): ProgressoAula {
  return { aula_id: r.aula_id, user_id: r.user_id, concluida_em: r.concluida_em, checklist_feitos: lerIndices(r.checklist_feitos), updated_at: r.updated_at };
}

/** Erro do PostgREST/Postgres quando a migration ainda nao foi aplicada. */
export function tabelaAusente(error: unknown): boolean {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : null;
  return code === "42P01" || code === "PGRST205" || code === "PGRST202";
}
