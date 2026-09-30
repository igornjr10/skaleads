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
  assigned_to: string | null;
  created_by: string | null;
  company_id: string | null;
  concluida_at: string | null;
  created_at: string;
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
