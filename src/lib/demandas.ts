import { addDays, eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import type { Json } from "@/integrations/supabase/types";

export interface ItemChecklist {
  id: string;
  texto: string;
  feito: boolean;
}

export interface Demanda {
  id: string;
  titulo: string;
  descricao: string | null;
  client_id: string | null;
  status: string;
  prioridade: string;
  categoria: string;
  checklist: ItemChecklist[];
  prazo: string | null;
  /** Horario de entrega no dia do prazo (HH:MM:SS); sem ele vale o dia todo. */
  prazo_hora?: string | null;
  /** Entrega travada esperando material do cliente. */
  aguardando_cliente?: boolean;
  assigned_to: string | null;
  created_by: string | null;
  company_id: string | null;
  concluida_at: string | null;
  created_at: string;
  updated_at?: string;
  /** Demanda de etapa do Onboarding: o checklist e o do Onboarding e anda junto. */
  onboarding_fase?: string | null;
  /** Modelo recorrente: concluir abre a proxima (o banco cria). */
  recorrencia?: string | null;
  recorrencia_origem?: string | null;
  /** Programada: so chega para quem executa nesta data (yyyy-MM-dd). */
  inicia_em?: string | null;
  /** Quando chegou para quem executa; nulo = programada que ainda nao chegou. */
  liberada_em?: string | null;
  /** O responsavel saiu da distribuicao automatica, nao de quem pediu. */
  distribuida_auto?: boolean;
}

/** Cliente de demanda com varios clientes, com o "feito" de cada um. */
export interface ClienteDaDemanda {
  client_id: string;
  feito: boolean;
}

/**
 * O que vive fora da linha de `tasks`: clientes (quando sao varios) e os
 * corresponsaveis. `disponivel` e falso enquanto a migration nao rodou — a
 * tela esconde o que depende dessas tabelas em vez de quebrar.
 */
export interface VinculosDemandas {
  disponivel: boolean;
  clientes: Map<string, ClienteDaDemanda[]>;
  corresponsaveis: Map<string, string[]>;
}

export const SEM_VINCULOS: VinculosDemandas = { disponivel: false, clientes: new Map(), corresponsaveis: new Map() };

/** Todos os clientes da demanda: a lista de varios ou o unico de `client_id`. */
export function idsDosClientes(d: Pick<Demanda, "id" | "client_id">, v: VinculosDemandas): string[] {
  const varios = v.clientes.get(d.id);
  if (varios?.length) return varios.map(c => c.client_id);
  return d.client_id ? [d.client_id] : [];
}

export function corresponsaveisDe(d: Pick<Demanda, "id">, v: VinculosDemandas): string[] {
  return v.corresponsaveis.get(d.id) ?? [];
}

/** Principal ou corresponsavel: a demanda esta com a pessoa. */
export function estaCom(d: Pick<Demanda, "id" | "assigned_to">, uid: string | undefined, v: VinculosDemandas): boolean {
  if (!uid) return false;
  return d.assigned_to === uid || corresponsaveisDe(d, v).includes(uid);
}

/** Progresso por cliente; total 0 quando a demanda tem um cliente so (ou nenhum). */
export function progressoClientes(d: Pick<Demanda, "id">, v: VinculosDemandas) {
  const lista = v.clientes.get(d.id) ?? [];
  return { feitos: lista.filter(c => c.feito).length, total: lista.length };
}

export const RECORRENCIAS = [
  { id: "diaria", label: "Todo dia" },
  { id: "dias_uteis", label: "Dias úteis (seg a sex)" },
  { id: "semanal", label: "Toda semana" },
  { id: "quinzenal", label: "A cada 15 dias" },
  { id: "mensal", label: "Todo mês" },
] as const;

export function recorrenciaLabel(id: string | null | undefined) {
  return RECORRENCIAS.find(r => r.id === id)?.label ?? null;
}

/** Linha de `tasks` vinda do banco: checklist chega como Json e pode ser qualquer coisa. */
export function paraDemanda(linha: unknown): Demanda {
  const d = linha as Omit<Demanda, "checklist"> & { checklist: unknown };
  return { ...d, checklist: Array.isArray(d.checklist) ? (d.checklist as ItemChecklist[]) : [] };
}

/** Mudanca pronta para `tasks.update()`. */
export function paraBanco(mudanca: Partial<Demanda>) {
  const { checklist, ...resto } = mudanca;
  return checklist === undefined ? resto : { ...resto, checklist: checklist as unknown as Json };
}

export const STATUS_DEMANDA = [
  { id: "a_fazer", label: "A fazer", cor: "bg-slate-500/12 text-slate-300 ring-slate-500/20" },
  { id: "fazendo", label: "Em andamento", cor: "bg-blue-500/12 text-blue-300 ring-blue-500/20" },
  { id: "revisao", label: "Em revisão", cor: "bg-amber-500/12 text-amber-300 ring-amber-500/20" },
  { id: "aprovado", label: "Aprovado", cor: "bg-violet-500/12 text-violet-300 ring-violet-500/20" },
  { id: "concluida", label: "Concluído", cor: "bg-emerald-500/12 text-emerald-300 ring-emerald-500/20" },
] as const;

export const PRIORIDADES = [
  { id: "baixa", label: "Baixa", cor: "text-slate-400 border-slate-500/30" },
  { id: "media", label: "Média", cor: "text-sky-400 border-sky-500/30" },
  { id: "alta", label: "Alta", cor: "text-amber-400 border-amber-500/30" },
  { id: "urgente", label: "Urgente", cor: "text-red-400 border-red-500/30" },
] as const;

export const CATEGORIAS = [
  { id: "trafego", label: "Tráfego" },
  { id: "criativo", label: "Arte / criativo" },
  { id: "video", label: "Vídeo" },
  { id: "copy", label: "Copy" },
  { id: "relatorio", label: "Relatório" },
  { id: "reuniao", label: "Reunião" },
  { id: "atendimento", label: "Atendimento" },
  { id: "outro", label: "Outro" },
] as const;

export function statusMeta(id: string) {
  return STATUS_DEMANDA.find(s => s.id === id) ?? STATUS_DEMANDA[0];
}

export function prioridadeMeta(id: string) {
  return PRIORIDADES.find(p => p.id === id) ?? PRIORIDADES[1];
}

export function categoriaLabel(id: string) {
  return CATEGORIAS.find(c => c.id === id)?.label ?? "Outro";
}

export function hojeISO(agora = new Date()) {
  return format(agora, "yyyy-MM-dd");
}

/** Aberta = ainda nao concluida. Aprovado conta como aberta: falta entregar/publicar. */
export function estaAberta(d: Pick<Demanda, "status">) {
  return d.status !== "concluida";
}

export function estaAtrasada(d: Pick<Demanda, "status" | "prazo">, hoje = hojeISO()) {
  return estaAberta(d) && !!d.prazo && d.prazo < hoje;
}

/** Programada que ainda nao chegou para quem executa. */
export function estaProgramada(d: Pick<Demanda, "status" | "inicia_em">, hoje = hojeISO()) {
  return estaAberta(d) && !!d.inicia_em && d.inicia_em > hoje;
}

/** Atalhos do "comeca em": hoje, amanha, daqui a 2 dias, proxima segunda. */
export function atalhosDeInicio(agora = new Date()) {
  const segunda = addDays(startOfWeek(agora, { weekStartsOn: 1 }), 7);
  return [
    { id: "agora", label: "Agora", data: null as string | null },
    { id: "amanha", label: "Amanhã", data: hojeISO(addDays(agora, 1)) },
    { id: "2dias", label: "Daqui a 2 dias", data: hojeISO(addDays(agora, 2)) },
    { id: "segunda", label: "Próxima segunda", data: hojeISO(segunda) },
  ];
}

/** "chega em 16/10". */
export function rotuloInicio(inicia: string | null | undefined) {
  if (!inicia) return null;
  const [, m, dia] = inicia.split("-");
  return `chega em ${dia}/${m}`;
}

export interface CargaDaPessoa {
  id: string | null;
  abertas: Demanda[];
  atrasadas: number;
  hoje: number;
  revisao: number;
  programadas: number;
}

/**
 * Carga de cada pessoa para a lideranca: principal ou corresponsavel conta.
 * Programadas ficam fora de `abertas` (ainda nao chegaram) e somam a parte.
 * A chave null junta as abertas sem ninguem.
 */
export function cargaPorPessoa(lista: Demanda[], v: VinculosDemandas, hoje = hojeISO()): CargaDaPessoa[] {
  const mapa = new Map<string | null, CargaDaPessoa>();
  const de = (id: string | null) => {
    let c = mapa.get(id);
    if (!c) {
      c = { id, abertas: [], atrasadas: 0, hoje: 0, revisao: 0, programadas: 0 };
      mapa.set(id, c);
    }
    return c;
  };
  for (const d of lista) {
    if (!estaAberta(d)) continue;
    const equipe = [d.assigned_to, ...corresponsaveisDe(d, v)].filter((x): x is string => !!x);
    for (const id of equipe.length ? equipe : [null]) {
      const c = de(id);
      if (estaProgramada(d, hoje)) {
        c.programadas += 1;
        continue;
      }
      c.abertas.push(d);
      if (estaAtrasada(d, hoje)) c.atrasadas += 1;
      if (d.prazo === hoje) c.hoje += 1;
      if (d.status === "revisao") c.revisao += 1;
    }
  }
  for (const c of mapa.values()) c.abertas = ordenarPorPrazo(c.abertas);
  // Quem tem atrasada primeiro, depois quem esta mais carregado.
  return [...mapa.values()].sort((a, b) => b.atrasadas - a.atrasadas || b.abertas.length - a.abertas.length);
}

/** "12/10" ou "12/10 · 14:30". */
export function rotuloPrazo(d: Pick<Demanda, "prazo" | "prazo_hora">) {
  if (!d.prazo) return "Sem prazo";
  const [, m, dia] = d.prazo.split("-");
  return `${dia}/${m}${d.prazo_hora ? ` · ${d.prazo_hora.slice(0, 5)}` : ""}`;
}

export function progressoChecklist(checklist: ItemChecklist[] | null | undefined) {
  const itens = Array.isArray(checklist) ? checklist : [];
  return { feitos: itens.filter(i => i.feito).length, total: itens.length };
}

/** Ordem de trabalho: atrasadas e com prazo mais cedo primeiro; sem prazo por ultimo; urgencia desempata. */
export function ordenarPorPrazo<T extends Pick<Demanda, "prazo" | "prioridade">>(lista: T[]): T[] {
  // PRIORIDADES vai de baixa a urgente: o indice ja e o peso.
  const peso = (p: string) => PRIORIDADES.findIndex(x => x.id === p);
  return [...lista].sort((a, b) => {
    if (a.prazo !== b.prazo) {
      if (!a.prazo) return 1;
      if (!b.prazo) return -1;
      return a.prazo < b.prazo ? -1 : 1;
    }
    return peso(b.prioridade) - peso(a.prioridade);
  });
}

/** Demandas abertas por responsavel; a chave null junta as sem responsavel. */
export function agruparPorResponsavel<T extends Demanda>(lista: T[]): Map<string | null, T[]> {
  const grupos = new Map<string | null, T[]>();
  for (const d of lista) {
    const chave = d.assigned_to ?? null;
    grupos.set(chave, [...(grupos.get(chave) ?? []), d]);
  }
  for (const [chave, itens] of grupos) grupos.set(chave, ordenarPorPrazo(itens));
  return grupos;
}

/** Semanas cheias (segunda a domingo) que cobrem o mes de `ref`. */
export function diasDoMes(ref: Date): Date[] {
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(ref), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(ref), { weekStartsOn: 1 }),
  });
}

export function diasDaSemana(ref: Date): Date[] {
  const inicio = startOfWeek(ref, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(inicio, i));
}

export function novoItemChecklist(texto: string): ItemChecklist {
  return { id: crypto.randomUUID(), texto: texto.trim(), feito: false };
}
