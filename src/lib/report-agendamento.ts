// Frequencia do envio agendado <-> expressao cron. O cron continua sendo a
// fonte da verdade em report_schedules.cron (o job roda 1x por hora e ignora o
// minuto); a tela so traduz para frequencia, dias e horario.
//
// GEMEO: supabase/functions/run-report-schedules/agendamento.ts e copia byte a
// byte deste arquivo (o teste report-twins.test.ts confere). Sem imports.

export type Frequencia = "diaria" | "semanal" | "quinzenal" | "mensal" | "personalizada";

export interface Agenda {
  frequencia: Frequencia;
  /** 0 = domingo ... 6 = sabado. */
  diasSemana: number[];
  /** 1 a 31. Em mes curto o dia que nao existe e pulado. */
  diasMes: number[];
  hora: number;
  /** So para "personalizada". */
  cron?: string;
}

export const DIAS_DA_SEMANA = [
  { valor: 1, curto: "Seg", nome: "segunda" },
  { valor: 2, curto: "Ter", nome: "terça" },
  { valor: 3, curto: "Qua", nome: "quarta" },
  { valor: 4, curto: "Qui", nome: "quinta" },
  { valor: 5, curto: "Sex", nome: "sexta" },
  { valor: 6, curto: "Sáb", nome: "sábado" },
  { valor: 0, curto: "Dom", nome: "domingo" },
];

export const AGENDA_PADRAO: Agenda = { frequencia: "semanal", diasSemana: [1], diasMes: [1], hora: 9 };

function ordenarUnicos(lista: number[]): number[] {
  return [...new Set(lista)].sort((a, b) => a - b);
}

function hora(h: unknown): number {
  const v = Math.floor(Number(h));
  return Number.isFinite(v) && v >= 0 && v <= 23 ? v : 9;
}

export function montarCron(agenda: Agenda): string {
  const h = hora(agenda.hora);
  switch (agenda.frequencia) {
    case "diaria":
      return `0 ${h} * * *`;
    case "semanal": {
      const dias = ordenarUnicos(agenda.diasSemana.filter((d) => d >= 0 && d <= 6));
      return `0 ${h} * * ${dias.length ? dias.join(",") : "1"}`;
    }
    case "quinzenal":
      return `0 ${h} 1,15 * *`;
    case "mensal": {
      const dias = ordenarUnicos(agenda.diasMes.filter((d) => d >= 1 && d <= 31));
      return `0 ${h} ${dias.length ? dias.join(",") : "1"} * *`;
    }
    case "personalizada":
      return (agenda.cron ?? "").trim().replace(/\s+/g, " ");
  }
}

const LISTA_RE = /^\d+(,\d+)*$/;

export function lerCron(cron: string): Agenda {
  const partes = (cron ?? "").trim().split(/\s+/);
  const personalizada: Agenda = { ...AGENDA_PADRAO, frequencia: "personalizada", cron: (cron ?? "").trim() };
  if (partes.length !== 5) return personalizada;
  const [, h, dm, mes, ds] = partes;
  if (!/^\d+$/.test(h) || Number(h) > 23 || mes !== "*") return personalizada;
  const base = { ...AGENDA_PADRAO, hora: Number(h) };

  if (dm === "*" && ds === "*") return { ...base, frequencia: "diaria" };
  if (dm === "*" && LISTA_RE.test(ds)) {
    const dias = ds.split(",").map(Number).map((d) => (d === 7 ? 0 : d));
    if (dias.every((d) => d >= 0 && d <= 6)) return { ...base, frequencia: "semanal", diasSemana: ordenarUnicos(dias) };
  }
  if (ds === "*" && dm === "1,15") return { ...base, frequencia: "quinzenal", diasMes: [1, 15] };
  if (ds === "*" && LISTA_RE.test(dm)) {
    const dias = dm.split(",").map(Number);
    if (dias.every((d) => d >= 1 && d <= 31)) return { ...base, frequencia: "mensal", diasMes: ordenarUnicos(dias) };
  }
  return personalizada;
}

function juntar(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

export function descreverCron(cron: string): string {
  const a = lerCron(cron);
  const quando = `às ${a.hora}h`;
  switch (a.frequencia) {
    case "diaria":
      return `Todo dia ${quando}`;
    case "semanal": {
      if (a.diasSemana.length === 7) return `Todo dia ${quando}`;
      const nomes = DIAS_DA_SEMANA.filter((d) => a.diasSemana.includes(d.valor)).map((d) => d.nome);
      return `Toda ${juntar(nomes)} ${quando}`;
    }
    case "quinzenal":
      return `Quinzenal (dias 1 e 15) ${quando}`;
    case "mensal":
      return a.diasMes.length === 1 ? `Todo dia ${a.diasMes[0]} do mês ${quando}` : `Dias ${juntar(a.diasMes.map(String))} de cada mês ${quando}`;
    case "personalizada":
      return `Cron personalizado: ${a.cron || "(vazio)"}`;
  }
}

/** Casa um campo de cron ("*", "5", "1,15", "*\/3", "1-5") com um valor. */
export function campoCasa(campo: string, valor: number, domingoSete = false): boolean {
  return campo.split(",").some((parte) => {
    if (parte === "*") return true;
    if (parte.startsWith("*/")) {
      const passo = parseInt(parte.slice(2), 10);
      return passo > 0 && valor % passo === 0;
    }
    const faixa = /^(\d+)-(\d+)$/.exec(parte);
    if (faixa) {
      const de = Number(faixa[1]);
      const ate = Number(faixa[2]);
      return (valor >= de && valor <= ate) || (domingoSete && valor === 0 && de <= 7 && ate >= 7);
    }
    if (!/^\d+$/.test(parte)) return false;
    const n = Number(parte);
    return n === valor || (domingoSete && valor === 0 && n === 7);
  });
}

export function cronValido(cron: string): boolean {
  const partes = (cron ?? "").trim().split(/\s+/);
  if (partes.length !== 5) return false;
  return partes.every((p) => /^(\*|\*\/\d+|\d+(-\d+)?)(,(\*|\*\/\d+|\d+(-\d+)?))*$/.test(p));
}

export interface MomentoSP {
  hora: number;
  diaMes: number;
  mes: number;
  diaSemana: number;
}

/** O job roda 1x por hora (minuto 0): so hora, dia, mes e dia da semana contam. */
export function venceNestaHora(cron: string, agora: MomentoSP): boolean {
  if (!cronValido(cron)) return false;
  const [, h, dm, mes, ds] = cron.trim().split(/\s+/);
  return campoCasa(h, agora.hora) && campoCasa(dm, agora.diaMes) && campoCasa(mes, agora.mes) && campoCasa(ds, agora.diaSemana, true);
}

/** Sao Paulo esta em UTC-3 o ano todo desde 2019 (sem horario de verao). */
export function momentoEmSaoPaulo(data: Date): MomentoSP {
  const sp = new Date(data.getTime() - 3 * 3600000);
  return { hora: sp.getUTCHours(), diaMes: sp.getUTCDate(), mes: sp.getUTCMonth() + 1, diaSemana: sp.getUTCDay() };
}

/** Proxima hora cheia (depois de `desde`) em que o cron dispara, ou null. */
export function proximaExecucao(cron: string, desde: Date = new Date()): Date | null {
  if (!cronValido(cron)) return null;
  const inicio = new Date(desde.getTime());
  inicio.setUTCMinutes(0, 0, 0);
  for (let i = 1; i <= 24 * 400; i++) {
    const candidato = new Date(inicio.getTime() + i * 3600000);
    if (venceNestaHora(cron, momentoEmSaoPaulo(candidato))) return candidato;
  }
  return null;
}

/** Janela de dados padrao quando o agendamento nao define uma. */
export function periodoPadraoDaFrequencia(cron: string): { tipo: "ontem" } | { tipo: "ultimos_dias"; dias: number } | { tipo: "mes_anterior" } {
  const a = lerCron(cron);
  if (a.frequencia === "diaria") return { tipo: "ontem" };
  if (a.frequencia === "quinzenal") return { tipo: "ultimos_dias", dias: 15 };
  if (a.frequencia === "mensal") return { tipo: "mes_anterior" };
  return { tipo: "ultimos_dias", dias: 7 };
}
