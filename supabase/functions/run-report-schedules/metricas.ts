// Catalogo unico das metricas de relatorio: rotulo, grupo, formato e como sai
// do resumo. Gerador, PDF, link publico e envio agendado leem daqui para a
// escolha do gestor valer igual em todo lugar.
//
// GEMEO: supabase/functions/run-report-schedules/metricas.ts e copia byte a
// byte deste arquivo (o teste report-twins.test.ts confere). Sem imports.

export type MetricaRelatorio =
  | "spend"
  | "reach"
  | "impressions"
  | "frequency"
  | "clicks"
  | "ctr"
  | "cpc"
  | "cpm"
  | "results"
  | "costPerResult"
  | "messagesStarted"
  | "costPerMessage"
  | "instagramProfileVisits"
  | "costPerProfileVisit"
  | "phoneCalls"
  | "directions"
  | "leads"
  | "costPerLead"
  | "purchases"
  | "purchaseValue"
  | "costPerPurchase"
  | "revenue"
  | "roas";

export interface ResumoMetricas {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  revenue: number;
  roas: number;
  reach?: number;
  frequency?: number;
  messagesStarted?: number;
  instagramProfileVisits?: number;
  phoneCalls?: number;
  directions?: number;
  leads?: number;
  purchases?: number;
  purchaseValue?: number;
  costPerPurchase?: number;
}

export type FormatoMetrica = "moeda" | "numero" | "pct" | "multiplo" | "decimal";

export type GrupoMetrica = "investimento" | "alcance" | "cliques" | "resultados" | "vendas";

export interface DefinicaoMetrica {
  key: MetricaRelatorio;
  label: string;
  ajuda: string;
  grupo: GrupoMetrica;
  formato: FormatoMetrica;
  /** Sai do que o sync grava (campaign_daily_metrics), sem consultar a Meta. */
  noBanco: boolean;
  valor: (r: ResumoMetricas) => number | null;
}

export const GRUPOS_DE_METRICAS: Array<{ key: GrupoMetrica; label: string }> = [
  { key: "investimento", label: "Investimento" },
  { key: "alcance", label: "Alcance e entrega" },
  { key: "cliques", label: "Cliques e custos" },
  { key: "resultados", label: "Resultados" },
  { key: "vendas", label: "Vendas e faturamento" },
];

function n(v: number | undefined | null): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function custo(spend: number, base: number): number | null {
  return base > 0 ? spend / base : null;
}

/** Resultado = mensagens + ligacoes + rotas + leads, como no resto do app. */
export function resultadosDoResumo(r: ResumoMetricas): number {
  return n(r.messagesStarted) + n(r.phoneCalls) + n(r.directions) + n(r.leads);
}

export const METRICAS: DefinicaoMetrica[] = [
  { key: "spend", label: "Valor investido", ajuda: "Total gasto no período", grupo: "investimento", formato: "moeda", noBanco: true, valor: (r) => n(r.spend) },
  { key: "reach", label: "Alcance", ajuda: "Pessoas únicas alcançadas", grupo: "alcance", formato: "numero", noBanco: false, valor: (r) => n(r.reach) },
  { key: "impressions", label: "Impressões", ajuda: "Entrega total da conta", grupo: "alcance", formato: "numero", noBanco: true, valor: (r) => n(r.impressions) },
  { key: "frequency", label: "Frequência", ajuda: "Exibições médias por pessoa", grupo: "alcance", formato: "decimal", noBanco: false, valor: (r) => n(r.frequency) },
  { key: "clicks", label: "Cliques no link", ajuda: "Cliques no link no período", grupo: "cliques", formato: "numero", noBanco: true, valor: (r) => n(r.clicks) },
  { key: "ctr", label: "CTR", ajuda: "Taxa de cliques no link", grupo: "cliques", formato: "pct", noBanco: true, valor: (r) => n(r.ctr) },
  { key: "cpc", label: "CPC", ajuda: "Custo médio por clique", grupo: "cliques", formato: "moeda", noBanco: true, valor: (r) => n(r.cpc) },
  { key: "cpm", label: "CPM", ajuda: "Custo por mil impressões", grupo: "cliques", formato: "moeda", noBanco: true, valor: (r) => n(r.cpm) },
  { key: "results", label: "Resultados", ajuda: "Mensagens + ligações + rotas + leads", grupo: "resultados", formato: "numero", noBanco: true, valor: (r) => resultadosDoResumo(r) },
  { key: "costPerResult", label: "Custo por resultado", ajuda: "Investimento dividido pelos resultados", grupo: "resultados", formato: "moeda", noBanco: true, valor: (r) => custo(n(r.spend), resultadosDoResumo(r)) },
  { key: "messagesStarted", label: "Mensagens iniciadas", ajuda: "Conversas abertas no período", grupo: "resultados", formato: "numero", noBanco: true, valor: (r) => n(r.messagesStarted) },
  { key: "costPerMessage", label: "Custo por mensagem", ajuda: "Investimento dividido pelas conversas", grupo: "resultados", formato: "moeda", noBanco: true, valor: (r) => custo(n(r.spend), n(r.messagesStarted)) },
  { key: "instagramProfileVisits", label: "Visitas ao perfil", ajuda: "Visitas ao perfil vindas dos anúncios", grupo: "resultados", formato: "numero", noBanco: true, valor: (r) => n(r.instagramProfileVisits) },
  { key: "costPerProfileVisit", label: "Custo por visita", ajuda: "Investimento dividido pelas visitas ao perfil", grupo: "resultados", formato: "moeda", noBanco: true, valor: (r) => custo(n(r.spend), n(r.instagramProfileVisits)) },
  { key: "phoneCalls", label: "Ligações", ajuda: "Cliques para ligar", grupo: "resultados", formato: "numero", noBanco: true, valor: (r) => n(r.phoneCalls) },
  { key: "directions", label: "Rotas / Como chegar", ajuda: "Cliques em rotas ou localização", grupo: "resultados", formato: "numero", noBanco: true, valor: (r) => n(r.directions) },
  { key: "leads", label: "Leads", ajuda: "Cadastros gerados", grupo: "resultados", formato: "numero", noBanco: true, valor: (r) => n(r.leads) },
  { key: "costPerLead", label: "Custo por lead", ajuda: "Investimento dividido pelos leads", grupo: "resultados", formato: "moeda", noBanco: true, valor: (r) => custo(n(r.spend), n(r.leads)) },
  { key: "purchases", label: "Compras", ajuda: "Quantidade de compras (pixel)", grupo: "vendas", formato: "numero", noBanco: false, valor: (r) => n(r.purchases) },
  { key: "purchaseValue", label: "Valor de compras", ajuda: "Valor das compras registradas", grupo: "vendas", formato: "moeda", noBanco: false, valor: (r) => n(r.purchaseValue) },
  { key: "costPerPurchase", label: "Custo por compra", ajuda: "Investimento médio por compra", grupo: "vendas", formato: "moeda", noBanco: false, valor: (r) => (n(r.purchases) > 0 ? n(r.costPerPurchase) || n(r.spend) / n(r.purchases) : null) },
  { key: "revenue", label: "Faturamento", ajuda: "Receita gerada no período", grupo: "vendas", formato: "moeda", noBanco: false, valor: (r) => n(r.revenue) },
  { key: "roas", label: "ROAS", ajuda: "Retorno por real investido", grupo: "vendas", formato: "multiplo", noBanco: false, valor: (r) => n(r.roas) },
];

const POR_CHAVE = new Map(METRICAS.map((m) => [m.key, m]));

export const METRICAS_PADRAO: MetricaRelatorio[] = ["spend", "impressions", "clicks", "roas", "ctr"];

export function definicaoDaMetrica(key: string): DefinicaoMetrica | undefined {
  return POR_CHAVE.get(key as MetricaRelatorio);
}

export function isMetricaRelatorio(key: unknown): key is MetricaRelatorio {
  return typeof key === "string" && POR_CHAVE.has(key as MetricaRelatorio);
}

/** Lista vinda do banco ou da tela: so chaves conhecidas, sem repetir, na ordem. */
export function normalizarMetricas(lista: unknown): MetricaRelatorio[] {
  if (!Array.isArray(lista)) return [];
  const vistas = new Set<MetricaRelatorio>();
  for (const item of lista) {
    if (isMetricaRelatorio(item)) vistas.add(item);
  }
  return [...vistas];
}

export function formatarValorMetrica(formato: FormatoMetrica, valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return "-";
  if (formato === "moeda") {
    return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (formato === "pct") return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  if (formato === "multiplo") return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
  if (formato === "decimal") return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Math.round(valor).toLocaleString("pt-BR");
}

export interface LinhaMetrica {
  key: MetricaRelatorio;
  label: string;
  ajuda: string;
  valor: string;
  bruto: number | null;
}

/** As metricas escolhidas, na ordem escolhida, ja formatadas. */
export function linhasDeMetricas(resumo: ResumoMetricas, preferencias?: readonly string[] | null): LinhaMetrica[] {
  const escolhidas = normalizarMetricas(preferencias ?? []);
  const lista = escolhidas.length ? escolhidas : METRICAS_PADRAO;
  return lista.map((key) => {
    const def = POR_CHAVE.get(key)!;
    const bruto = def.valor(resumo);
    return { key, label: def.label, ajuda: def.ajuda, valor: formatarValorMetrica(def.formato, bruto), bruto };
  });
}

// Vocabulario antigo do modelo do cliente (clients.report_template.metrics),
// usado pelo envio rapido da tela de Clientes. O modelo novo guarda as chaves
// deste catalogo em `report_metrics`; as duas listas convivem.
const DO_LEGADO: Record<string, MetricaRelatorio> = {
  spend: "spend",
  impressions: "impressions",
  clicks: "clicks",
  ctr: "ctr",
  cpc: "cpc",
  cpm: "cpm",
  cpa: "costPerPurchase",
  roas: "roas",
  conversions: "purchases",
  messages: "messagesStarted",
  calls: "phoneCalls",
  directions: "directions",
  leads: "leads",
  profileVisits: "instagramProfileVisits",
};

const PARA_O_LEGADO: Partial<Record<MetricaRelatorio, string>> = Object.fromEntries(
  Object.entries(DO_LEGADO).map(([legado, novo]) => [novo, legado])
);

/** Metricas do modelo do cliente, ou null quando ele nao define nenhuma. */
export function metricasDoModelo(modelo: unknown): MetricaRelatorio[] | null {
  if (!modelo || typeof modelo !== "object") return null;
  const m = modelo as { report_metrics?: unknown; metrics?: unknown };
  const novas = normalizarMetricas(m.report_metrics);
  if (novas.length) return novas;
  if (Array.isArray(m.metrics)) {
    const convertidas = normalizarMetricas(m.metrics.map((k) => (typeof k === "string" ? DO_LEGADO[k] : undefined)));
    if (convertidas.length) return convertidas;
  }
  return null;
}

/** A mesma escolha no vocabulario antigo, para o envio rapido continuar coerente. */
export function metricasParaOLegado(lista: readonly MetricaRelatorio[]): string[] {
  return lista.map((k) => PARA_O_LEGADO[k]).filter((k): k is string => Boolean(k));
}
