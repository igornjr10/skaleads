// Identidade visual dos relatorios por assessoria (Midsam Marketing, Midsam
// Log...). Tudo que pinta relatorio passa por aqui: a previa HTML, o PDF que
// sai dela e o PDF do painel usam o mesmo tema. Cor e logo vem do cadastro
// (tabela assessorias); texto livre so serve para RECONHECER o cadastro.

export interface Assessoria {
  id: string;
  nome: string;
  aliases: string[];
  logo_url: string | null;
  cor_primaria: string;
  cor_secundaria: string;
  cor_destaque: string;
  cor_fundo: string;
  cor_texto: string;
  modelo?: string | null;
}

/** As cinco cores do cadastro; o resto do tema deriva delas. */
export interface PaletaBase {
  primaria: string;
  secundaria: string;
  destaque: string;
  fundo: string;
  texto: string;
}

/** Tema pronto para pintar: cada tom que o relatorio usa, ja calculado. */
export interface TemaRelatorio extends PaletaBase {
  /** Gradiente da capa, do mais claro ao mais escuro. */
  capa1: string;
  capa2: string;
  capa3: string;
  /** Barra do topo sobre a capa (rgba). */
  topo: string;
  avatar: string;
  /** Textos claros sobre a capa escura. */
  sobreCapa: string;
  sobreCapaSuave: string;
  /** Numero e trecho em destaque sobre fundo branco. */
  forte: string;
  borda: string;
  /** Fundo bem claro da cor (etiqueta, celula de tabela). */
  tinta: string;
}

/** Identidade gravada no relatorio: o que foi usado na geracao, para nao mudar depois. */
export interface IdentidadeRelatorio {
  assessoria_id: string | null;
  nome: string;
  logo_url: string | null;
  paleta: PaletaBase;
}

/**
 * Azul do relatorio desde sempre. E o tema de quem nao tem assessoria e de
 * todo relatorio salvo antes das assessorias existirem: abrir um antigo
 * continua igual.
 */
export const PALETA_PADRAO: PaletaBase = {
  primaria: "#1f5fd1",
  secundaria: "#0a2a6e",
  destaque: "#6fa8ff",
  fundo: "#f3f7fd",
  texto: "#0f1b33",
};

/** Sugestoes para o cadastro; a cor que vale e sempre a gravada na assessoria. */
export const PALETAS_SUGERIDAS: Array<{ nome: string; paleta: PaletaBase }> = [
  { nome: "Azul e branco", paleta: PALETA_PADRAO },
  {
    nome: "Vermelho e branco",
    paleta: { primaria: "#d7262e", secundaria: "#7a0f14", destaque: "#ff8a8f", fundo: "#fdf4f4", texto: "#1f1416" },
  },
];

const HEX = /^#[0-9a-f]{6}$/i;

export function hexValido(v: string | null | undefined): v is string {
  return !!v && HEX.test(v.trim());
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function hex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

/** Mistura `a` com `b`; peso 0 = so a, 1 = so b. */
export function misturar(a: string, b: string, peso: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return hex(x.map((v, i) => v + (y[i] - v) * peso));
}

function rgba(cor: string, alfa: number): string {
  const [r, g, b] = rgb(cor);
  return `rgba(${r},${g},${b},${alfa})`;
}

/** Cor invalida ou ausente cai na do padrao, uma a uma. */
export function paletaDe(a: Partial<Pick<Assessoria, "cor_primaria" | "cor_secundaria" | "cor_destaque" | "cor_fundo" | "cor_texto">> | null | undefined): PaletaBase {
  const ou = (v: string | null | undefined, padrao: string) => (hexValido(v) ? v.trim().toLowerCase() : padrao);
  return {
    primaria: ou(a?.cor_primaria, PALETA_PADRAO.primaria),
    secundaria: ou(a?.cor_secundaria, PALETA_PADRAO.secundaria),
    destaque: ou(a?.cor_destaque, PALETA_PADRAO.destaque),
    fundo: ou(a?.cor_fundo, PALETA_PADRAO.fundo),
    texto: ou(a?.cor_texto, PALETA_PADRAO.texto),
  };
}

export function temaDaPaleta(p: PaletaBase): TemaRelatorio {
  const escura = misturar(p.secundaria, "#000000", 0.45);
  return {
    ...p,
    capa1: misturar(p.primaria, p.secundaria, 0.35),
    capa2: p.secundaria,
    capa3: escura,
    topo: rgba(misturar(escura, "#000000", 0.4), 0.55),
    avatar: misturar(p.secundaria, "#000000", 0.25),
    sobreCapa: misturar(p.destaque, "#ffffff", 0.6),
    sobreCapaSuave: misturar(p.destaque, "#ffffff", 0.78),
    forte: misturar(p.primaria, p.secundaria, 0.5),
    borda: misturar(p.fundo, p.texto, 0.08),
    tinta: misturar(p.primaria, "#ffffff", 0.92),
  };
}

export const TEMA_PADRAO = temaDaPaleta(PALETA_PADRAO);

export function identidadeDa(a: Assessoria): IdentidadeRelatorio {
  return { assessoria_id: a.id, nome: a.nome, logo_url: a.logo_url, paleta: paletaDe(a) };
}

// ── Reconhecimento pelo nome ────────────────────────────────────────────────

/** "Mídsam  LOG!" -> "midsam log": sem acento, caixa, pontuacao e espaco duplo. */
export function normalizarNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Termo aparece como palavras inteiras: "log" nao casa com "logo" nem "blog". */
function contemTermo(textoNormal: string, termo: string): boolean {
  const t = normalizarNome(termo);
  if (!t) return false;
  return ` ${textoNormal} `.includes(` ${t} `);
}

export type Reconhecimento<T> =
  | { tipo: "unico"; item: T }
  | { tipo: "ambiguo"; itens: T[] }
  | { tipo: "nenhum" };

/**
 * Procura no texto o nome oficial ou um alias de cada item. Mais de um
 * encontrado = ambiguo: quem decide e a pessoa, nunca o mais parecido.
 */
export function reconhecerNoTexto<T>(texto: string, itens: T[], nomesDe: (item: T) => string[]): Reconhecimento<T> {
  const normal = normalizarNome(texto ?? "");
  if (!normal) return { tipo: "nenhum" };
  const achados = itens.filter((item) => nomesDe(item).some((n) => contemTermo(normal, n)));
  if (achados.length === 1) return { tipo: "unico", item: achados[0] };
  if (achados.length > 1) return { tipo: "ambiguo", itens: achados };
  return { tipo: "nenhum" };
}

export function reconhecerAssessoria(texto: string, assessorias: Assessoria[]) {
  return reconhecerNoTexto(texto, assessorias, (a) => [a.nome, ...(a.aliases ?? [])]);
}

/**
 * Cliente pelo nome escrito. So casa o nome inteiro (ou o nome de relatorio);
 * dois clientes que batem viram ambiguo e a tela pede para escolher.
 */
export function reconhecerCliente<T extends { name: string; nome_relatorio?: string | null }>(texto: string, clientes: T[]) {
  return reconhecerNoTexto(texto, clientes, (c) => [c.name, c.nome_relatorio ?? ""].filter((n) => normalizarNome(n).length >= 3));
}

// ── Qual assessoria vale ────────────────────────────────────────────────────

export type OrigemAssessoria = "escolhida" | "cliente" | "texto" | "unica" | "pendente";

export interface ResolucaoAssessoria {
  assessoria: Assessoria | null;
  origem: OrigemAssessoria;
  /** O texto fala de outra assessoria que nao a usada: a tela avisa antes de gerar. */
  conflito: Assessoria | null;
  /** O texto cita mais de uma e nao ha escolha nem vinculo: a pessoa precisa decidir. */
  candidatas: Assessoria[];
}

/**
 * Prioridade: 1) escolhida para este relatorio; 2) vinculada ao cliente;
 * 3) reconhecida no texto; 4) pendente (pedir para escolher). Segmento do
 * cliente nunca decide.
 */
export function resolverAssessoria(e: {
  assessorias: Assessoria[];
  escolhidaId?: string | null;
  doClienteId?: string | null;
  texto?: string;
}): ResolucaoAssessoria {
  const porId = (id: string | null | undefined) => (id ? e.assessorias.find((a) => a.id === id) ?? null : null);
  const doTexto = reconhecerAssessoria(e.texto ?? "", e.assessorias);
  const citada = doTexto.tipo === "unico" ? doTexto.item : null;

  const escolhida = porId(e.escolhidaId);
  const doCliente = porId(e.doClienteId);
  const usada = escolhida ?? doCliente;

  if (usada) {
    return {
      assessoria: usada,
      origem: escolhida ? "escolhida" : "cliente",
      conflito: citada && citada.id !== usada.id ? citada : null,
      candidatas: [],
    };
  }
  if (citada) return { assessoria: citada, origem: "texto", conflito: null, candidatas: [] };
  // Uma so cadastrada nao e "identificacao segura" do texto, mas e a unica opcao.
  if (e.assessorias.length === 1 && doTexto.tipo === "nenhum") {
    return { assessoria: e.assessorias[0], origem: "unica", conflito: null, candidatas: [] };
  }
  return { assessoria: null, origem: "pendente", conflito: null, candidatas: doTexto.tipo === "ambiguo" ? doTexto.itens : [] };
}

// ── Dados do cliente para o relatorio ───────────────────────────────────────

export interface ClienteDoRelatorio {
  id: string;
  name: string;
  nome_relatorio?: string | null;
  logo_url: string | null;
  city: string | null;
  state: string | null;
  business_segment?: string | null;
  assessoria_id?: string | null;
}

/** O que falta no cadastro, escrito do jeito que a tela mostra. Nada e inventado. */
export function pendenciasDoCliente(c: ClienteDoRelatorio, assessoria: Assessoria | null): string[] {
  const falta: string[] = [];
  if (!c.logo_url) falta.push("Logo do cliente não cadastrada");
  if (!c.city?.trim()) falta.push("Cidade não cadastrada");
  if (!c.state?.trim()) falta.push("Estado (UF) não cadastrado");
  if (!c.business_segment?.trim()) falta.push("Segmento não cadastrado");
  if (!c.assessoria_id) falta.push("Assessoria responsável não vinculada");
  if (assessoria && !assessoria.logo_url) falta.push(`Logo da assessoria ${assessoria.nome} não cadastrada`);
  return falta;
}

export function localDoCliente(c: Pick<ClienteDoRelatorio, "city" | "state">): string {
  const cidade = c.city?.trim();
  if (!cidade) return "";
  return c.state?.trim() ? `${cidade}/${c.state.trim().toUpperCase()}` : cidade;
}

export function nomeNoRelatorio(c: Pick<ClienteDoRelatorio, "name" | "nome_relatorio">): string {
  return c.nome_relatorio?.trim() || c.name;
}
