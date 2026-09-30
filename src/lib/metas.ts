// Tem gemea em supabase/functions/_shared/metas.ts (o Cerebro usa a mesma
// regra): Deno nao importa de src/, entao as duas precisam andar juntas.

export interface MetricaDiaria {
  date: string;
  spend: number;
  messages?: number | null;
  calls?: number | null;
  directions?: number | null;
  leads?: number | null;
}

export interface Alvos {
  alvo_resultados_mes: number | null;
  alvo_custo_resultado: number | null;
}

export type SituacaoMeta = "sem_meta" | "cedo" | "no_ritmo" | "abaixo";

export interface AvaliacaoMeta {
  situacao: SituacaoMeta;
  resultados: number;
  gasto: number;
  custoPorResultado: number | null;
  /** Resultados no fim do mes se o ritmo de hoje se mantiver. */
  projecao: number;
  alvoResultados: number | null;
  alvoCusto: number | null;
  resultadosAbaixo: boolean;
  custoAcima: boolean;
  diaDoMes: number;
  diasNoMes: number;
}

// Nos primeiros dias um dia fraco derruba a projecao inteira; antes disso a
// meta aparece, mas nao acusa.
export const DIAS_MINIMOS = 5;
// Folga para nao acusar quem esta a um lead da meta.
export const TOLERANCIA = 0.1;

export function resultadosDoDia(r: MetricaDiaria) {
  return (Number(r.messages) || 0) + (Number(r.calls) || 0) + (Number(r.directions) || 0) + (Number(r.leads) || 0);
}

export function temMeta(a: Alvos) {
  return !!a.alvo_resultados_mes || !!a.alvo_custo_resultado;
}

export function avaliarMeta(alvos: Alvos, dias: MetricaDiaria[], hoje: string): AvaliacaoMeta {
  const mes = hoje.slice(0, 7);
  const [ano, m, dia] = hoje.split("-").map(Number);
  const diasNoMes = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const doMes = dias.filter(d => d.date.slice(0, 7) === mes && d.date <= hoje);

  const gasto = doMes.reduce((s, d) => s + (Number(d.spend) || 0), 0);
  const resultados = doMes.reduce((s, d) => s + resultadosDoDia(d), 0);
  const custoPorResultado = resultados > 0 ? gasto / resultados : null;
  const projecao = Math.round((resultados / dia) * diasNoMes);

  const alvoResultados = alvos.alvo_resultados_mes || null;
  const alvoCusto = alvos.alvo_custo_resultado ? Number(alvos.alvo_custo_resultado) : null;
  const julga = dia >= DIAS_MINIMOS;

  const resultadosAbaixo = julga && alvoResultados !== null && projecao < alvoResultados * (1 - TOLERANCIA);
  // Sem nenhum resultado o custo e infinito; so acusa depois de gastar o
  // equivalente a tres resultados, senao conta recem-ligada ja nasce vermelha.
  const custoAcima = julga && alvoCusto !== null && (
    custoPorResultado !== null
      ? custoPorResultado > alvoCusto * (1 + TOLERANCIA)
      : gasto > alvoCusto * 3
  );

  const situacao: SituacaoMeta = !temMeta(alvos) ? "sem_meta"
    : !julga ? "cedo"
    : resultadosAbaixo || custoAcima ? "abaixo"
    : "no_ritmo";

  return {
    situacao, resultados, gasto, custoPorResultado, projecao, alvoResultados, alvoCusto,
    resultadosAbaixo, custoAcima, diaDoMes: dia, diasNoMes,
  };
}
