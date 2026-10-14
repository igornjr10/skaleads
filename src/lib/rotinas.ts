export type Periodicidade = "pontual" | "diaria" | "semanal" | "mensal";

export interface RegraRotina {
  periodicidade: string;
  /** Dias da semana marcados (0=domingo), so em rotina semanal. */
  dias_semana: number[] | null;
  dia_mes: number | null;
  /** Data (yyyy-MM-dd) da demanda pontual, que acontece uma vez so. */
  data_pontual?: string | null;
}

export type Prioridade = "urgente" | "moderada" | "leve";

export const PRIORIDADES: { id: Prioridade; label: string; ponto: string; borda: string; badge: string }[] = [
  { id: "urgente", label: "Urgente", ponto: "bg-rose-500", borda: "border-l-rose-500", badge: "border-rose-500/40 bg-rose-500/10 text-rose-400" },
  { id: "moderada", label: "Moderada", ponto: "bg-amber-400", borda: "border-l-amber-400", badge: "border-amber-400/40 bg-amber-400/10 text-amber-400" },
  { id: "leve", label: "Leve", ponto: "bg-sky-400", borda: "border-l-sky-400", badge: "border-sky-400/40 bg-sky-400/10 text-sky-400" },
];

export function prioridadeDe(id: string | null | undefined) {
  return PRIORIDADES.find((p) => p.id === id) ?? PRIORIDADES[1];
}

export type StatusOcorrencia = "pendente" | "andamento" | "concluida";

export const STATUS_OCORRENCIA: { id: StatusOcorrencia; label: string; classe: string }[] = [
  { id: "pendente", label: "Pendente", classe: "border-border/60 text-muted-foreground" },
  { id: "andamento", label: "Em andamento", classe: "border-blue-500/40 bg-blue-500/10 text-blue-400" },
  { id: "concluida", label: "Concluída", classe: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
];

export const DIAS_SEMANA = [
  { id: 0, curto: "Dom", label: "Domingo" },
  { id: 1, curto: "Seg", label: "Segunda" },
  { id: 2, curto: "Ter", label: "Terça" },
  { id: 3, curto: "Qua", label: "Quarta" },
  { id: 4, curto: "Qui", label: "Quinta" },
  { id: 5, curto: "Sex", label: "Sexta" },
  { id: 6, curto: "Sáb", label: "Sábado" },
] as const;

export function diasNoMes(ano: number, mes: number) {
  return new Date(ano, mes + 1, 0).getDate();
}

/**
 * Uma rotina mensal marcada para o dia 31 nao pode sumir em fevereiro. Nesses
 * meses a ocorrencia desliza para o ultimo dia disponivel, senao a cobranca
 * simplesmente nao apareceria em 5 dos 12 meses do ano.
 */
export function diaEfetivoDoMes(diaMes: number, data: Date) {
  return Math.min(diaMes, diasNoMes(data.getFullYear(), data.getMonth()));
}

// Espelha public.rotina_vence_em. Mexeu aqui, mexa la.
export function venceEm(regra: RegraRotina, data: Date): boolean {
  if (regra.periodicidade === "pontual") return regra.data_pontual === isoLocal(data);
  if (regra.periodicidade === "diaria") return true;
  if (regra.periodicidade === "semanal") return regra.dias_semana?.includes(data.getDay()) ?? false;
  if (regra.periodicidade === "mensal") {
    return regra.dia_mes != null && data.getDate() === diaEfetivoDoMes(regra.dia_mes, data);
  }
  return false;
}

/** ISO local (yyyy-MM-dd). `toISOString` nao serve: ele converte para UTC e, a
 *  leste de Greenwich depois das 21h, devolveria o dia seguinte. */
export function isoLocal(data: Date) {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Segunda-feira da semana da data, a 0h local. */
export function inicioDaSemana(data: Date) {
  const nova = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  nova.setDate(nova.getDate() - ((nova.getDay() + 6) % 7));
  return nova;
}

export function somarDias(data: Date, dias: number) {
  const nova = new Date(data);
  nova.setDate(nova.getDate() + dias);
  return nova;
}

/** Datas (ISO local) em que a rotina vence dentro do intervalo, inclusive. */
export function ocorrenciasNoIntervalo(regra: RegraRotina, inicio: Date, fim: Date): string[] {
  const datas: string[] = [];
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  const ultimo = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());

  while (cursor <= ultimo) {
    if (venceEm(regra, cursor)) datas.push(isoLocal(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return datas;
}

export function descreverRegra(regra: RegraRotina): string {
  if (regra.periodicidade === "pontual") {
    if (!regra.data_pontual) return "Uma vez";
    const [, mes, dia] = regra.data_pontual.split("-");
    return `Só em ${dia}/${mes}`;
  }
  if (regra.periodicidade === "diaria") return "Todo dia";
  if (regra.periodicidade === "semanal") {
    const marcados = DIAS_SEMANA.filter((d) => regra.dias_semana?.includes(d.id));
    if (marcados.length === 0) return "Semanal";
    if (marcados.length === 7) return "Todo dia";
    if (marcados.length === 1) return `Toda ${marcados[0].label.toLowerCase()}`;
    // Util e virar "seg, qua e sex" em vez de listar sete vezes "toda".
    const curtos = marcados.map((d) => d.curto);
    return `${curtos.slice(0, -1).join(", ")} e ${curtos[curtos.length - 1]}`;
  }
  if (regra.periodicidade === "mensal") return `Todo dia ${regra.dia_mes} do mês`;
  return regra.periodicidade;
}

/** Escolha de lembrete automatico no formulario; "8h" e "off" nao dependem do horario limite. */
export const LEMBRETE_OPCOES = [
  { id: "off", label: "Sem lembrete automático", minutos: null, precisaHorario: false },
  { id: "8h", label: "Às 8h do dia", minutos: null, precisaHorario: false },
  { id: "15", label: "15 min antes do prazo", minutos: 15, precisaHorario: true },
  { id: "30", label: "30 min antes do prazo", minutos: 30, precisaHorario: true },
  { id: "60", label: "1 h antes do prazo", minutos: 60, precisaHorario: true },
  { id: "120", label: "2 h antes do prazo", minutos: 120, precisaHorario: true },
] as const;

export type LembreteOpcao = (typeof LEMBRETE_OPCOES)[number]["id"];

export function lembreteDaRotina(r: { lembrete_auto?: boolean | null; lembrete_minutos_antes?: number | null }): LembreteOpcao {
  if (!r.lembrete_auto) return "off";
  if (r.lembrete_minutos_antes == null) return "8h";
  return LEMBRETE_OPCOES.find((o) => o.minutos === r.lembrete_minutos_antes)?.id ?? "30";
}

/** O que gravar no banco. Sem horario limite, "antes do prazo" vira 8h, como o cron faria. */
export function lembreteParaBanco(opcao: LembreteOpcao, horarioLimite: string | null | undefined) {
  const o = LEMBRETE_OPCOES.find((x) => x.id === opcao) ?? LEMBRETE_OPCOES[0];
  if (o.id === "off") return { lembrete_auto: false, lembrete_minutos_antes: null };
  return { lembrete_auto: true, lembrete_minutos_antes: o.precisaHorario && horarioLimite ? o.minutos : null };
}

/** "Às 8h do dia" ou "30 min antes das 17:00". */
export function descreverLembrete(r: {
  lembrete_auto?: boolean | null;
  lembrete_minutos_antes?: number | null;
  horario_limite?: string | null;
}): string | null {
  if (!r.lembrete_auto) return null;
  if (r.lembrete_minutos_antes == null || !r.horario_limite) return "Às 8h do dia";
  const m = r.lembrete_minutos_antes;
  const quanto = m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${m} min`;
  return `${quanto} antes das ${r.horario_limite.slice(0, 5)}`;
}
