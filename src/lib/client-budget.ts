export type BudgetLevel = "none" | "idle" | "behind" | "onTrack" | "ahead" | "over";

export interface ClientBudgetStatus {
  budget: number | null;
  spent: number;
  remaining: number;
  pct: number;
  expectedPct: number;
  paceDiff: number;
  dailyAvg: number;
  dailySuggested: number;
  projected: number;
  daysElapsed: number;
  daysInMonth: number;
  daysLeft: number;
  level: BudgetLevel;
  label: string;
  hint: string;
}

export const BUDGET_TONES: Record<BudgetLevel, { badge: string; bar: string; text: string }> = {
  none: { badge: "border-slate-200 bg-slate-50 text-slate-600", bar: "bg-slate-300", text: "text-slate-600" },
  idle: { badge: "border-slate-200 bg-slate-50 text-slate-600", bar: "bg-slate-300", text: "text-slate-600" },
  behind: { badge: "border-sky-200 bg-sky-50 text-sky-700", bar: "bg-sky-500", text: "text-sky-700" },
  onTrack: { badge: "border-emerald-200 bg-emerald-50 text-emerald-700", bar: "bg-emerald-500", text: "text-emerald-700" },
  ahead: { badge: "border-amber-200 bg-amber-50 text-amber-700", bar: "bg-amber-500", text: "text-amber-700" },
  over: { badge: "border-rose-200 bg-rose-50 text-rose-700", bar: "bg-rose-500", text: "text-rose-700" },
};

// Tolerancia em pontos percentuais antes de acusar desvio de ritmo — abaixo disso
// a variacao do dia a dia geraria alarme falso todo dia.
const PACE_TOLERANCE = 10;

export function computeBudgetStatus(
  budget: number | null | undefined,
  spent: number,
  now: Date = new Date()
): ClientBudgetStatus {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = now.getDate();
  const daysLeft = Math.max(daysInMonth - daysElapsed, 0);
  const expectedPct = (daysElapsed / daysInMonth) * 100;
  const dailyAvg = spent / daysElapsed;
  const projected = dailyAvg * daysInMonth;

  const base: ClientBudgetStatus = {
    budget: budget ?? null,
    spent,
    remaining: 0,
    pct: 0,
    expectedPct,
    paceDiff: 0,
    dailyAvg,
    dailySuggested: 0,
    projected,
    daysElapsed,
    daysInMonth,
    daysLeft,
    level: "none",
    label: "Sem verba definida",
    hint: "Cadastre a verba mensal para acompanhar o consumo",
  };

  if (!budget || budget <= 0) return base;

  const remaining = budget - spent;
  const pct = (spent / budget) * 100;
  const paceDiff = pct - expectedPct;
  const dailySuggested = daysLeft > 0 ? Math.max(remaining, 0) / daysLeft : Math.max(remaining, 0);

  let level: BudgetLevel;
  let label: string;
  let hint: string;

  if (pct >= 100) {
    level = "over";
    label = "Verba estourada";
    hint = `Passou ${Math.round(pct - 100)}% do combinado para o mes`;
  } else if (spent <= 0) {
    level = "idle";
    label = "Sem gasto no mes";
    hint = "Nenhuma entrega registrada neste mes";
  } else if (paceDiff > PACE_TOLERANCE) {
    level = "ahead";
    label = "Acima do ritmo";
    hint = `Gastando mais rapido que o mes: ${Math.round(pct)}% da verba no dia ${daysElapsed}/${daysInMonth}`;
  } else if (paceDiff < -PACE_TOLERANCE) {
    level = "behind";
    label = "Abaixo do ritmo";
    hint = `Sobrando verba: ${Math.round(pct)}% consumido no dia ${daysElapsed}/${daysInMonth}`;
  } else {
    level = "onTrack";
    label = "No ritmo";
    hint = `${Math.round(pct)}% da verba no dia ${daysElapsed}/${daysInMonth}`;
  }

  return { ...base, remaining, pct, paceDiff, dailySuggested, level, label, hint };
}
