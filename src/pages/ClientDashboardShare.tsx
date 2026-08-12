import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ScaleAdsLogo } from "@/components/ScaleAdsLogo";
import { ClientAvatar } from "@/components/ClientAvatar";

interface DashboardData {
  client: { name: string; logoUrl: string | null; businessSegment: string | null };
  summary: { spend: number; clicks: number; impressions: number; ctr: number; cpm: number; cpc: number };
  monthlyBudget: number | null;
  budgetPct: number | null;
  dailySeries: { date: string; spend: number; clicks: number; impressions: number }[];
  campaigns: { name: string; status: string; spend: number; impressions: number; clicks: number; ctr: number }[];
  lastSyncAt: string | null;
}

function fmtCurrency(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(value: number) {
  return value.toLocaleString("pt-BR");
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 text-center">
        <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 text-xs text-muted-foreground">
        {label ? format(new Date(label), "dd MMM", { locale: ptBR }) : ""}
      </p>
      <p className="font-semibold">{fmtCurrency(payload[0].value)}</p>
    </div>
  );
}

export default function ClientDashboardShare() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (token) fetchData();
  }, [token]);

  async function fetchData() {
    const { data: result, error } = await supabase.functions.invoke("get-client-dashboard", { body: { token } });
    if (error || !result || result.error) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setData(result as DashboardData);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 p-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <Skeleton className="h-16 w-2/3" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[1, 2, 3, 4, 5].map((item) => (
              <Skeleton key={item} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="space-y-3 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
          <h1 className="text-xl font-bold">Dashboard não encontrado</h1>
          <p className="text-sm text-muted-foreground">Este link pode estar incorreto.</p>
        </div>
      </div>
    );
  }

  const { client, summary, campaigns, dailySeries, budgetPct, lastSyncAt } = data;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-background px-4 py-6 md:px-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-4">
            <ClientAvatar name={client.name} logoUrl={client.logoUrl} className="h-14 w-14" />
            <div>
              <h1 className="text-2xl font-bold">{client.name}</h1>
              <p className="text-sm text-muted-foreground">Desempenho das campanhas — últimos 30 dias</p>
            </div>
          </div>
          <div className="hidden opacity-60 md:block">
            <ScaleAdsLogo size={28} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <KpiCard label="Investido" value={fmtCurrency(summary.spend)} />
          <KpiCard label="Impressões" value={fmtNum(summary.impressions)} />
          <KpiCard label="Cliques" value={fmtNum(summary.clicks)} />
          <KpiCard label="CTR" value={`${summary.ctr.toFixed(2)}%`} />
          <KpiCard label="CPC" value={fmtCurrency(summary.cpc)} />
        </section>

        {budgetPct !== null && (
          <Card>
            <CardContent className="flex items-center justify-between pt-5 pb-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Verba mensal consumida</p>
                <p className="text-lg font-semibold">
                  {fmtCurrency(summary.spend)} <span className="text-muted-foreground">de {fmtCurrency(data.monthlyBudget!)}</span>
                </p>
              </div>
              <Badge variant={budgetPct >= 100 ? "destructive" : budgetPct >= 80 ? "secondary" : "default"} className="text-sm">
                {budgetPct.toFixed(0)}%
              </Badge>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Investimento diário</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySeries} margin={{ left: 4, right: 12, top: 8 }}>
                <defs>
                  <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(160 84% 44%)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(160 84% 44%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickFormatter={(value) => format(new Date(value), "dd/MM")}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} width={40} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="spend" stroke="hsl(160 84% 44%)" strokeWidth={2} fill="url(#spendFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {campaigns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campanhas ativas</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-left font-medium">Campanha</th>
                      <th className="p-3 text-right font-medium">Investimento</th>
                      <th className="p-3 text-right font-medium">CTR</th>
                      <th className="p-3 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((campaign, index) => (
                      <tr key={index} className={index % 2 === 1 ? "bg-muted/20" : ""}>
                        <td className="max-w-[220px] truncate p-3">{campaign.name}</td>
                        <td className="p-3 text-right">{fmtCurrency(campaign.spend)}</td>
                        <td className="p-3 text-right">{campaign.ctr.toFixed(2)}%</td>
                        <td className="p-3 text-right">
                          <Badge variant={campaign.status === "ACTIVE" ? "default" : "secondary"}>
                            {campaign.status === "ACTIVE" ? "Ativa" : campaign.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          {lastSyncAt
            ? `Atualizado em ${format(new Date(lastSyncAt), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}`
            : "Aguardando primeira sincronização"}
        </p>
      </div>
    </div>
  );
}
