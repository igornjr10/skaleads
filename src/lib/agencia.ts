import { LOW_BALANCE } from "./client-budget";
import { estaAberta, estaAtrasada } from "./demandas";
import { avaliarMeta, temMeta } from "./metas";

export interface ClienteAgencia {
  id: string;
  name: string;
  status: string;
  meta_sync_status: string | null;
  meta_ad_account_id: string | null;
  meta_balance_cents: number | null;
  alvo_resultados_mes?: number | null;
  alvo_custo_resultado?: number | null;
}

export interface FaturaAgencia {
  client_id: string;
  due_date: string;
  amount: number;
  status: string;
  paid_at: string | null;
  paid_amount: number | null;
}

export interface GastoDiario {
  client_id: string;
  date: string;
  spend: number;
  messages?: number | null;
  calls?: number | null;
  directions?: number | null;
  leads?: number | null;
}

export interface DemandaAgencia {
  status: string;
  prazo: string | null;
  assigned_to: string | null;
  categoria?: string | null;
}

export interface EntradaVisao {
  hoje: string;
  clientes: ClienteAgencia[];
  faturas: FaturaAgencia[];
  gastos: GastoDiario[];
  demandas: DemandaAgencia[];
  /** client_id de relatorios gerados nos ultimos 7 dias. */
  relatoriosRecentes: string[];
  alertasAbertos: number;
}

export type MotivoAtencao = "fatura_vencida" | "saldo_baixo" | "meta_desconectada" | "sem_relatorio" | "abaixo_da_meta" | "custo_acima";

export interface ClienteEmAtencao {
  id: string;
  name: string;
  motivos: MotivoAtencao[];
}

export const MOTIVO_LABEL: Record<MotivoAtencao, string> = {
  fatura_vencida: "Fatura vencida",
  saldo_baixo: "Saldo Meta baixo",
  meta_desconectada: "Meta com problema",
  sem_relatorio: "Sem relatório há 7 dias",
  abaixo_da_meta: "Abaixo da meta",
  custo_acima: "Custo acima da meta",
};

const META_COM_PROBLEMA = ["error", "expired", "warning"];

/** Aberta com vencimento passado conta como vencida mesmo antes do cron virar o status. */
export function faturaVencida(f: FaturaAgencia, hoje: string) {
  return f.status === "vencida" || (f.status === "aberta" && f.due_date < hoje);
}

function mesmoMes(data: string, hoje: string) {
  return data.slice(0, 7) === hoje.slice(0, 7);
}

/** Mesmo intervalo de dias do mes anterior: dia 1 ate o dia de hoje (limitado ao fim do mes). */
function periodoMesAnterior(hoje: string): [string, string] {
  const [ano, mes, dia] = hoje.split("-").map(Number);
  const anterior = new Date(Date.UTC(ano, mes - 2, 1));
  const ultimoDia = new Date(Date.UTC(ano, mes - 1, 0)).getUTCDate();
  const prefixo = anterior.toISOString().slice(0, 7);
  return [`${prefixo}-01`, `${prefixo}-${String(Math.min(dia, ultimoDia)).padStart(2, "0")}`];
}

export function montarVisaoAgencia(e: EntradaVisao) {
  const ativos = e.clientes.filter(c => c.status === "active");
  const idsAtivos = new Set(ativos.map(c => c.id));

  const gastoMes = e.gastos.filter(g => mesmoMes(g.date, e.hoje) && g.date <= e.hoje).reduce((s, g) => s + Number(g.spend || 0), 0);
  const [iniAnt, fimAnt] = periodoMesAnterior(e.hoje);
  const gastoMesAnterior = e.gastos.filter(g => g.date >= iniAnt && g.date <= fimAnt).reduce((s, g) => s + Number(g.spend || 0), 0);
  const variacaoGasto = gastoMesAnterior > 0 ? (gastoMes - gastoMesAnterior) / gastoMesAnterior : null;

  const vencidas = e.faturas.filter(f => faturaVencida(f, e.hoje));
  const aReceber = e.faturas.filter(f => f.status === "aberta" && f.due_date >= e.hoje && mesmoMes(f.due_date, e.hoje));
  const recebidas = e.faturas.filter(f => f.status === "paga" && f.paid_at && mesmoMes(f.paid_at.slice(0, 10), e.hoje));

  const abertas = e.demandas.filter(estaAberta);
  const carga = new Map<string | null, { abertas: number; atrasadas: number }>();
  for (const d of abertas) {
    const atual = carga.get(d.assigned_to) ?? { abertas: 0, atrasadas: 0 };
    atual.abertas += 1;
    if (estaAtrasada(d, e.hoje)) atual.atrasadas += 1;
    carga.set(d.assigned_to, atual);
  }

  const gastosPorCliente = new Map<string, GastoDiario[]>();
  for (const g of e.gastos) {
    const lista = gastosPorCliente.get(g.client_id) ?? [];
    lista.push(g);
    gastosPorCliente.set(g.client_id, lista);
  }
  const comMeta = ativos.filter(c => temMeta({ alvo_resultados_mes: c.alvo_resultados_mes ?? null, alvo_custo_resultado: c.alvo_custo_resultado ?? null }));
  const avaliacoes = new Map(comMeta.map(c => [c.id, avaliarMeta(
    { alvo_resultados_mes: c.alvo_resultados_mes ?? null, alvo_custo_resultado: c.alvo_custo_resultado ?? null },
    gastosPorCliente.get(c.id) ?? [],
    e.hoje,
  )]));

  const comRelatorio = new Set(e.relatoriosRecentes);
  const clientesComVencida = new Set(vencidas.map(f => f.client_id));
  const atencao: ClienteEmAtencao[] = [];
  for (const c of e.clientes) {
    // Cliente inativo ainda pode dever: a fatura vencida entra, o resto nao.
    const motivos: MotivoAtencao[] = [];
    if (clientesComVencida.has(c.id)) motivos.push("fatura_vencida");
    if (idsAtivos.has(c.id)) {
      if (c.meta_balance_cents !== null && c.meta_balance_cents < LOW_BALANCE * 100) motivos.push("saldo_baixo");
      if (c.meta_ad_account_id && c.meta_sync_status && META_COM_PROBLEMA.includes(c.meta_sync_status)) motivos.push("meta_desconectada");
      if (c.meta_ad_account_id && !comRelatorio.has(c.id)) motivos.push("sem_relatorio");
      const meta = avaliacoes.get(c.id);
      if (meta?.resultadosAbaixo) motivos.push("abaixo_da_meta");
      if (meta?.custoAcima) motivos.push("custo_acima");
    }
    if (motivos.length) atencao.push({ id: c.id, name: c.name, motivos });
  }
  atencao.sort((a, b) => b.motivos.length - a.motivos.length || a.name.localeCompare(b.name));

  const soma = (lista: FaturaAgencia[], campo: (f: FaturaAgencia) => number) => lista.reduce((s, f) => s + campo(f), 0);

  return {
    clientes: {
      ativos: ativos.length,
      total: e.clientes.filter(c => c.status !== "archived").length,
      metaComProblema: ativos.filter(c => c.meta_ad_account_id && c.meta_sync_status && META_COM_PROBLEMA.includes(c.meta_sync_status)).length,
    },
    investimento: { mes: gastoMes, mesAnterior: gastoMesAnterior, variacao: variacaoGasto },
    financeiro: {
      vencido: soma(vencidas, f => Number(f.amount)),
      vencidas: vencidas.length,
      clientesInadimplentes: clientesComVencida.size,
      aReceber: soma(aReceber, f => Number(f.amount)),
      recebido: soma(recebidas, f => Number(f.paid_amount ?? f.amount)),
    },
    demandas: {
      abertas: abertas.length,
      atrasadas: abertas.filter(d => estaAtrasada(d, e.hoje)).length,
      emRevisao: abertas.filter(d => d.status === "revisao").length,
      hoje: abertas.filter(d => d.prazo === e.hoje).length,
      // Reuniao feita continua sendo a reuniao do dia: conta tambem as concluidas.
      reunioesHoje: e.demandas.filter(d => d.categoria === "reuniao" && d.prazo === e.hoje).length,
      reunioesHojeFeitas: e.demandas.filter(d => d.categoria === "reuniao" && d.prazo === e.hoje && !estaAberta(d)).length,
      carga: [...carga.entries()]
        .map(([pessoa, n]) => ({ pessoa, ...n }))
        .sort((a, b) => b.atrasadas - a.atrasadas || b.abertas - a.abertas),
    },
    metas: {
      comMeta: comMeta.length,
      abaixo: [...avaliacoes.values()].filter(a => a.situacao === "abaixo").length,
    },
    alertasAbertos: e.alertasAbertos,
    atencao,
  };
}

export type VisaoAgencia = ReturnType<typeof montarVisaoAgencia>;
