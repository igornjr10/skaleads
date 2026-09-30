import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Landmark, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import {
  PREPAID_FUNDING_TYPE,
  firstOfMonthIso,
  reconcileCharges,
  summarizeDeposits,
  type ChargeReconciliation,
  type FundingEvent,
  type FundingEventType,
} from "@/lib/meta-funding";

interface ClientFundingPanelProps {
  clientId: string;
  balanceCents: number | null;
  balanceLabel: string | null;
  fundingType: number | null;
  balanceAt: string | null;
}

const LOW_BALANCE = 50;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function ClientFundingPanel({
  clientId,
  balanceCents,
  balanceLabel,
  fundingType,
  balanceAt,
}: ClientFundingPanelProps) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<FundingEvent[]>([]);
  const [reconciliation, setReconciliation] = useState<ChargeReconciliation[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const since = firstOfMonthIso();

      const [{ data: eventRows }, { data: spendRows }] = await Promise.all([
        supabase
          .from("client_funding_events")
          .select("event_type, event_time, amount_cents, currency, network_id, transaction_id")
          .eq("client_id", clientId)
          .gte("event_time", since)
          .order("event_time", { ascending: false }),
        supabase
          .from("campaign_daily_metrics")
          .select("date, spend")
          .eq("client_id", clientId)
          // Um dia antes do mes: a cobranca do dia 1 cobre o gasto do ultimo
          // dia do mes anterior, e sem ele a primeira linha acusaria buraco.
          .gte("date", new Date(new Date(since).getTime() - 86400000).toISOString().slice(0, 10)),
      ]);

      if (cancelled) return;

      const parsed: FundingEvent[] = (eventRows ?? []).map((row) => ({
        eventType: row.event_type as FundingEventType,
        eventTime: row.event_time as string,
        amountCents: row.amount_cents as number,
        currency: (row.currency as string | null) ?? null,
        networkId: (row.network_id as string | null) ?? null,
        transactionId: (row.transaction_id as string | null) ?? null,
        extraData: null,
      }));

      const spendByDate: Record<string, number> = {};
      for (const row of spendRows ?? []) {
        spendByDate[row.date as string] = Number(row.spend) || 0;
      }

      setEvents(parsed);
      setReconciliation(reconcileCharges(parsed, spendByDate).slice(0, 7));
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const deposits = events.filter((event) => event.eventType === "funding_event_successful");
  const summary = summarizeDeposits(events);
  const isPrepaid = fundingType === PREPAID_FUNDING_TYPE;
  const divergences = reconciliation.filter((row) => row.suspicious);

  if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
            <Landmark className="h-4 w-4" /> Saldo e aportes do mes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {balanceCents != null ? (
            <div>
              <p className={`text-2xl font-bold ${balanceCents / 100 < LOW_BALANCE ? "text-rose-600" : ""}`}>
                {formatCurrency(balanceCents / 100)}
              </p>
              <p className="text-xs text-muted-foreground">
                Saldo na conta{balanceAt ? ` · lido em ${fmtDateTime(balanceAt)}` : ""}
              </p>
            </div>
          ) : (
            <div>
              {/* Fora do pre-pago o mesmo campo descreve um cartao, e nao ha
                  saldo nenhum a mostrar — a conta so gera fatura. */}
              <p className="text-sm text-muted-foreground">
                {isPrepaid ? "Saldo ainda nao lido nesta conta" : "Conta pos-paga — sem saldo a acompanhar"}
              </p>
              {balanceLabel && <p className="mt-1 text-xs text-muted-foreground">Meta informa: {balanceLabel}</p>}
            </div>
          )}

          {deposits.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {summary.depositCount === 1 ? "1 aporte no mes" : `${summary.depositCount} aportes no mes`}
                </span>
                <span className="font-semibold">{formatCurrency(summary.depositedThisMonth)}</span>
              </div>
              <ul className="space-y-1">
                {deposits.slice(0, 5).map((deposit) => (
                  <li
                    key={`${deposit.eventTime}-${deposit.amountCents}`}
                    className="flex items-center justify-between rounded-lg bg-emerald-50/60 px-2 py-1 text-xs"
                  >
                    <span className="text-muted-foreground">
                      {fmtDateTime(deposit.eventTime)}
                      {deposit.networkId ? ` · ${deposit.networkId}` : ""}
                    </span>
                    <span className="font-medium text-emerald-700">+{formatCurrency(deposit.amountCents / 100)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum aporte registrado neste mes</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingDown className="h-4 w-4" /> Conferencia: cobranca x gasto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {reconciliation.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma cobranca registrada neste mes</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {divergences.length === 0 ? (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Tudo batendo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    {divergences.length} dia(s) divergindo
                  </Badge>
                )}
              </div>

              {/* A Meta cobra pela manha o que foi gasto no dia anterior, entao a
                  linha compara sempre cobranca(D) com gasto(D-1). */}
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="pb-1 text-left font-normal">Gasto de</th>
                    <th className="pb-1 text-right font-normal">Cobrado</th>
                    <th className="pb-1 text-right font-normal">Registrado</th>
                    <th className="pb-1 text-right font-normal">Dif.</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliation.map((row) => (
                    <tr key={row.chargeDate} className={row.suspicious ? "text-amber-700" : ""}>
                      <td className="py-0.5">{fmtDate(row.spendDate)}</td>
                      <td className="py-0.5 text-right tabular-nums">{formatCurrency(row.chargedAmount)}</td>
                      <td className="py-0.5 text-right tabular-nums">{formatCurrency(row.reportedSpend)}</td>
                      <td className="py-0.5 text-right tabular-nums font-medium">
                        {row.diff >= 0 ? "+" : ""}
                        {formatCurrency(row.diff)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="text-[11px] text-muted-foreground">
                Diferenca de centavos e arredondamento. Acima de R$ 1,00 indica dia faltando ou incompleto no sync.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
