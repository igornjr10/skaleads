// Periodo de analise do relatorio: presets, "ultimos N dias" livre e
// intervalo de datas. Datas sempre como YYYY-MM-DD e conta em UTC, para dar o
// mesmo resultado no navegador e na Edge Function (que roda em UTC).
//
// GEMEO: supabase/functions/run-report-schedules/periodo.ts e copia byte a
// byte deste arquivo (o teste report-twins.test.ts confere). Sem imports.

export type PeriodoSpec =
  | { tipo: "ontem" }
  | { tipo: "ultimos_dias"; dias: number }
  | { tipo: "semana_anterior" }
  | { tipo: "mes_atual" }
  | { tipo: "mes_anterior" }
  | { tipo: "intervalo"; inicio: string; fim: string };

export interface PeriodoResolvido {
  start: string;
  end: string;
  label: string;
}

export const MAX_DIAS_PERIODO = 365;

export const PRESETS_DE_PERIODO: Array<{ valor: string; label: string; spec: PeriodoSpec }> = [
  { valor: "ontem", label: "Ontem", spec: { tipo: "ontem" } },
  { valor: "7", label: "Últimos 7 dias", spec: { tipo: "ultimos_dias", dias: 7 } },
  { valor: "14", label: "Últimos 14 dias", spec: { tipo: "ultimos_dias", dias: 14 } },
  { valor: "30", label: "Últimos 30 dias", spec: { tipo: "ultimos_dias", dias: 30 } },
  { valor: "90", label: "Últimos 90 dias", spec: { tipo: "ultimos_dias", dias: 90 } },
  { valor: "semana_anterior", label: "Semana passada (seg a dom)", spec: { tipo: "semana_anterior" } },
  { valor: "mes_atual", label: "Este mês", spec: { tipo: "mes_atual" } },
  { valor: "mes_anterior", label: "Mês passado", spec: { tipo: "mes_anterior" } },
];

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function paraUtc(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function paraIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function somarDias(iso: string, dias: number): string {
  const d = paraUtc(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return paraIso(d);
}

export function dataValida(iso: unknown): iso is string {
  if (typeof iso !== "string" || !DATA_RE.test(iso)) return false;
  return paraIso(paraUtc(iso)) === iso;
}

export function formatarDataCurta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function diasNoIntervalo(inicio: string, fim: string): number {
  return Math.round((paraUtc(fim).getTime() - paraUtc(inicio).getTime()) / 86400000) + 1;
}

function limitarDias(dias: unknown): number {
  const v = Math.floor(Number(dias));
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(v, MAX_DIAS_PERIODO);
}

/** Aceita o que veio do banco e devolve um spec valido, ou null. */
export function normalizarPeriodo(bruto: unknown): PeriodoSpec | null {
  if (!bruto || typeof bruto !== "object") return null;
  const p = bruto as Record<string, unknown>;
  switch (p.tipo) {
    case "ontem":
    case "semana_anterior":
    case "mes_atual":
    case "mes_anterior":
      return { tipo: p.tipo };
    case "ultimos_dias":
      return { tipo: "ultimos_dias", dias: limitarDias(p.dias) };
    case "intervalo":
      if (dataValida(p.inicio) && dataValida(p.fim) && p.inicio <= p.fim) {
        return { tipo: "intervalo", inicio: p.inicio, fim: p.fim };
      }
      return null;
    default:
      return null;
  }
}

/**
 * Datas do periodo a partir de "hoje" (YYYY-MM-DD no fuso do cliente).
 * "Ultimos N dias" termina ontem: o dia corrente ainda esta pela metade e
 * puxaria custo por resultado para cima.
 */
export function resolverPeriodo(spec: PeriodoSpec, hoje: string): PeriodoResolvido {
  const ontem = somarDias(hoje, -1);
  let start: string;
  let end: string;
  let nome: string;

  switch (spec.tipo) {
    case "ontem":
      start = ontem;
      end = ontem;
      nome = "Ontem";
      break;
    case "ultimos_dias": {
      const dias = limitarDias(spec.dias);
      end = ontem;
      start = somarDias(ontem, -(dias - 1));
      nome = dias === 1 ? "Último dia" : `Últimos ${dias} dias`;
      break;
    }
    case "semana_anterior": {
      const diaSemana = paraUtc(hoje).getUTCDay();
      const segundaAtual = somarDias(hoje, -((diaSemana + 6) % 7));
      start = somarDias(segundaAtual, -7);
      end = somarDias(segundaAtual, -1);
      nome = "Semana passada";
      break;
    }
    case "mes_atual": {
      start = `${hoje.slice(0, 7)}-01`;
      end = hoje;
      nome = "Este mês";
      break;
    }
    case "mes_anterior": {
      const primeiroAtual = `${hoje.slice(0, 7)}-01`;
      end = somarDias(primeiroAtual, -1);
      start = `${end.slice(0, 7)}-01`;
      nome = "Mês passado";
      break;
    }
    case "intervalo": {
      const [a, b] = spec.inicio <= spec.fim ? [spec.inicio, spec.fim] : [spec.fim, spec.inicio];
      start = a;
      end = b;
      nome = "";
      break;
    }
  }

  const datas = start === end ? formatarDataCurta(start) : `${formatarDataCurta(start)} a ${formatarDataCurta(end)}`;
  return { start, end, label: nome ? `${nome} (${datas})` : datas };
}

export function descreverPeriodo(spec: PeriodoSpec): string {
  switch (spec.tipo) {
    case "ontem":
      return "Ontem";
    case "ultimos_dias":
      return spec.dias === 1 ? "Último dia" : `Últimos ${spec.dias} dias`;
    case "semana_anterior":
      return "Semana passada";
    case "mes_atual":
      return "Este mês";
    case "mes_anterior":
      return "Mês passado";
    case "intervalo":
      return `${formatarDataCurta(spec.inicio)} a ${formatarDataCurta(spec.fim)}`;
  }
}

/** Periodo salvo no modelo do cliente: o novo (`periodo`) ou o antigo ("7d"). */
export function periodoDoModelo(modelo: unknown): PeriodoSpec | null {
  if (!modelo || typeof modelo !== "object") return null;
  const m = modelo as { periodo?: unknown; period?: unknown };
  const novo = normalizarPeriodo(m.periodo);
  if (novo) return novo;
  const legado = typeof m.period === "string" ? /^(\d+)d$/.exec(m.period) : null;
  return legado ? { tipo: "ultimos_dias", dias: limitarDias(legado[1]) } : null;
}

/** Hoje (YYYY-MM-DD) em Sao Paulo, que e onde os clientes estao. */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 3600000).toISOString().slice(0, 10);
}
