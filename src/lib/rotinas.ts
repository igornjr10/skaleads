export type Periodicidade = "diaria" | "semanal" | "mensal";

export interface RegraRotina {
  periodicidade: string;
  /** Dias da semana marcados (0=domingo), so em rotina semanal. */
  dias_semana: number[] | null;
  dia_mes: number | null;
}

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

export function venceEm(regra: RegraRotina, data: Date): boolean {
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
