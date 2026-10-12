// Contas do controle financeiro por cliente. Tudo aqui e estimativa a partir
// do que o cliente informa: o sistema nao tem acesso ao caixa dele.

export const CUSTO_OPERACIONAL_PADRAO = 30;

export interface EntradaFinanceira {
  /** Faturamento que o cliente atribui aos anuncios no mes. */
  faturamento: number | null;
  /** Investimento informado a mao; null usa o da Meta. */
  investimentoManual: number | null;
  /** Investimento que a Meta registrou no mes. */
  investimentoMeta: number;
  /** Custo efetivo informado; null usa o percentual. */
  custosEfetivos: number | null;
  /** % do faturamento que vira custo operacional (produto, equipe, impostos...). */
  custoOperacionalPct: number;
}

export interface ResultadoFinanceiro {
  investimento: number;
  investimentoFonte: "manual" | "meta";
  custosOperacionais: number;
  custosFonte: "efetivo" | "estimado";
  custoTotal: number;
  lucro: number | null;
  /** Faturamento / investimento em anuncios. */
  roas: number | null;
  /** Lucro / custo total considerado, em %. */
  roi: number | null;
  /** Lucro / faturamento, em %. */
  margem: number | null;
  /** Ha algo estimado na conta (custo por % ou faturamento ausente). */
  estimado: boolean;
}

export function calcularFinanceiro(e: EntradaFinanceira): ResultadoFinanceiro {
  const investimento = e.investimentoManual ?? e.investimentoMeta;
  const investimentoFonte = e.investimentoManual !== null ? "manual" : "meta";
  const faturamento = e.faturamento;
  const custosFonte = e.custosEfetivos !== null ? "efetivo" : "estimado";
  const custosOperacionais = e.custosEfetivos ?? ((faturamento ?? 0) * e.custoOperacionalPct) / 100;
  const custoTotal = investimento + custosOperacionais;

  if (faturamento === null) {
    return {
      investimento, investimentoFonte, custosOperacionais, custosFonte, custoTotal,
      lucro: null, roas: null, roi: null, margem: null, estimado: true,
    };
  }

  const lucro = faturamento - custoTotal;
  return {
    investimento,
    investimentoFonte,
    custosOperacionais,
    custosFonte,
    custoTotal,
    lucro,
    roas: investimento > 0 ? faturamento / investimento : null,
    roi: custoTotal > 0 ? (lucro / custoTotal) * 100 : null,
    margem: faturamento > 0 ? (lucro / faturamento) * 100 : null,
    estimado: custosFonte === "estimado",
  };
}

/**
 * Referencia de custo operacional por segmento, em % do faturamento. Sao
 * faixas de mercado para comecar a conversa com o cliente, nao dado real de
 * ninguem — a tela sempre mostra como sugestao.
 */
export const REFERENCIAS_POR_SEGMENTO: { chaves: string[]; label: string; pct: number }[] = [
  { chaves: ["restaurante", "lanchonete", "hamburg", "pizz", "aliment", "delivery", "bar"], label: "Alimentação", pct: 65 },
  { chaves: ["clinica", "clínica", "odonto", "dentist", "estetic", "estétic", "saude", "saúde", "medic", "médic"], label: "Saúde e estética", pct: 45 },
  { chaves: ["academia", "fitness", "crossfit", "pilates"], label: "Academia e fitness", pct: 50 },
  { chaves: ["imobili", "imóve", "imove", "corretor"], label: "Imobiliário", pct: 40 },
  { chaves: ["veicul", "veícul", "carro", "moto", "concession", "autope"], label: "Veículos", pct: 80 },
  { chaves: ["loja", "varejo", "moda", "roupa", "calçad", "calcad", "ecommerce", "e-commerce"], label: "Varejo", pct: 60 },
  { chaves: ["educa", "curso", "escola", "faculdade", "idioma"], label: "Educação", pct: 40 },
  { chaves: ["advoca", "contab", "consult", "servic", "serviç"], label: "Serviços profissionais", pct: 35 },
  { chaves: ["beleza", "salao", "salão", "barbear", "manicure"], label: "Beleza", pct: 50 },
];

export function referenciaDoSegmento(segmento: string | null | undefined) {
  const s = (segmento ?? "").toLowerCase();
  if (!s) return null;
  return REFERENCIAS_POR_SEGMENTO.find(r => r.chaves.some(c => s.includes(c))) ?? null;
}

/** Primeiro dia do mes em yyyy-mm-dd. */
export function inicioDoMes(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}
