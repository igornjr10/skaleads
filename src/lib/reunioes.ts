export type StatusReuniao = "agendada" | "realizada" | "cancelada";

export interface AcaoReuniao {
  id: string;
  texto: string;
  responsavel_id: string | null;
  prazo: string | null;
  feito: boolean;
  task_id: string | null;
}

export interface Reuniao {
  id: string;
  client_id: string | null;
  titulo: string;
  inicio: string;
  duracao_min: number;
  status: StatusReuniao;
  meet_url: string | null;
  local: string | null;
  pauta: string | null;
  decisoes: string | null;
  observacoes: string | null;
  acoes: AcaoReuniao[];
  gravacao_url: string | null;
  transcricao: string | null;
  resumo_ia: string | null;
  resumo_ia_em: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const STATUS_REUNIAO: { id: StatusReuniao; label: string; classe: string }[] = [
  { id: "agendada", label: "Agendada", classe: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  { id: "realizada", label: "Realizada", classe: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  { id: "cancelada", label: "Cancelada", classe: "border-muted-foreground/30 bg-muted/40 text-muted-foreground" },
];

export function statusReuniaoMeta(status: string) {
  return STATUS_REUNIAO.find(s => s.id === status) ?? STATUS_REUNIAO[0];
}

function paraStatus(v: unknown): StatusReuniao {
  return v === "realizada" || v === "cancelada" ? v : "agendada";
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function novoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** O jsonb vem do banco sem garantia de forma: o que nao e acao valida cai fora. */
export function paraAcoes(json: unknown): AcaoReuniao[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object" && typeof (a as { texto?: unknown }).texto === "string")
    .map(a => ({
      id: texto(a.id) ?? novoId(),
      texto: String(a.texto),
      responsavel_id: texto(a.responsavel_id),
      prazo: typeof a.prazo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.prazo) ? a.prazo : null,
      feito: a.feito === true,
      task_id: texto(a.task_id),
    }));
}

export function paraReuniao(r: Record<string, unknown>): Reuniao {
  return {
    id: String(r.id),
    client_id: texto(r.client_id),
    titulo: String(r.titulo ?? ""),
    inicio: String(r.inicio),
    duracao_min: typeof r.duracao_min === "number" && r.duracao_min > 0 ? r.duracao_min : 60,
    status: paraStatus(r.status),
    meet_url: texto(r.meet_url),
    local: texto(r.local),
    pauta: texto(r.pauta),
    decisoes: texto(r.decisoes),
    observacoes: texto(r.observacoes),
    acoes: paraAcoes(r.acoes),
    gravacao_url: texto(r.gravacao_url),
    transcricao: texto(r.transcricao),
    resumo_ia: texto(r.resumo_ia),
    resumo_ia_em: texto(r.resumo_ia_em),
    created_by: texto(r.created_by),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export function fimDaReuniao(r: Pick<Reuniao, "inicio" | "duracao_min">): Date {
  return new Date(new Date(r.inicio).getTime() + r.duracao_min * 60_000);
}

/** Agendada cujo horario ja passou: alguem precisa dizer se aconteceu. */
export function aguardaRegistro(r: Pick<Reuniao, "status" | "inicio" | "duracao_min">, agora = new Date()): boolean {
  return r.status === "agendada" && fimDaReuniao(r).getTime() < agora.getTime();
}

export function estaAcontecendo(r: Pick<Reuniao, "status" | "inicio" | "duracao_min">, agora = new Date()): boolean {
  const t = agora.getTime();
  return r.status === "agendada" && new Date(r.inicio).getTime() <= t && fimDaReuniao(r).getTime() >= t;
}

/** Proximas: agendadas que ainda nao terminaram, da mais cedo para a mais tarde. Historico: o resto, da mais recente. */
export function separarReunioes<T extends Pick<Reuniao, "status" | "inicio" | "duracao_min">>(lista: T[], agora = new Date()) {
  const proximas: T[] = [];
  const historico: T[] = [];
  for (const r of lista) {
    if (r.status === "agendada" && fimDaReuniao(r).getTime() >= agora.getTime()) proximas.push(r);
    else historico.push(r);
  }
  proximas.sort((a, b) => a.inicio.localeCompare(b.inicio));
  historico.sort((a, b) => b.inicio.localeCompare(a.inicio));
  return { proximas, historico };
}

function doisDigitos(n: number) {
  return String(n).padStart(2, "0");
}

/** yyyy-mm-dd no fuso de quem esta olhando. */
export function chaveDoDia(data: Date | string): string {
  const d = typeof data === "string" ? new Date(data) : data;
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

function somarDias(chave: string, dias: number) {
  const [a, m, d] = chave.split("-").map(Number);
  return chaveDoDia(new Date(a, m - 1, d + dias));
}

export function rotuloDoDia(chave: string, hoje = new Date()): string {
  const chaveHoje = chaveDoDia(hoje);
  if (chave === chaveHoje) return "Hoje";
  if (chave === somarDias(chaveHoje, 1)) return "Amanhã";
  if (chave === somarDias(chaveHoje, -1)) return "Ontem";
  const [a, m, d] = chave.split("-").map(Number);
  const data = new Date(a, m - 1, d);
  const rotulo = data.toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long",
    ...(a !== hoje.getFullYear() ? { year: "numeric" } : {}),
  });
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
}

export interface GrupoDoDia<T> {
  dia: string;
  rotulo: string;
  hoje: boolean;
  itens: T[];
}

/** Agrupa mantendo a ordem em que a lista ja veio. */
export function agruparPorDia<T extends Pick<Reuniao, "inicio">>(lista: T[], hoje = new Date()): GrupoDoDia<T>[] {
  const chaveHoje = chaveDoDia(hoje);
  const grupos: GrupoDoDia<T>[] = [];
  const porDia = new Map<string, GrupoDoDia<T>>();
  for (const r of lista) {
    const dia = chaveDoDia(r.inicio);
    let g = porDia.get(dia);
    if (!g) {
      g = { dia, rotulo: rotuloDoDia(dia, hoje), hoje: dia === chaveHoje, itens: [] };
      porDia.set(dia, g);
      grupos.push(g);
    }
    g.itens.push(r);
  }
  return grupos;
}

export function horario(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function dataEHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function duracaoLegivel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h}h${doisDigitos(resto)}` : `${h}h`;
}

/** Valor para <input type="datetime-local"> no fuso local. */
export function paraInputLocal(iso: string): string {
  const d = new Date(iso);
  return `${chaveDoDia(d)}T${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

/** O datetime-local nao tem fuso: o navegador interpreta como hora local. */
export function deInputLocal(valor: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(valor)) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 20261012T130000Z, o formato de data UTC do Google Agenda e do iCalendar. */
export function dataUtcCompacta(data: Date): string {
  return data.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export interface DadosDoConvite {
  titulo: string;
  inicio: string;
  duracao_min: number;
  detalhes?: string | null;
  local?: string | null;
}

export function linkGoogleAgenda(c: DadosDoConvite): string {
  const inicio = new Date(c.inicio);
  const fim = new Date(inicio.getTime() + c.duracao_min * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: c.titulo,
    dates: `${dataUtcCompacta(inicio)}/${dataUtcCompacta(fim)}`,
  });
  if (c.detalhes) params.set("details", c.detalhes);
  if (c.local) params.set("location", c.local);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escaparIcs(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// RFC 5545 pede linhas de ate 75 octetos; continuacao comeca com espaco.
function dobrarLinha(linha: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(linha).length <= 75) return linha;
  const partes: string[] = [];
  let atual = "";
  let limite = 75;
  for (const ch of linha) {
    if (bytes.encode(atual + ch).length > limite) {
      partes.push(atual);
      atual = ch;
      limite = 74;
    } else {
      atual += ch;
    }
  }
  if (atual) partes.push(atual);
  return partes.join("\r\n ");
}

export function gerarIcs(c: DadosDoConvite & { uid: string; url?: string | null }, agora = new Date()): string {
  const inicio = new Date(c.inicio);
  const fim = new Date(inicio.getTime() + c.duracao_min * 60_000);
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ad Campaign Hub//Reunioes//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${c.uid}`,
    `DTSTAMP:${dataUtcCompacta(agora)}`,
    `DTSTART:${dataUtcCompacta(inicio)}`,
    `DTEND:${dataUtcCompacta(fim)}`,
    `SUMMARY:${escaparIcs(c.titulo)}`,
    c.detalhes ? `DESCRIPTION:${escaparIcs(c.detalhes)}` : "",
    c.local ? `LOCATION:${escaparIcs(c.local)}` : "",
    c.url ? `URL:${c.url}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return linhas.map(dobrarLinha).join("\r\n") + "\r\n";
}

export function nomeDoArquivoIcs(titulo: string): string {
  const base = titulo
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "reuniao"}.ics`;
}

/** Texto do convite: o que vai na descricao do Google Agenda e do .ics. */
export function detalhesDoConvite(r: Pick<Reuniao, "pauta" | "meet_url">, extras: { cliente?: string | null; link?: string | null } = {}): string {
  const partes = [
    extras.cliente ? `Cliente: ${extras.cliente}` : "",
    r.meet_url ? `Google Meet: ${r.meet_url}` : "",
    r.pauta ? `Pauta:\n${r.pauta}` : "",
    extras.link ? `Registro da reuniao: ${extras.link}` : "",
  ];
  return partes.filter(Boolean).join("\n\n");
}

/** Onde a reuniao acontece para o calendario: o Meet ganha do local fisico. */
export function localDoConvite(r: Pick<Reuniao, "meet_url" | "local">): string | null {
  return r.meet_url || r.local || null;
}

const LINHA_TEMPO = /^\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}.*$/;

export function pareceLegenda(conteudo: string): boolean {
  return /^\uFEFF?WEBVTT/.test(conteudo.trimStart()) || conteudo.split(/\r?\n/).some(l => LINHA_TEMPO.test(l));
}

/**
 * Tira de um .vtt/.srt o que nao e fala: cabecalho, numeracao, tempos, blocos
 * NOTE/STYLE e tags. `<v Fulano>` vira "Fulano: ". Falas seguidas da mesma
 * pessoa se juntam, e linha repetida (comum em legenda automatica) cai fora.
 * Texto que nao e legenda volta como veio, so sem espaco sobrando.
 */
export function limparTranscricao(conteudo: string): string {
  const semBom = conteudo.replace(/^\uFEFF/, "");
  if (!pareceLegenda(semBom)) return semBom.replace(/\r\n/g, "\n").trim();

  const blocos = semBom.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  const falas: { quem: string | null; texto: string }[] = [];

  for (const bloco of blocos) {
    const linhas = bloco.split("\n").map(l => l.trim()).filter(Boolean);
    if (!linhas.length) continue;
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(linhas[0])) continue;

    const iTempo = linhas.findIndex(l => LINHA_TEMPO.test(l));
    const texto = (iTempo >= 0 ? linhas.slice(iTempo + 1) : linhas.filter(l => !/^\d+$/.test(l))).join(" ");
    if (!texto) continue;

    const voz = texto.match(/^<v(?:\.[^\s>]+)?\s+([^>]+)>/);
    const limpo = texto
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!limpo) continue;

    const quem = voz ? voz[1].trim() : null;
    const anterior = falas[falas.length - 1];
    if (anterior && anterior.quem === quem) {
      if (anterior.texto.endsWith(limpo)) continue;
      anterior.texto += ` ${limpo}`;
    } else {
      falas.push({ quem, texto: limpo });
    }
  }

  return falas.map(f => (f.quem ? `${f.quem}: ${f.texto}` : f.texto)).join("\n");
}

/** Corpo da demanda que nasce de uma acao: o time precisa saber de onde veio. */
export function descricaoDaDemanda(
  acao: Pick<AcaoReuniao, "texto">,
  r: Pick<Reuniao, "id" | "titulo" | "inicio">,
  extras: { cliente?: string | null; origem?: string } = {},
): string {
  const quando = new Date(r.inicio).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const link = `${extras.origem ?? ""}/reunioes?reuniao=${r.id}`;
  return [
    acao.texto,
    "",
    `Combinado na reunião "${r.titulo}" de ${quando}${extras.cliente ? ` com ${extras.cliente}` : ""}.`,
    `Registro: ${link}`,
  ].join("\n");
}

/** Titulo da demanda cabe no card: corta na palavra. */
export function tituloDaDemanda(texto: string, max = 120): string {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  const espaco = corte.lastIndexOf(" ");
  return `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).trimEnd()}…`;
}

/** Une decisoes novas sem repetir as que ja estao escritas. */
export function juntarDecisoes(atual: string | null, novas: string[]): string {
  const existentes = (atual ?? "").split("\n").map(l => l.replace(/^[-*•]\s*/, "").trim().toLowerCase()).filter(Boolean);
  const acrescimo = novas
    .map(n => n.trim())
    .filter(n => n && !existentes.includes(n.toLowerCase()))
    .map(n => `- ${n}`);
  return [(atual ?? "").trimEnd(), ...acrescimo].filter(Boolean).join("\n");
}

/** "2026-10-15" ou "15/10/2026" sugerido pela IA vira yyyy-mm-dd; o resto, null. */
export function normalizarPrazo(v: string | null | undefined): string | null {
  if (!v) return null;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return null;
}

/** Acha a pessoa pelo nome sugerido pela IA: nome exato, depois primeiro nome unico. */
export function acharPessoaPorNome<T extends { id: string; nome: string }>(nome: string | null | undefined, pessoas: T[]): string | null {
  if (!nome) return null;
  const alvo = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (!alvo) return null;
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const exato = pessoas.find(p => norm(p.nome) === alvo);
  if (exato) return exato.id;
  const primeiro = alvo.split(/\s+/)[0];
  const candidatos = pessoas.filter(p => norm(p.nome).split(/\s+/)[0] === primeiro);
  return candidatos.length === 1 ? candidatos[0].id : null;
}

export function erroDeTabelaAusente(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "42P01" || code === "PGRST205";
}

export interface ResumoDaReuniao {
  resumo: string;
  decisoes: string[];
  acoes: { texto: string; responsavel_sugerido: string | null; prazo_sugerido: string | null }[];
  pendencias: string[];
}

/** A resposta da function passa por aqui para a tela nunca quebrar com JSON torto da IA. */
export function paraResumo(json: unknown): ResumoDaReuniao {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []);
  return {
    resumo: typeof o.resumo === "string" ? o.resumo : "",
    decisoes: lista(o.decisoes),
    pendencias: lista(o.pendencias),
    acoes: Array.isArray(o.acoes)
      ? o.acoes
          .filter((a): a is Record<string, unknown> => !!a && typeof a === "object" && typeof (a as { texto?: unknown }).texto === "string")
          .map(a => ({
            texto: String(a.texto).trim(),
            responsavel_sugerido: texto(a.responsavel_sugerido),
            prazo_sugerido: texto(a.prazo_sugerido),
          }))
          .filter(a => a.texto)
      : [],
  };
}
