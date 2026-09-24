import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Megaphone,
  ShieldCheck,
  Bell,
  ArrowRight,
  IdCard,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { ClientAvatar } from "@/components/ClientAvatar";
import { ClientFundingPanel } from "@/components/clients/ClientFundingPanel";
import { ClientBriefingCard } from "@/components/clients/ClientBriefingCard";
import { supabase } from "@/integrations/supabase/client";
import { loadLatestAudit } from "@/lib/audit/runner";
import type { AuditReport } from "@/lib/audit/types";

interface ClientRow {
  id: string;
  name: string;
  logo_url: string | null;
  status: string;
  meta_sync_status: string;
  meta_ad_account_id: string | null;
  whatsapp_number: string | null;
  whatsapp_group_jid: string | null;
  business_segment: string | null;
  primary_goal: string | null;
  meta_balance_cents: number | null;
  meta_balance_label: string | null;
  meta_funding_type: number | null;
  meta_balance_at: string | null;
  cnpj: string | null;
  email: string | null;
  responsavel_nome: string | null;
}

interface Performance {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
}

interface OpenAlert {
  id: string;
  entity_name: string | null;
  triggered_at: string;
  alerts: { name: string } | null;
}

interface LastReport {
  status: string;
  created_at: string;
}

function fmtBRL(v: number) {
  return `R$ ${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}
function fmtNum(v: number) {
  return v.toLocaleString("pt-BR");
}
function fmtPct(v: number) {
  return `${v.toFixed(2).replace(".", ",")}%`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function scoreTone(score: number) {
  if (score >= 80) return { badge: "border-emerald-200 bg-emerald-50 text-emerald-700", label: "Saudável" };
  if (score >= 60) return { badge: "border-amber-200 bg-amber-50 text-amber-700", label: "Atenção" };
  return { badge: "border-rose-200 bg-rose-50 text-rose-700", label: "Crítico" };
}

async function loadPerformance(clientId: string): Promise<Performance> {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 6);

  const { data } = await supabase
    .from("campaign_daily_metrics")
    .select("spend, impressions, clicks")
    .eq("client_id", clientId)
    .gte("date", from.toISOString().split("T")[0])
    .lte("date", to.toISOString().split("T")[0]);

  const totals = (data ?? []).reduce(
    (acc, row) => ({
      spend: acc.spend + (row.spend ?? 0),
      impressions: acc.impressions + (row.impressions ?? 0),
      clicks: acc.clicks + (row.clicks ?? 0),
    }),
    { spend: 0, impressions: 0, clicks: 0 }
  );

  return {
    ...totals,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
    cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
  };
}

export default function ClientHub() {
  const { id: clientId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<ClientRow | null>(null);
  const [audit, setAudit] = useState<AuditReport | null>(null);
  const [perf, setPerf] = useState<Performance | null>(null);
  const [openAlerts, setOpenAlerts] = useState<OpenAlert[]>([]);
  const [openAlertsCount, setOpenAlertsCount] = useState(0);
  const [lastReport, setLastReport] = useState<LastReport | null>(null);

  useEffect(() => {
    if (clientId) load(clientId);
  }, [clientId]);

  async function load(id: string) {
    setLoading(true);
    const [clientRes, auditRes, perfRes, alertsRes, alertsCountRes, reportRes] = await Promise.all([
      supabase.from("clients").select("*").eq("id", id).single(),
      loadLatestAudit(id),
      loadPerformance(id),
      supabase
        .from("alert_events")
        .select("id, entity_name, triggered_at, alerts!inner(name, client_id)")
        .eq("alerts.client_id", id)
        .eq("status", "open")
        .order("triggered_at", { ascending: false })
        .limit(5),
      supabase
        .from("alert_events")
        .select("id, alerts!inner(client_id)", { count: "exact", head: true })
        .eq("alerts.client_id", id)
        .eq("status", "open"),
      supabase
        .from("reports")
        .select("status, created_at")
        .eq("client_id", id)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    setClient(clientRes.data as ClientRow | null);
    setAudit(auditRes);
    setPerf(perfRes);
    setOpenAlerts((alertsRes.data as any) ?? []);
    setOpenAlertsCount(alertsCountRes.count ?? 0);
    setLastReport(reportRes.data?.[0] ?? null);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Cliente não encontrado.</p>
      </div>
    );
  }

  const isActive = client.status === "active";
  const isConnected = !!client.meta_ad_account_id && client.meta_sync_status !== "pending";
  const hasWhatsapp = !!client.whatsapp_number || !!client.whatsapp_group_jid;
  const tone = audit ? scoreTone(audit.score) : null;
  const cadastroCompleto = !!client.responsavel_nome && !!client.email && !!client.cnpj;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/clients")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 min-w-0">
          <ClientAvatar name={client.name} logoUrl={client.logo_url} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{client.name}</h1>
            <div className="flex flex-wrap gap-2 mt-1">
              <Badge variant="outline" className={isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}>
                {isActive ? "Ativo" : "Inativo"}
              </Badge>
              <Badge variant="outline" className={isConnected ? "border-sky-200 bg-sky-50 text-sky-700" : "border-slate-200 bg-slate-50 text-slate-500"}>
                {isConnected ? "Meta conectada" : "Sem Meta"}
              </Badge>
              {!cadastroCompleto && (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                  Cadastro incompleto
                </Badge>
              )}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" asChild>
          <Link to={`/clients/${clientId}/cadastro`}>
            <IdCard className="mr-2 h-4 w-4" /> Cadastro e acessos
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Performance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <Megaphone className="h-4 w-4" /> Performance (7 dias)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {perf && perf.impressions + perf.clicks + perf.spend > 0 ? (
              <>
                <p className="text-2xl font-bold">{fmtBRL(perf.spend)}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtNum(perf.impressions)} impressões · {fmtNum(perf.clicks)} cliques
                </p>
                <p className="text-xs text-muted-foreground">
                  CTR {fmtPct(perf.ctr)} · CPC {fmtBRL(perf.cpc)}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Sem dados no período</p>
            )}
            <Button variant="outline" size="sm" className="w-full mt-2" asChild>
              <Link to="/campaigns">Ver campanhas <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </CardContent>
        </Card>

        {/* Auditoria */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <ShieldCheck className="h-4 w-4" /> Auditoria
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {audit && tone ? (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold">{audit.score}</p>
                  <Badge variant="outline" className={tone.badge}>{tone.label}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Última auditoria: {fmtDate(audit.runAt)}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma auditoria ainda</p>
            )}
            <Button variant="outline" size="sm" className="w-full mt-2" asChild>
              <Link to={`/clients/${clientId}/audit`}>Ver auditoria <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </CardContent>
        </Card>

        {/* Alertas */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <Bell className="h-4 w-4" /> Alertas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{openAlertsCount}</p>
              <span className="text-xs text-muted-foreground">aberto(s)</span>
            </div>
            {openAlerts.length > 0 ? (
              <ul className="space-y-1">
                {openAlerts.slice(0, 3).map(a => (
                  <li key={a.id} className="text-xs text-muted-foreground truncate">
                    • {a.alerts?.name ?? "Alerta"} — {a.entity_name ?? ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum alerta aberto</p>
            )}
            <Button variant="outline" size="sm" className="w-full mt-2" asChild>
              <Link to="/alert-events">Ver alertas <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </CardContent>
        </Card>

        {/* WhatsApp / Relatórios */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <WhatsAppIcon className="h-4 w-4 text-green-600" /> WhatsApp / Relatórios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge variant="outline" className={hasWhatsapp ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}>
              {hasWhatsapp ? "WhatsApp configurado" : "WhatsApp pendente"}
            </Badge>
            {lastReport ? (
              <p className="text-xs text-muted-foreground">
                Último relatório: {fmtDate(lastReport.created_at)} ({lastReport.status})
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum relatório gerado ainda</p>
            )}
            <Button variant="outline" size="sm" className="w-full mt-2" asChild>
              <Link to={`/clients/${clientId}/reports`}>Ver relatórios <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <ClientBriefingCard
        clientId={client.id}
        clientName={client.name}
        segment={client.business_segment}
        primaryGoal={client.primary_goal}
      />

      {client.meta_ad_account_id && (
        <ClientFundingPanel
          clientId={client.id}
          balanceCents={client.meta_balance_cents}
          balanceLabel={client.meta_balance_label}
          fundingType={client.meta_funding_type}
          balanceAt={client.meta_balance_at}
        />
      )}
    </div>
  );
}
