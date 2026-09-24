export type BudgetLevel = "none" | "idle" | "behind" | "onTrack" | "ahead" | "over";

// Abaixo disto a conta para a entrega em horas, nao em dias.
export const LOW_BALANCE = 50;

export interface BudgetInput {
  /** Gasto do mes corrente, em reais, vindo de `campaign_daily_metrics`. */
  spent: number;
  /** Soma dos aportes do mes que a Meta registrou, em reais. */
  deposited?: number | null;
  /** Quantos aportes formaram essa soma. */
  depositCount?: number;
  /** Saldo atual da conta Meta, em reais. `null` em conta pos-paga ou sem sync. */
  balance?: number | null;
}

export interface ClientBudgetStatus {
  balance: number | null;
  lowBalance: boolean;
  /** Dias de entrega que o saldo ainda paga, no ritmo atual. */
  runwayDays: number | null;
  /** O saldo cobre o resto do mes. */
  coversMonth: boolean;
  deposited: number | null;
  depositCount: number;
  spent: number;
  remaining: number;
  pct: number;
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

/**
 * Situacao da verba do mes, feita so de fato.
 *
 * Ate 17/09/2026 o teto era `clients.monthly_budget`, digitado a mao. Ele era
 * uma promessa ("o cliente vai investir R$ 700"), nao um fato, e por isso vivia
 * divergindo do dinheiro que existia na conta — foi o que motivou remove-lo.
 *
 * Agora sao duas medidas, as duas vindas da Meta: o saldo (quanto ha na conta
 * agora) e o aporte (quanto entrou neste mes).
 *
 * O ritmo NAO e medido por gasto/aporte. Em 18/09/2026 essa conta acusou a FM
 * Veiculos com 103% da verba tendo R$ 820 em caixa: ela entrara no mes com
 * R$ 946 de saldo virado, que o aporte do mes nao enxerga. O que vale e a
 * autonomia — quantos dias de entrega o saldo ainda paga — porque responde a
 * unica pergunta que muda a acao do gestor: vai parar antes do fim do mes?
 */
export function computeBudgetStatus(input: BudgetInput, now: Date = new Date()): ClientBudgetStatus {
  const { spent } = input;
  const deposited = input.deposited ?? null;
  const balance = input.balance ?? null;

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = now.getDate();
  const daysLeft = Math.max(daysInMonth - daysElapsed, 0);
  const dailyAvg = spent / daysElapsed;
  const projected = dailyAvg * daysInMonth;

  const base: ClientBudgetStatus = {
    balance,
    lowBalance: balance !== null && balance < LOW_BALANCE,
    runwayDays: null,
    coversMonth: false,
    deposited,
    depositCount: input.depositCount ?? 0,
    spent,
    remaining: 0,
    pct: 0,
    dailyAvg,
    dailySuggested: 0,
    projected,
    daysElapsed,
    daysInMonth,
    daysLeft,
    level: "none",
    label: "Saldo nao lido",
    hint: "Sincronize a conta para o saldo aparecer aqui",
  };

  if (balance === null) return base;

  const remaining = balance;
  const dailySuggested = daysLeft > 0 ? balance / daysLeft : balance;

  if (spent <= 0 || dailyAvg <= 0) {
    return {
      ...base,
      remaining,
      dailySuggested,
      level: "idle",
      label: "Sem gasto no mes",
      hint: "Nenhuma entrega registrada neste mes",
    };
  }

  const runwayDays = balance / dailyAvg;
  const coversMonth = runwayDays >= daysLeft;
  // A barra mostra quanto do resto do mes o saldo cobre. Passou de 100%, cobre.
  const pct = daysLeft > 0 ? Math.min((runwayDays / daysLeft) * 100, 100) : 100;

  let level: BudgetLevel;
  let label: string;
  let hint: string;

  const dias = Math.floor(runwayDays);

  if (runwayDays < daysLeft * 0.6) {
    level = "over";
    label = "Vai faltar saldo";
    hint = `No ritmo de hoje o saldo paga ${dias} dia(s), e faltam ${daysLeft} para fechar o mes`;
  } else if (runwayDays < daysLeft) {
    level = "ahead";
    label = "Aperta no fim do mes";
    hint = `Saldo para ${dias} dia(s) contra ${daysLeft} que faltam — da para esticar reduzindo o diario`;
  } else if (runwayDays > daysLeft * 2) {
    level = "behind";
    label = "Sobrando saldo";
    hint = `Saldo pagaria ${dias} dia(s) no ritmo atual; da para investir mais sem risco de parar`;
  } else {
    level = "onTrack";
    label = "Cobre o mes";
    hint = `Saldo paga ${dias} dia(s) e faltam ${daysLeft} — fecha o mes sem parar`;
  }

  return { ...base, remaining, pct, dailySuggested, runwayDays, coversMonth, level, label, hint };
}
