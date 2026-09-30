import { Landmark, RefreshCw, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { BUDGET_TONES, type ClientBudgetStatus } from "@/lib/client-budget";

interface BudgetBarProps {
  status: ClientBudgetStatus;
  className?: string;
}

// Quanto do resto do mes o saldo cobre. Cheia = fecha o mes sem parar.
function BudgetBar({ status, className = "h-2" }: BudgetBarProps) {
  const tone = BUDGET_TONES[status.level];
  const fill = Math.min(Math.max(status.pct, 0), 100);

  return (
    <div className={`relative w-full overflow-hidden rounded-full bg-slate-200 ${className}`}>
      <div className={`h-full rounded-full transition-all ${tone.bar}`} style={{ width: `${fill}%` }} />
    </div>
  );
}

interface ClientBudgetMeterProps {
  status: ClientBudgetStatus;
  onSync?: () => void;
}

export function ClientBudgetMeter({ status, onSync }: ClientBudgetMeterProps) {
  const tone = BUDGET_TONES[status.level];
  const temAporte = status.deposited !== null && status.deposited > 0;

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Wallet className="h-3.5 w-3.5" />
          Verba do mes
        </p>
        <Badge variant="outline" className={tone.badge}>{status.label}</Badge>
      </div>

      {/* O saldo e o numero em destaque: e o unico que diz se a conta para
          amanha. O gasto e o aporte explicam o mes; o saldo manda no hoje. */}
      {status.balance !== null ? (
        <div className="mt-2">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Landmark className="h-3 w-3" />
            Saldo na conta
          </p>
          <p className={`text-xl font-bold leading-tight ${status.lowBalance ? "text-rose-600" : "text-slate-800"}`}>
            {formatCurrency(status.balance)}
          </p>
          {status.lowBalance && (
            <p className="text-[11px] font-medium text-rose-600">
              Saldo baixo — a entrega para quando zerar
            </p>
          )}
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">{status.hint}</p>
          {onSync && (
            <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={onSync}>
              <RefreshCw className="h-3 w-3" />
              Sincronizar
            </Button>
          )}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <p className="text-muted-foreground">Gasto no mes</p>
          <p className="font-medium text-slate-700">{formatCurrency(status.spent)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Aportes no mes</p>
          <p className="font-medium text-slate-700">
            {temAporte ? (
              <>
                {formatCurrency(status.deposited!)}
                <span className="font-normal text-muted-foreground"> · {status.depositCount}x</span>
              </>
            ) : (
              <span className="font-normal text-muted-foreground">nenhum</span>
            )}
          </p>
        </div>
      </div>

      {status.runwayDays !== null && (
        <>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Autonomia do saldo</span>
            <span className={`text-sm font-semibold tabular-nums ${tone.text}`}>
              {Math.floor(status.runwayDays)} de {status.daysLeft} dia(s)
            </span>
          </div>

          <BudgetBar status={status} className="mt-1 h-2" />

          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <p className="text-muted-foreground">Media/dia</p>
              <p className="font-medium text-slate-700">{formatCurrency(status.dailyAvg)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Da para investir</p>
              <p className="font-medium text-slate-700">{formatCurrency(status.dailySuggested)}/dia</p>
            </div>
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground">{status.hint}</p>
        </>
      )}

    </div>
  );
}

export function ClientBudgetCell({ status }: { status: ClientBudgetStatus }) {
  const tone = BUDGET_TONES[status.level];

  return (
    <div className="min-w-[140px] space-y-1">
      {status.balance !== null ? (
        <p className={`text-sm font-semibold ${status.lowBalance ? "text-rose-600" : "text-slate-800"}`}>
          {formatCurrency(status.balance)}
          <span className="text-[11px] font-normal text-muted-foreground"> em saldo</span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Saldo nao lido</p>
      )}

      <p className="text-[11px] text-muted-foreground">Gasto {formatCurrency(status.spent)} no mes</p>

      {status.runwayDays !== null && (
        <>
          <BudgetBar status={status} className="h-1.5" />
          <p className="text-[11px] text-muted-foreground">
            paga {Math.floor(status.runwayDays)} de {status.daysLeft} dia(s) ·{" "}
            <span className={tone.text}>{status.label.toLowerCase()}</span>
          </p>
        </>
      )}
    </div>
  );
}
