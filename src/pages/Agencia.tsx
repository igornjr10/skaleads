import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format, startOfMonth, subDays, subMonths } from "date-fns";
import { AlertTriangle, Bell, Building2, CircleDollarSign, Crosshair, Inbox, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/utils";
import { buscarTudo } from "@/lib/buscar-tudo";
import { hojeISO } from "@/lib/demandas";
import {
  type ClienteAgencia, type FaturaAgencia, type GastoDiario, type VisaoAgencia,
  MOTIVO_LABEL, montarVisaoAgencia,
} from "@/lib/agencia";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function todosOsGastos(desde: string): Promise<GastoDiario[]> {
  return buscarTudo<GastoDiario>((de, ate) =>
    supabase.from("campaign_daily_metrics").select("client_id, date, spend, messages, calls, directions, leads").gte("date", desde).order("date").range(de, ate)
  );
}

function Kpi({ icon: Icon, titulo, valor, detalhe, alerta }: {
  icon: typeof Users;
  titulo: string;
  valor: string;
  detalhe?: React.ReactNode;
  alerta?: boolean;
}) {
  return (
    <Card className={`shadow-card ${alerta ? "border-destructive/40" : ""}`}>
      <CardContent className="flex items-start gap-3 p-5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${alerta ? "bg-destructive/10 text-destructive ring-destructive/20" : "bg-primary/10 text-primary ring-primary/20"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</div>
          <div className={`text-2xl font-semibold tabular-nums ${alerta ? "text-destructive" : ""}`}>{valor}</div>
          {detalhe && <div className="mt-0.5 text-xs text-muted-foreground">{detalhe}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Agencia() {
  const [visao, setVisao] = useState<VisaoAgencia | null>(null);
  const [nomes, setNomes] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    (async () => {
      const agora = new Date();
      const hoje = hojeISO(agora);
      const inicioMesAnterior = format(startOfMonth(subMonths(agora, 1)), "yyyy-MM-dd");
      const seteDias = subDays(agora, 7).toISOString();
      try {
        const [clientes, faturas, gastos, demandas, relatorios, alertas, perfis] = await Promise.all([
          supabase.from("clients").select("id, name, status, meta_sync_status, meta_ad_account_id, meta_balance_cents, alvo_resultados_mes, alvo_custo_resultado"),
          supabase
            .from("invoices")
            .select("client_id, due_date, amount, status, paid_at, paid_amount")
            .neq("status", "cancelada")
            .or(`status.in.(aberta,vencida),due_date.gte.${inicioMesAnterior}`),
          todosOsGastos(inicioMesAnterior),
          supabase.from("tasks").select("status, prazo, assigned_to"),
          supabase.from("reports").select("client_id").gte("created_at", seteDias),
          supabase.from("alert_events").select("id", { count: "exact", head: true }).is("resolved_at", null).gte("triggered_at", seteDias),
          supabase.from("profiles").select("id, full_name, email"),
        ]);
        for (const r of [clientes, faturas, demandas, relatorios]) if (r.error) throw r.error;

        setNomes(new Map(((perfis.data ?? []) as { id: string; full_name: string | null; email: string | null }[])
          .map(p => [p.id, p.full_name || p.email || "—"])));
        setVisao(montarVisaoAgencia({
          hoje,
          clientes: (clientes.data ?? []) as ClienteAgencia[],
          faturas: (faturas.data ?? []) as FaturaAgencia[],
          gastos,
          demandas: (demandas.data ?? []) as { status: string; prazo: string | null; assigned_to: string | null }[],
          relatoriosRecentes: ((relatorios.data ?? []) as { client_id: string | null }[]).map(r => r.client_id).filter((id): id is string => !!id),
          alertasAbertos: alertas.count ?? 0,
        }));
      } catch (err) {
        toast.error(errorMessage(err, "Não foi possível montar a visão da agência"));
      }
    })();
  }, []);

  if (!visao) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  const { clientes, investimento, financeiro, demandas, metas, atencao, alertasAbertos } = visao;
  const subiu = (investimento.variacao ?? 0) >= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Building2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Visão da agência</h1>
          <p className="text-sm text-muted-foreground">Carteira, mídia, dinheiro e equipe num lugar só.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi
          icon={Users}
          titulo="Clientes ativos"
          valor={String(clientes.ativos)}
          detalhe={clientes.metaComProblema > 0 ? `${clientes.metaComProblema} com Meta a reconectar` : `de ${clientes.total} na carteira`}
          alerta={clientes.metaComProblema > 0}
        />
        <Kpi
          icon={Wallet}
          titulo="Investido no mês"
          valor={brl(investimento.mes)}
          detalhe={investimento.variacao === null ? "sem base no mês anterior" : (
            <span className={`inline-flex items-center gap-1 ${subiu ? "text-emerald-400" : "text-amber-400"}`}>
              {subiu ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {subiu ? "+" : ""}{Math.round(investimento.variacao * 100)}% vs mesmo período do mês anterior
            </span>
          )}
        />
        <Kpi
          icon={CircleDollarSign}
          titulo="Vencido"
          valor={brl(financeiro.vencido)}
          detalhe={financeiro.vencidas > 0
            ? `${financeiro.vencidas} fatura${financeiro.vencidas === 1 ? "" : "s"} de ${financeiro.clientesInadimplentes} cliente${financeiro.clientesInadimplentes === 1 ? "" : "s"}`
            : `${brl(financeiro.recebido)} recebido · ${brl(financeiro.aReceber)} a receber`}
          alerta={financeiro.vencidas > 0}
        />
        <Kpi
          icon={Inbox}
          titulo="Demandas abertas"
          valor={String(demandas.abertas)}
          detalhe={`${demandas.atrasadas} atrasada${demandas.atrasadas === 1 ? "" : "s"} · ${demandas.emRevisao} em revisão`}
          alerta={demandas.atrasadas > 0}
        />
        <Kpi
          icon={Crosshair}
          titulo="Abaixo da meta"
          valor={metas.comMeta > 0 ? String(metas.abaixo) : "—"}
          detalhe={metas.comMeta > 0
            ? `de ${metas.comMeta} cliente${metas.comMeta === 1 ? "" : "s"} com meta no mês`
            : "Defina a meta na página do cliente"}
          alerta={metas.abaixo > 0}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-400" /> Precisa de atenção
              <span className="text-sm font-normal text-muted-foreground">({atencao.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {atencao.slice(0, 12).map(c => (
              <Link
                key={c.id}
                to={`/clients/${c.id}`}
                className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                {c.motivos.map(m => (
                  <Badge key={m} variant={m === "fatura_vencida" ? "destructive" : "outline"} className="text-[10px]">{MOTIVO_LABEL[m]}</Badge>
                ))}
              </Link>
            ))}
            {atencao.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum cliente pedindo atenção agora.</p>}
            {atencao.length > 12 && <p className="px-3 text-xs text-muted-foreground">+{atencao.length - 12} clientes</p>}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Carga da equipe</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {demandas.carga.map(({ pessoa, abertas, atrasadas }) => {
                const maximo = Math.max(...demandas.carga.map(c => c.abertas), 1);
                return (
                  <Link key={pessoa ?? "sem"} to="/planner" className="block rounded-lg px-1 py-1 hover:bg-muted/30">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate">{pessoa ? nomes.get(pessoa) ?? "—" : "Sem responsável"}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {abertas}{atrasadas > 0 && <span className="text-destructive"> · {atrasadas} atrasada{atrasadas === 1 ? "" : "s"}</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${atrasadas > 0 ? "bg-destructive/70" : "bg-primary/70"}`} style={{ width: `${(abertas / maximo) * 100}%` }} />
                    </div>
                  </Link>
                );
              })}
              {demandas.carga.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma demanda aberta.</p>}
            </CardContent>
          </Card>

          <Link to="/alert-events">
            <Card className="shadow-card transition-colors hover:border-border">
              <CardContent className="flex items-center gap-3 p-5">
                <Bell className={`h-5 w-5 ${alertasAbertos > 0 ? "text-amber-400" : "text-muted-foreground"}`} />
                <div className="flex-1">
                  <div className="text-sm font-medium">Alertas de campanha abertos</div>
                  <div className="text-xs text-muted-foreground">Disparados nos últimos 7 dias e ainda sem resolução</div>
                </div>
                <span className="text-2xl font-semibold tabular-nums">{alertasAbertos}</span>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
