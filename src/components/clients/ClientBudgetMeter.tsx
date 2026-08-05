import { Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { BUDGET_TONES, type ClientBudgetStatus } from "@/lib/client-budget";

interface BudgetBarProps {
  status: ClientBudgetStatus;
  className?: string;
}

function BudgetBar({ status, className = "h-2" }: BudgetBarProps) {
  const tone = BUDGET_TONES[status.level];
  const fill = Math.min(Math.max(status.pct, 0), 100);
  const marker = Math.min(Math.max(status.expectedPct, 0), 100);

  return (
    <div className={`relative w-full overflow-hidden rounded-full bg-slate-200 ${className}`}>
      <div className={`h-full rounded-full transition-all ${tone.bar}`} style={{ width: `${fill}%` }} />
      {/* Marca onde o gasto deveria estar se a verba fosse diluida por igual no mes */}
      <span
        className="absolute inset-y-0 w-px bg-slate-500/60"
        style={{ left: `${marker}%` }}
        title={`Ritmo esperado: ${Math.round(status.expectedPct)}%`}
      />
    </div>
  );
}

interface ClientBudgetMeterProps {
  status: ClientBudgetStatus;
  onSetBudget?: () => void;
}

export function ClientBudgetMeter({ status, onSetBudget }: ClientBudgetMeterProps) {
  const tone = BUDGET_TONES[status.level];

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Wallet className="h-3.5 w-3.5" />
          Verba do mes
        </p>
        <Badge variant="outline" className={tone.badge}>{status.label}</Badge>
      </div>

      {status.budget == null ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">{status.hint}</p>
          {onSetBudget && (
            <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={onSetBudget}>
              Definir verba
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-end justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">
              {formatCurrency(status.spent)}
              <span className="text-xs font-normal text-muted-foreground"> de {formatCurrency(status.budget)}</span>
            </p>
            <span className={`text-sm font-semibold tabular-nums ${tone.text}`}>{Math.round(status.pct)}%</span>
          </div>

          <BudgetBar status={status} className="mt-2 h-2" />

          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
            <div>
              <p className="text-muted-foreground">Restante</p>
              <p className={`font-medium ${status.remaining < 0 ? "text-rose-600" : "text-slate-700"}`}>
                {formatCurrency(status.remaining)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Media/dia</p>
              <p className="font-medium text-slate-700">{formatCurrency(status.dailyAvg)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Projecao mes</p>
              <p className={`font-medium ${status.projected > status.budget ? "text-rose-600" : "text-slate-700"}`}>
                {formatCurrency(status.projected)}
              </p>
            </div>
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground">
            {status.daysLeft > 0
              ? `Faltam ${status.daysLeft} dia(s) · da para investir ${formatCurrency(status.dailySuggested)}/dia`
              : "Ultimo dia do mes"}
          </p>
        </>
      )}
    </div>
  );
}

export function ClientBudgetCell({ status }: { status: ClientBudgetStatus }) {
  const tone = BUDGET_TONES[status.level];

  if (status.budget == null) {
    return <span className="text-xs text-muted-foreground">Sem verba</span>;
  }

  return (
    <div className="min-w-[140px] space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-slate-700">{formatCurrency(status.spent)}</span>
        <span className={`font-semibold tabular-nums ${tone.text}`}>{Math.round(status.pct)}%</span>
      </div>
      <BudgetBar status={status} className="h-1.5" />
      <p className="text-[11px] text-muted-foreground">
        de {formatCurrency(status.budget)} · {status.label.toLowerCase()}
      </p>
    </div>
  );
}
