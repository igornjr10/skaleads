// Inteligencia de campanhas avaliada pelo objetivo. Campanha de reconhecimento
// nao gera conversa e campanha de mensagem nao precisa de CTR alto: julgar
// todas pela mesma regua gera alerta falso nas duas pontas. Aqui cada grupo de
// objetivo tem seus KPIs e suas regras, e toda comparacao diz de onde veio o
// parametro (meta do cliente, carteira ou referencia de mercado).

import { eCampanhaDeMensagem } from "./custo-mensagem";
import { calcularFinanceiro, CUSTO_OPERACIONAL_PADRAO, type ResultadoFinanceiro } from "./financeiro-cliente";

export type GrupoObjetivo = "mensagens" | "reconhecimento" | "trafego" | "conversoes" | "outros";

export const GRUPOS: { valor: GrupoObjetivo; label: string; descricao: string }[] = [
  { valor: "mensagens", label: "Mensagens", descricao: "Conversas no WhatsApp, Direct ou Messenger" },
  { valor: "trafego", label: "Tráfego / visitas", descricao: "Cliques para o perfil, site ou link" },
  { valor: "reconhecimento", label: "Reconhecimento", descricao: "Alcance e lembrança de marca" },
  { valor: "conversoes", label: "Conversões", descricao: "Leads, cadastros e vendas" },
  { valor: "outros", label: "Engajamento / outros", descricao: "Objetivos sem resultado de negócio direto" },
];

export function labelGrupo(g: GrupoObjetivo) {
  return GRUPOS.find(x => x.valor === g)?.label ?? g;
}

const RECONHECIMENTO = new Set(["OUTCOME_AWARENESS", "BRAND_AWARENESS", "REACH", "VIDEO_VIEWS"]);
const TRAFEGO = new Set(["OUTCOME_TRAFFIC", "LINK_CLICKS"]);
const CONVERSOES = new Set(["OUTCOME_LEADS", "OUTCOME_SALES", "CONVERSIONS", "LEAD_GENERATION", "PRODUCT_CATALOG_SALES"]);

export function classificarObjetivo(objective: string | null | undefined, messages = 0, conversions = 0): GrupoObjetivo {
  const obj = (objective ?? "").toUpperCase();
  if (RECONHECIMENTO.has(obj)) return "reconhecimento";
  // Lead/venda que tambem puxa conversa: vale o resultado que mais apareceu.
  if (CONVERSOES.has(obj) && (Number(conversions) || 0) >= (Number(messages) || 0)) return "conversoes";
  if (eCampanhaDeMensagem({ objective: obj, messages })) return "mensagens";
  if (CONVERSOES.has(obj)) return "conversoes";
  if (TRAFEGO.has(obj)) return "trafego";
  return "outros";
}

// ── KPIs por objetivo ────────────────────────────────────────────────────────

export type ChaveKpi =
  | "investido" | "mensagens" | "custo_mensagem" | "conversoes" | "custo_conversao"
  | "cliques" | "cpc" | "ctr" | "cpm" | "impressoes" | "alcance" | "frequencia";

export type FormatoKpi = "moeda" | "numero" | "percentual" | "multiplo";

export const KPI_DEF: Record<ChaveKpi, { label: string; formato: FormatoKpi }> = {
  investido: { label: "Investido", formato: "moeda" },
  mensagens: { label: "Mensagens", formato: "numero" },
  custo_mensagem: { label: "Custo por mensagem", formato: "moeda" },
  conversoes: { label: "Conversões", formato: "numero" },
  custo_conversao: { label: "Custo por conversão", formato: "moeda" },
  cliques: { label: "Cliques", formato: "numero" },
  cpc: { label: "CPC", formato: "moeda" },
  ctr: { label: "CTR", formato: "percentual" },
  cpm: { label: "CPM", formato: "moeda" },
  impressoes: { label: "Impressões", formato: "numero" },
  alcance: { label: "Alcance", formato: "numero" },
  frequencia: { label: "Frequência", formato: "multiplo" },
};

export const KPIS_POR_GRUPO: Record<GrupoObjetivo, ChaveKpi[]> = {
  mensagens: ["investido", "mensagens", "custo_mensagem", "ctr", "cpc"],
  trafego: ["investido", "cliques", "cpc", "ctr", "cpm"],
  reconhecimento: ["investido", "alcance", "impressoes", "cpm", "frequencia"],
  conversoes: ["investido", "conversoes", "custo_conversao", "ctr", "cpc"],
  outros: ["investido", "impressoes", "cliques", "ctr", "cpc"],
};

/** O resultado principal de cada grupo e quanto ele custa. */
export const RESULTADO_POR_GRUPO: Record<GrupoObjetivo, { volume: ChaveKpi; custo: ChaveKpi; unidade: string }> = {
  mensagens: { volume: "mensagens", custo: "custo_mensagem", unidade: "mensagens" },
  conversoes: { volume: "conversoes", custo: "custo_conversao", unidade: "conversões" },
  trafego: { volume: "cliques", custo: "cpc", unidade: "cliques" },
  reconhecimento: { volume: "alcance", custo: "cpm", unidade: "pessoas alcançadas" },
  outros: { volume: "cliques", custo: "cpc", unidade: "cliques" },
};

export interface CampanhaEntrada {
  id: string;
  client_id: string;
  name: string;
  status: string;
  objective: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  messages: number;
  /** Alcance e frequencia vem dos anuncios; a tabela de campanhas nao guarda. */
  reach?: number | null;
  frequency?: number | null;
}

const n = (v: unknown) => Number(v) || 0;

export function valorKpi(c: CampanhaEntrada, chave: ChaveKpi): number | null {
  const spend = n(c.spend);
  const impr = n(c.impressions);
  const cliques = n(c.clicks);
  switch (chave) {
    case "investido": return spend;
    case "mensagens": return n(c.messages);
    case "custo_mensagem": return n(c.messages) > 0 ? spend / n(c.messages) : null;
    case "conversoes": return n(c.conversions);
    case "custo_conversao": return n(c.conversions) > 0 ? spend / n(c.conversions) : null;
    case "cliques": return cliques;
    case "cpc": return cliques > 0 ? spend / cliques : null;
    case "ctr": return impr > 0 ? (cliques / impr) * 100 : null;
    case "cpm": return impr > 0 ? (spend / impr) * 1000 : null;
    case "impressoes": return impr;
    case "alcance": return c.reach ? n(c.reach) : null;
    case "frequencia":
      if (c.frequency) return n(c.frequency);
      return c.reach && impr > 0 ? impr / n(c.reach) : null;
  }
}

export function formatarKpi(v: number | null, formato: FormatoKpi): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (formato === "moeda") return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (formato === "percentual") return `${v.toFixed(2).replace(".", ",")}%`;
  if (formato === "multiplo") return `${v.toFixed(2).replace(".", ",")}x`;
  return Math.round(v).toLocaleString("pt-BR");
}

/** Resultado principal da campanha conforme o objetivo, para a tabela. */
export function resultadoDaCampanha(c: CampanhaEntrada, grupo = classificarObjetivo(c.objective, c.messages, c.conversions)) {
  const r = RESULTADO_POR_GRUPO[grupo];
  return {
    grupo,
    volume: valorKpi(c, r.volume),
    volumeLabel: KPI_DEF[r.volume].label,
    unidade: r.unidade,
    custo: valorKpi(c, r.custo),
    custoChave: r.custo,
    custoLabel: KPI_DEF[r.custo].label,
  };
}

// ── Referencias ──────────────────────────────────────────────────────────────

/**
 * Faixas de mercado para negocio local no Brasil, por segmento. Nao sao dado
 * de nenhum cliente: servem so quando nao ha meta nem carteira suficiente, e a
 * tela sempre mostra como estimativa.
 */
export const REFERENCIA_MERCADO: Record<string, { custo_mensagem: number; cpc: number; ctr: number; cpm: number; custo_conversao: number }> = {
  restaurante: { custo_mensagem: 5, cpc: 0.8, ctr: 1.4, cpm: 14, custo_conversao: 15 },
  clinica_saude: { custo_mensagem: 12, cpc: 1.6, ctr: 1.1, cpm: 22, custo_conversao: 35 },
  beleza_estetica: { custo_mensagem: 8, cpc: 1.2, ctr: 1.2, cpm: 18, custo_conversao: 25 },
  automotivo: { custo_mensagem: 15, cpc: 1.5, ctr: 1.0, cpm: 20, custo_conversao: 45 },
  varejo: { custo_mensagem: 7, cpc: 1.0, ctr: 1.2, cpm: 16, custo_conversao: 20 },
  servicos: { custo_mensagem: 12, cpc: 1.5, ctr: 1.0, cpm: 20, custo_conversao: 35 },
  educacao: { custo_mensagem: 14, cpc: 1.4, ctr: 1.0, cpm: 18, custo_conversao: 30 },
  imobiliario: { custo_mensagem: 20, cpc: 2.0, ctr: 0.9, cpm: 24, custo_conversao: 50 },
  eventos: { custo_mensagem: 6, cpc: 0.9, ctr: 1.3, cpm: 14, custo_conversao: 18 },
};
const REFERENCIA_GERAL = { custo_mensagem: 10, cpc: 1.5, ctr: 1.0, cpm: 20, custo_conversao: 30 };

export type OrigemReferencia = "meta" | "segmento_carteira" | "carteira" | "mercado";

export interface Referencia {
  valor: number;
  origem: OrigemReferencia;
  /** Texto curto que a tela mostra junto do numero. */
  rotulo: string;
  /** Tudo que nao e meta combinada com o cliente e estimativa. */
  estimativa: boolean;
}

const ROTULO_ORIGEM: Record<OrigemReferencia, string> = {
  meta: "meta do cliente",
  segmento_carteira: "mediana do segmento na carteira",
  carteira: "mediana da carteira",
  mercado: "referência de mercado",
};

/** Abaixo disto a mediana diz mais sobre o acaso do que sobre a carteira. */
export const MIN_AMOSTRA = 3;
/** Gasto minimo para julgar uma campanha: com menos, qualquer custo e ruido. */
export const GASTO_MINIMO = 50;

export function mediana(valores: number[]): number | null {
  const v = valores.filter(x => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

export interface ClienteEntrada {
  id: string;
  name: string;
  business_segment?: string | null;
  alvo_custo_mensagem?: number | null;
  alvo_cpc?: number | null;
  alvo_custo_resultado?: number | null;
}

type ChaveRef = "custo_mensagem" | "cpc" | "cpm" | "custo_conversao";

export interface Carteira {
  /** Mediana de cada KPI por grupo, na carteira toda e por segmento. */
  geral: Map<string, number>;
  segmento: Map<string, number>;
}

function chaveCarteira(grupo: GrupoObjetivo, kpi: ChaveRef, segmento?: string | null) {
  return `${segmento ?? "*"}|${grupo}|${kpi}`;
}

const KPIS_DE_REFERENCIA: ChaveRef[] = ["custo_mensagem", "cpc", "cpm", "custo_conversao"];

export function montarCarteira(campanhas: CampanhaEntrada[], clientes: ClienteEntrada[]): Carteira {
  const seg = new Map(clientes.map(c => [c.id, c.business_segment ?? null]));
  const geral = new Map<string, { valores: number[]; clientes: Set<string> }>();
  const porSeg = new Map<string, { valores: number[]; clientes: Set<string> }>();
  const add = (m: typeof geral, k: string, v: number, cliente: string) => {
    const atual = m.get(k) ?? { valores: [], clientes: new Set<string>() };
    atual.valores.push(v);
    atual.clientes.add(cliente);
    m.set(k, atual);
  };

  for (const c of campanhas) {
    if (n(c.spend) < GASTO_MINIMO) continue;
    const grupo = classificarObjetivo(c.objective, c.messages, c.conversions);
    for (const kpi of KPIS_DE_REFERENCIA) {
      const v = valorKpi(c, kpi);
      if (v === null || v <= 0) continue;
      add(geral, chaveCarteira(grupo, kpi), v, c.client_id);
      const s = seg.get(c.client_id);
      if (s) add(porSeg, chaveCarteira(grupo, kpi, s), v, c.client_id);
    }
  }

  const resolver = (m: typeof geral, exigeClientes: boolean) => {
    const out = new Map<string, number>();
    for (const [k, { valores, clientes: cl }] of m) {
      if (valores.length < MIN_AMOSTRA) continue;
      if (exigeClientes && cl.size < MIN_AMOSTRA) continue;
      const med = mediana(valores);
      if (med !== null) out.set(k, med);
    }
    return out;
  };
  // No segmento exige clientes distintos: tres campanhas do mesmo cliente nao sao "o nicho".
  return { geral: resolver(geral, false), segmento: resolver(porSeg, true) };
}

export function referenciaPara(
  kpi: ChaveRef,
  grupo: GrupoObjetivo,
  cliente: ClienteEntrada | undefined,
  carteira: Carteira,
): Referencia {
  const meta =
    kpi === "custo_mensagem" ? cliente?.alvo_custo_mensagem
    : kpi === "cpc" ? cliente?.alvo_cpc
    : kpi === "custo_conversao" ? cliente?.alvo_custo_resultado
    : null;
  if (meta && Number(meta) > 0) return { valor: Number(meta), origem: "meta", rotulo: ROTULO_ORIGEM.meta, estimativa: false };

  const segmento = cliente?.business_segment ?? null;
  const doSeg = segmento ? carteira.segmento.get(chaveCarteira(grupo, kpi, segmento)) : undefined;
  if (doSeg) return { valor: doSeg, origem: "segmento_carteira", rotulo: ROTULO_ORIGEM.segmento_carteira, estimativa: true };

  const daCarteira = carteira.geral.get(chaveCarteira(grupo, kpi));
  if (daCarteira) return { valor: daCarteira, origem: "carteira", rotulo: ROTULO_ORIGEM.carteira, estimativa: true };

  const mercado = (segmento && REFERENCIA_MERCADO[segmento]) || REFERENCIA_GERAL;
  return { valor: mercado[kpi], origem: "mercado", rotulo: ROTULO_ORIGEM.mercado, estimativa: true };
}

// ── Saturacao de criativo ────────────────────────────────────────────────────

export interface DiaAnuncio {
  ad_id: string;
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  reach?: number | null;
  frequency?: number | null;
}

export interface SemanasDoAnuncio {
  impressoes: number;
  gasto: number;
  ctrAtual: number | null;
  ctrAnterior: number | null;
  /** Queda do CTR vs semana anterior, em % (positivo = caiu). */
  quedaCtrPct: number | null;
}

function somarDias(iso: string, dias: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d + dias));
  return data.toISOString().slice(0, 10);
}

/** Ultimos 7 dias (terminando em `hoje`, exclusive) contra os 7 anteriores. */
export function compararSemanas(dias: DiaAnuncio[], hoje: string): SemanasDoAnuncio {
  const iniAtual = somarDias(hoje, -7);
  const iniAnterior = somarDias(hoje, -14);
  const atual = { impr: 0, cliques: 0, gasto: 0 };
  const anterior = { impr: 0, cliques: 0 };
  for (const d of dias) {
    if (d.date >= iniAtual && d.date < hoje) {
      atual.impr += n(d.impressions);
      atual.cliques += n(d.clicks);
      atual.gasto += n(d.spend);
    } else if (d.date >= iniAnterior && d.date < iniAtual) {
      anterior.impr += n(d.impressions);
      anterior.cliques += n(d.clicks);
    }
  }
  const ctrAtual = atual.impr > 0 ? (atual.cliques / atual.impr) * 100 : null;
  const ctrAnterior = anterior.impr > 0 ? (anterior.cliques / anterior.impr) * 100 : null;
  return {
    impressoes: atual.impr,
    gasto: atual.gasto,
    ctrAtual,
    ctrAnterior,
    quedaCtrPct: ctrAtual !== null && ctrAnterior ? ((ctrAnterior - ctrAtual) / ctrAnterior) * 100 : null,
  };
}

export interface AnuncioEntrada {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  /** Frequencia do anuncio na janela do sync (30 dias). */
  frequency: number | null;
}

export const FREQUENCIA_SATURACAO = 3;
const QUEDA_CTR_SATURACAO = 20;
const IMPRESSOES_MINIMAS_SEMANA = 1000;

export function avaliarSaturacao(ad: AnuncioEntrada, semanas: SemanasDoAnuncio): "severa" | "moderada" | null {
  const freq = n(ad.frequency);
  if (freq < FREQUENCIA_SATURACAO || semanas.quedaCtrPct === null) return null;
  if (semanas.impressoes < IMPRESSOES_MINIMAS_SEMANA) return null;
  if (semanas.quedaCtrPct >= 35 && freq >= 4) return "severa";
  if (semanas.quedaCtrPct >= QUEDA_CTR_SATURACAO) return "moderada";
  return null;
}

// ── Achados ──────────────────────────────────────────────────────────────────

export type Severidade = "critico" | "atencao" | "oportunidade";

export const SEVERIDADES: { valor: Severidade; label: string }[] = [
  { valor: "critico", label: "Crítico" },
  { valor: "atencao", label: "Atenção" },
  { valor: "oportunidade", label: "Oportunidade" },
];

export type TipoAchado =
  | "gasto_sem_resultado" | "custo_alto" | "ctr_baixo" | "cpm_alto"
  | "frequencia_alta" | "criativo_saturado" | "escalar";

export interface Achado {
  id: string;
  tipo: TipoAchado;
  severidade: Severidade;
  clientId: string;
  campanhaId: string;
  anuncioId?: string;
  grupo: GrupoObjetivo;
  titulo: string;
  explicacao: string;
  acao: string;
  /** Parametro usado na comparacao; ausente quando a regra e absoluta. */
  referencia?: Referencia;
}

export interface EntradaAnalise {
  campanhas: CampanhaEntrada[];
  /** Base das medianas; quando a tela mostra um cliente so, ainda compara com a carteira toda. */
  carteira?: CampanhaEntrada[];
  clientes: ClienteEntrada[];
  anuncios?: AnuncioEntrada[];
  diasAnuncios?: DiaAnuncio[];
  /** yyyy-mm-dd; o dia corrente fica de fora da comparacao semanal. */
  hoje: string;
}

export interface AnaliseCampanha {
  campanha: CampanhaEntrada;
  grupo: GrupoObjetivo;
  achados: Achado[];
}

const moeda = (v: number) => formatarKpi(v, "moeda");
const pct = (v: number) => formatarKpi(v, "percentual");

function desvio(atual: number, ref: number) {
  return Math.round(((atual - ref) / ref) * 100);
}

/** Acima da meta combinada qualquer desvio conta; contra estimativa, so o que foge bem. */
function severidadeDoCusto(atual: number, ref: Referencia): Severidade | null {
  const d = (atual - ref.valor) / ref.valor;
  if (ref.origem === "meta") return d > 0.5 ? "critico" : d > 0.1 ? "atencao" : null;
  return d > 1 ? "critico" : d > 0.4 ? "atencao" : null;
}

const ACAO_CUSTO: Record<GrupoObjetivo, string> = {
  mensagens: "Corte os anúncios que gastam sem gerar conversa, suba criativos novos e confira se o botão abre direto o WhatsApp com a saudação ativa.",
  conversoes: "Revise o evento de conversão, a página ou o formulário e o público antes de colocar mais verba.",
  trafego: "Teste criativos com gancho mais forte e amplie o público ou o raio; pause anúncios com CPC muito acima do conjunto.",
  reconhecimento: "Amplie o público ou o raio e revise os posicionamentos: CPM alto em público pequeno encarece cada pessoa alcançada.",
  outros: "Revise criativo e público antes de manter a verba.",
};

export function analisarCampanhas(e: EntradaAnalise): { campanhas: AnaliseCampanha[]; achados: Achado[]; carteira: Carteira } {
  const carteira = montarCarteira(e.carteira ?? e.campanhas, e.clientes);
  const clientes = new Map(e.clientes.map(c => [c.id, c]));

  const diasPorAnuncio = new Map<string, DiaAnuncio[]>();
  for (const d of e.diasAnuncios ?? []) {
    const lista = diasPorAnuncio.get(d.ad_id) ?? [];
    lista.push(d);
    diasPorAnuncio.set(d.ad_id, lista);
  }
  const anunciosPorCampanha = new Map<string, AnuncioEntrada[]>();
  for (const a of e.anuncios ?? []) {
    const lista = anunciosPorCampanha.get(a.campaign_id) ?? [];
    lista.push(a);
    anunciosPorCampanha.set(a.campaign_id, lista);
  }

  const resultado: AnaliseCampanha[] = [];
  for (const c of e.campanhas) {
    const grupo = classificarObjetivo(c.objective, c.messages, c.conversions);
    const achados: Achado[] = [];
    const cliente = clientes.get(c.client_id);
    const base = { clientId: c.client_id, campanhaId: c.id, grupo };
    const push = (a: Omit<Achado, "id" | keyof typeof base>) =>
      achados.push({ ...base, ...a, id: `${c.id}:${a.tipo}${a.anuncioId ? `:${a.anuncioId}` : ""}` });

    const ativa = c.status === "ACTIVE";
    const gasto = n(c.spend);
    if (ativa && gasto >= GASTO_MINIMO) {
      if (grupo === "mensagens" || grupo === "conversoes") {
        const kpiCusto: ChaveRef = grupo === "mensagens" ? "custo_mensagem" : "custo_conversao";
        const ref = referenciaPara(kpiCusto, grupo, cliente, carteira);
        const volume = grupo === "mensagens" ? n(c.messages) : n(c.conversions);
        const custo = valorKpi(c, kpiCusto);
        const unidade = grupo === "mensagens" ? "mensagem" : "conversão";

        if (volume === 0) {
          if (gasto >= Math.max(ref.valor * 3, 100)) {
            push({
              tipo: "gasto_sem_resultado",
              severidade: "critico",
              titulo: grupo === "mensagens" ? "Gasto sem nenhuma conversa" : "Gasto sem nenhuma conversão",
              explicacao: `Investiu ${moeda(gasto)} nos últimos 30 dias sem registrar ${unidade}. Com o custo de referência (${moeda(ref.valor)}), já deveriam ter vindo umas ${Math.floor(gasto / ref.valor)}.`,
              acao: grupo === "mensagens"
                ? "Confira se o destino é mesmo o WhatsApp/Direct e se a conta está recebendo as conversas; se estiver tudo certo, pause e reestruture público e criativo."
                : "Confira se o pixel/evento está disparando; se estiver, pause e reestruture oferta e público.",
              referencia: ref,
            });
          }
        } else if (custo !== null) {
          const sev = severidadeDoCusto(custo, ref);
          if (sev) {
            push({
              tipo: "custo_alto",
              severidade: sev,
              titulo: `Custo por ${unidade} acima do esperado`,
              explicacao: `Cada ${unidade} custa ${moeda(custo)}, ${desvio(custo, ref.valor)}% acima da ${ref.rotulo} (${moeda(ref.valor)}).`,
              acao: ACAO_CUSTO[grupo],
              referencia: ref,
            });
          } else if (custo <= ref.valor * 0.6 && volume >= 10) {
            push({
              tipo: "escalar",
              severidade: "oportunidade",
              titulo: "Candidata a escalar",
              explicacao: `${moeda(custo)} por ${unidade}, ${Math.abs(desvio(custo, ref.valor))}% abaixo da ${ref.rotulo} (${moeda(ref.valor)}), com ${formatarKpi(volume, "numero")} resultados.`,
              acao: "Aumente a verba aos poucos (até 20% a cada 2–3 dias) e acompanhe se o custo se mantém.",
              referencia: ref,
            });
          }
        }
      }

      if (grupo === "trafego") {
        const ref = referenciaPara("cpc", grupo, cliente, carteira);
        const cpc = valorKpi(c, "cpc");
        const ctr = valorKpi(c, "ctr");
        if (n(c.clicks) === 0 && gasto >= 100) {
          push({
            tipo: "gasto_sem_resultado",
            severidade: "critico",
            titulo: "Gasto sem cliques",
            explicacao: `Investiu ${moeda(gasto)} e não gerou nenhum clique.`,
            acao: "Revise o criativo e o destino do anúncio; se o anúncio está reprovado ou limitado, corrija antes de manter a verba.",
          });
        } else if (cpc !== null) {
          const sev = severidadeDoCusto(cpc, ref);
          if (sev) {
            push({
              tipo: "custo_alto",
              severidade: sev,
              titulo: "Clique caro",
              explicacao: `CPC de ${moeda(cpc)}, ${desvio(cpc, ref.valor)}% acima da ${ref.rotulo} (${moeda(ref.valor)}).`,
              acao: ACAO_CUSTO.trafego,
              referencia: ref,
            });
          } else if (cpc <= ref.valor * 0.6 && ctr !== null && ctr >= 1.5) {
            push({
              tipo: "escalar",
              severidade: "oportunidade",
              titulo: "Tráfego barato e com bom interesse",
              explicacao: `CPC de ${moeda(cpc)} (${ref.rotulo}: ${moeda(ref.valor)}) e CTR de ${pct(ctr)}.`,
              acao: "Aumente a verba aos poucos e acompanhe as visitas ao perfil no mesmo período.",
              referencia: ref,
            });
          }
        }
        if (ctr !== null && n(c.impressions) >= 2000 && ctr < 0.8) {
          push({
            tipo: "ctr_baixo",
            severidade: "atencao",
            titulo: "CTR baixo",
            explicacao: `Só ${pct(ctr)} de quem vê o anúncio clica. Em tráfego, o clique é o resultado: criativo que não chama atenção encarece tudo.`,
            acao: "Teste outro gancho nos 3 primeiros segundos, outra imagem de capa e uma chamada mais direta.",
            referencia: { valor: 0.8, origem: "mercado", rotulo: "referência geral de CTR", estimativa: true },
          });
        }
      }

      if (grupo === "reconhecimento") {
        const ref = referenciaPara("cpm", grupo, cliente, carteira);
        const cpm = valorKpi(c, "cpm");
        const freq = valorKpi(c, "frequencia");
        if (cpm !== null) {
          const sev = severidadeDoCusto(cpm, ref);
          if (sev) {
            push({
              tipo: "cpm_alto",
              severidade: sev,
              titulo: "Alcance caro",
              explicacao: `CPM de ${moeda(cpm)}, ${desvio(cpm, ref.valor)}% acima da ${ref.rotulo} (${moeda(ref.valor)}).`,
              acao: ACAO_CUSTO.reconhecimento,
              referencia: ref,
            });
          } else if (cpm <= ref.valor * 0.6 && (freq === null || freq < 2)) {
            push({
              tipo: "escalar",
              severidade: "oportunidade",
              titulo: "Alcance barato com espaço para crescer",
              explicacao: `CPM de ${moeda(cpm)} (${ref.rotulo}: ${moeda(ref.valor)}) e frequência ainda baixa.`,
              acao: "Dá para colocar mais verba sem saturar o público: aumente aos poucos e acompanhe a frequência.",
              referencia: ref,
            });
          }
        }
        if (freq !== null && freq >= 4) {
          push({
            tipo: "frequencia_alta",
            severidade: freq >= 6 ? "critico" : "atencao",
            titulo: "Público saturado",
            explicacao: `Cada pessoa viu os anúncios ${formatarKpi(freq, "multiplo")} em média no período. Acima de 4x a lembrança para de crescer e o anúncio começa a irritar.`,
            acao: "Amplie o público ou o raio, troque os criativos ou reduza a verba.",
            referencia: { valor: 4, origem: "mercado", rotulo: "referência geral de frequência", estimativa: true },
          });
        }
      }

      if (grupo === "outros") {
        const ctr = valorKpi(c, "ctr");
        if (ctr !== null && n(c.impressions) >= 2000 && ctr < 0.5) {
          push({
            tipo: "ctr_baixo",
            severidade: "atencao",
            titulo: "Pouca interação",
            explicacao: `CTR de ${pct(ctr)}: o público quase não interage com o anúncio.`,
            acao: "Teste outro criativo e confira se o objetivo da campanha combina com o que o cliente precisa (mensagem, visita ou alcance).",
            referencia: { valor: 0.5, origem: "mercado", rotulo: "referência geral de CTR", estimativa: true },
          });
        }
      }
    }

    if (ativa) {
      for (const ad of anunciosPorCampanha.get(c.id) ?? []) {
        if (ad.status !== "ACTIVE") continue;
        const semanas = compararSemanas(diasPorAnuncio.get(ad.id) ?? [], e.hoje);
        const sat = avaliarSaturacao(ad, semanas);
        if (!sat) continue;
        push({
          tipo: "criativo_saturado",
          severidade: sat === "severa" ? "critico" : "atencao",
          anuncioId: ad.id,
          titulo: `Criativo saturado: ${ad.name}`,
          explicacao: `Frequência de ${formatarKpi(n(ad.frequency), "multiplo")} e CTR caiu ${Math.round(semanas.quedaCtrPct ?? 0)}% na última semana (${pct(semanas.ctrAnterior ?? 0)} → ${pct(semanas.ctrAtual ?? 0)}). O público já viu demais este anúncio.`,
          acao: "Suba uma variação nova (outro gancho, imagem ou vídeo) e pause este quando a nova engrenar.",
          referencia: { valor: FREQUENCIA_SATURACAO, origem: "mercado", rotulo: "frequência de referência", estimativa: true },
        });
      }
    }

    resultado.push({ campanha: c, grupo, achados });
  }

  const ordem: Record<Severidade, number> = { critico: 0, atencao: 1, oportunidade: 2 };
  const achados = resultado
    .flatMap(r => r.achados)
    .sort((a, b) => ordem[a.severidade] - ordem[b.severidade]);
  return { campanhas: resultado, achados, carteira };
}

/** Pior severidade da campanha; null quando nao ha achado. */
export function severidadeDaCampanha(achados: Achado[]): Severidade | null {
  if (achados.some(a => a.severidade === "critico")) return "critico";
  if (achados.some(a => a.severidade === "atencao")) return "atencao";
  if (achados.some(a => a.severidade === "oportunidade")) return "oportunidade";
  return null;
}

// ── Alcance e frequencia da campanha a partir dos anuncios ───────────────────

/**
 * A soma do alcance diario conta a mesma pessoa varias vezes, entao o alcance
 * aqui e aproximado: impressoes ÷ frequencia de cada anuncio (janela do sync).
 */
export function alcanceEstimado(anuncios: { impressions: number; frequency: number | null }[]) {
  let alcance = 0;
  let impr = 0;
  for (const a of anuncios) {
    const f = n(a.frequency);
    if (f <= 0 || n(a.impressions) <= 0) continue;
    alcance += n(a.impressions) / f;
    impr += n(a.impressions);
  }
  if (alcance <= 0) return { alcance: null, frequencia: null };
  return { alcance: Math.round(alcance), frequencia: impr / alcance };
}

// ── Resumo do cliente ────────────────────────────────────────────────────────

export interface DiaConta {
  client_id: string;
  date: string;
  spend: number;
  messages: number;
  profile_visits: number;
}

export interface FinanceiroMes {
  client_id: string;
  mes: string;
  faturamento: number | null;
  investimento_manual: number | null;
  custos_efetivos: number | null;
}

export interface ResumoCliente {
  clientId: string;
  investido: number;
  mensagens: number;
  custoMensagem: number | null;
  visitasPerfil: number;
  /** Gasto das campanhas de trafego ÷ visitas da conta: aproximado, a Meta so da visita por conta. */
  custoVisitaEstimado: number | null;
  financeiro: (ResultadoFinanceiro & { mes: string; faturamento: number }) | null;
}

/**
 * Junta o que a conta fez nos ultimos 30 dias com o ultimo mes em que o
 * financeiro tem faturamento informado. `pctPorCliente` e o custo
 * operacional configurado; sem ele vale o padrao.
 */
export function resumirCliente(
  clientId: string,
  campanhas: CampanhaEntrada[],
  dias: DiaConta[],
  financeiro: FinanceiroMes[],
  hoje: string,
  pctCustoOperacional = CUSTO_OPERACIONAL_PADRAO,
): ResumoCliente {
  const minhas = campanhas.filter(c => c.client_id === clientId);
  let investido = 0, mensagens = 0, gastoMsg = 0, gastoTrafego = 0;
  for (const c of minhas) {
    investido += n(c.spend);
    const g = classificarObjetivo(c.objective, c.messages, c.conversions);
    if (g === "mensagens") {
      gastoMsg += n(c.spend);
      mensagens += n(c.messages);
    }
    if (g === "trafego") gastoTrafego += n(c.spend);
  }

  const ini30 = somarDias(hoje, -30);
  const meusDias = dias.filter(d => d.client_id === clientId);
  const visitasPerfil = meusDias
    .filter(d => d.date >= ini30 && d.date < hoje)
    .reduce((s, d) => s + n(d.profile_visits), 0);

  const ultimo = financeiro
    .filter(f => f.client_id === clientId && f.faturamento !== null && f.faturamento !== undefined)
    .sort((a, b) => b.mes.localeCompare(a.mes))[0];

  let fin: ResumoCliente["financeiro"] = null;
  if (ultimo) {
    const investimentoMeta = meusDias
      .filter(d => d.date.slice(0, 7) === ultimo.mes.slice(0, 7))
      .reduce((s, d) => s + n(d.spend), 0);
    const r = calcularFinanceiro({
      faturamento: Number(ultimo.faturamento),
      investimentoManual: ultimo.investimento_manual === null ? null : Number(ultimo.investimento_manual),
      investimentoMeta,
      custosEfetivos: ultimo.custos_efetivos === null ? null : Number(ultimo.custos_efetivos),
      custoOperacionalPct: pctCustoOperacional,
    });
    fin = { ...r, mes: ultimo.mes, faturamento: Number(ultimo.faturamento) };
  }

  return {
    clientId,
    investido,
    mensagens,
    custoMensagem: mensagens > 0 ? gastoMsg / mensagens : null,
    visitasPerfil,
    custoVisitaEstimado: gastoTrafego > 0 && visitasPerfil > 0 ? gastoTrafego / visitasPerfil : null,
    financeiro: fin,
  };
}
