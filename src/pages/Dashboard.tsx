import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowDown, ArrowUp, DollarSign, Eye, MousePointerClick, Percent, Target, TrendingUp, MessageCircle, Phone, MapPin, UserPlus, Users, Repeat, Heart, Radio, Info } from "lucide-react";
import { subDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { GOAL_KPIS, LOCAL_METRIC_LABELS, goalLabel, type LocalGoal, type LocalMetricKey } from "@/lib/local-business";
import { fetchAccountReachFrequency, fetchSocialPresence, type ReachFrequency, type SocialPresence } from "@/lib/meta-insights";

type Period = "7" | "14" | "30";

interface Client {
  id: string;
  name: string;
  primary_goal: string | null;
}

const LOCAL_METRIC_ICONS: Record<LocalMetricKey, typeof MessageCircle> = {
  messages: MessageCircle,
  calls: Phone,
  directions: MapPin,
  leads: UserPlus,
  profileVisits: Eye,
};

// Métrica zerada não significa erro: a Meta só devolve cada evento quando o
// anúncio tem o formato/placement correspondente. Explicitar isso evita que o
// card "sumido" seja lido como bug de integração.
const LOCAL_METRIC_HINTS: Record<LocalMetricKey, string> = {
  messages: "A Meta só registra conversas em campanhas de mensagens (WhatsApp, Direct ou Messenger).",
  calls: "Só é registrado em anúncios com botão de ligar.",
  directions: "Só é registrado em anúncios com endereço ou botão de rota/localização.",
  leads: "Só é registrado em campanhas de cadastro (formulário de leads ou conversão de lead no site).",
  profileVisits: "Só é registrado em anúncios veiculados no Instagram. Campanhas apenas no Facebook ou WhatsApp não geram esse evento.",
};

const SYNC_HINT = "Se a conta roda esse tipo de anúncio, sincronize o cliente novamente em Clientes.";

function MetricHint({ text }: { text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Por que esta métrica está vazia?"
          className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 text-xs leading-relaxed">{text}</PopoverContent>
    </Popover>
  );
}

interface Campaign {
  id: string;
  client_id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
}

interface DailyMetric {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  messages: number;
  calls: number;
  directions: number;
  leads: number;
  profile_visits: number;
}

interface SeriesPoint {
  label: string;
  spend: number;
  clicks: number;
}

function aggregateMetrics(rows: DailyMetric[]) {
  return rows.reduce(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      messages: acc.messages + (r.messages || 0),
      calls: acc.calls + (r.calls || 0),
      directions: acc.directions + (r.directions || 0),
      leads: acc.leads + (r.leads || 0),
      profileVisits: acc.profileVisits + (r.profile_visits || 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, messages: 0, calls: 0, directions: 0, leads: 0, profileVisits: 0 }
  );
}

function pctDelta(curr: number, prev: number): number {
  if (!prev) return 0;
  return ((curr - prev) / prev) * 100;
}

export default function Dashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<string>("all");
  const [period, setPeriod] = useState<Period>("30");
  const [reachFreq, setReachFreq] = useState<ReachFrequency | null>(null);
  const [social, setSocial] = useState<SocialPresence | null>(null);
  const [richLoading, setRichLoading] = useState(false);

  const clientId = client === "all" ? undefined : client;
  const periodDays = Number(period);

  // Load clients once
  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name, primary_goal")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => setClients(data ?? []));
  }, []);

  // Load campaigns + daily metrics when client/period changes
  useEffect(() => {
    async function load() {
      setLoading(true);

      // Campaigns
      let campQuery = supabase.from("campaigns").select("*").order("spend", { ascending: false });
      if (clientId) campQuery = campQuery.eq("client_id", clientId);
      const { data: campData } = await campQuery;
      setCampaigns((campData as Campaign[]) ?? []);

      // Daily metrics: fetch 2x period to compute deltas
      const startDate = format(subDays(new Date(), periodDays * 2), "yyyy-MM-dd");
      let metricsQuery = supabase
        .from("campaign_daily_metrics")
        .select("date, spend, impressions, clicks, messages, calls, directions, leads, profile_visits")
        .gte("date", startDate)
        .order("date");
      if (clientId) metricsQuery = metricsQuery.eq("client_id", clientId);
      const { data: metricsData } = await metricsQuery;

      // Aggregate multi-client rows per day
      const byDate = new Map<string, DailyMetric>();
      for (const r of (metricsData ?? []) as DailyMetric[]) {
        const existing = byDate.get(r.date);
        if (existing) {
          existing.spend += r.spend;
          existing.impressions += r.impressions;
          existing.clicks += r.clicks;
          existing.messages += r.messages || 0;
          existing.calls += r.calls || 0;
          existing.directions += r.directions || 0;
          existing.leads += r.leads || 0;
          existing.profile_visits += r.profile_visits || 0;
        } else {
          byDate.set(r.date, { ...r });
        }
      }
      setDailyMetrics([...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)));

      setLoading(false);
    }
    load();
  }, [clientId, periodDays]);

  // Alcance/frequência e presença social: busca ao vivo na Meta, só com 1 cliente selecionado
  useEffect(() => {
    if (!clientId) {
      setReachFreq(null);
      setSocial(null);
      setRichLoading(false);
      return;
    }
    let active = true;
    setRichLoading(true);
    (async () => {
      const { data: c } = await supabase
        .from("clients")
        .select("meta_ad_account_id, meta_access_token, meta_page_id, meta_page_name, meta_instagram_account_id, meta_instagram_username, logo_url")
        .eq("id", clientId)
        .maybeSingle();

      if (!c?.meta_ad_account_id || !c?.meta_access_token) {
        if (active) {
          setReachFreq(null);
          setSocial(null);
          setRichLoading(false);
        }
        return;
      }

      const until = format(new Date(), "yyyy-MM-dd");
      const since = format(subDays(new Date(), periodDays), "yyyy-MM-dd");
      try {
        const [rf, sp] = await Promise.all([
          fetchAccountReachFrequency(c.meta_ad_account_id, c.meta_access_token, since, until).catch(() => null),
          fetchSocialPresence({
            pageId: c.meta_page_id,
            pageName: c.meta_page_name,
            instagramAccountId: c.meta_instagram_account_id,
            instagramUsername: c.meta_instagram_username,
            accessToken: c.meta_access_token,
            logoUrl: c.logo_url,
            since,
            until,
          }).catch(() => null),
        ]);
        if (active) {
          setReachFreq(rf);
          setSocial(sp);
        }
      } finally {
        if (active) setRichLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [clientId, periodDays]);

  // Split daily metrics into current vs previous period for delta calculation
  const { currentSeries, currentAgg, prevAgg } = useMemo(() => {
    const cutoff = format(subDays(new Date(), periodDays), "yyyy-MM-dd");
    const current = dailyMetrics.filter((d) => d.date >= cutoff);
    const prev = dailyMetrics.filter((d) => d.date < cutoff);
    return {
      currentSeries: current,
      currentAgg: aggregateMetrics(current),
      prevAgg: aggregateMetrics(prev),
    };
  }, [dailyMetrics, periodDays]);

  // KPI metrics from campaigns (lifetime) + deltas from daily series
  const campAgg = useMemo(() => {
    return campaigns.reduce(
      (acc, c) => ({
        spend: acc.spend + c.spend,
        impressions: acc.impressions + c.impressions,
        clicks: acc.clicks + c.clicks,
      }),
      { spend: 0, impressions: 0, clicks: 0 }
    );
  }, [campaigns]);

  const kpiMetrics = {
    spend: currentAgg.spend || campAgg.spend,
    impressions: currentAgg.impressions || campAgg.impressions,
    clicks: currentAgg.clicks || campAgg.clicks,
    ctr: currentAgg.impressions ? (currentAgg.clicks / currentAgg.impressions) * 100
      : campAgg.impressions ? (campAgg.clicks / campAgg.impressions) * 100 : 0,
    cpc: currentAgg.clicks ? currentAgg.spend / currentAgg.clicks
      : campAgg.clicks ? campAgg.spend / campAgg.clicks : 0,
    cpm: currentAgg.impressions ? (currentAgg.spend / currentAgg.impressions) * 1000
      : campAgg.impressions ? (campAgg.spend / campAgg.impressions) * 1000 : 0,
  };

  const prevCtr = prevAgg.impressions ? (prevAgg.clicks / prevAgg.impressions) * 100 : 0;
  const prevCpc = prevAgg.clicks ? prevAgg.spend / prevAgg.clicks : 0;
  const prevCpm = prevAgg.impressions ? (prevAgg.spend / prevAgg.impressions) * 1000 : 0;

  const kpis = [
    { label: "Gasto total", value: formatCurrency(kpiMetrics.spend), delta: pctDelta(currentAgg.spend, prevAgg.spend), icon: DollarSign, lowerIsBetter: false },
    { label: "Impressões", value: formatNumber(kpiMetrics.impressions), delta: pctDelta(currentAgg.impressions, prevAgg.impressions), icon: Eye, lowerIsBetter: false },
    { label: "Cliques", value: formatNumber(kpiMetrics.clicks), delta: pctDelta(currentAgg.clicks, prevAgg.clicks), icon: MousePointerClick, lowerIsBetter: false },
    { label: "CPM", value: formatCurrency(kpiMetrics.cpm), delta: pctDelta(kpiMetrics.cpm, prevCpm), icon: TrendingUp, lowerIsBetter: true },
    { label: "CPC", value: formatCurrency(kpiMetrics.cpc), delta: pctDelta(kpiMetrics.cpc, prevCpc), icon: Target, lowerIsBetter: true },
    { label: "CTR", value: formatPercent(kpiMetrics.ctr), delta: pctDelta(kpiMetrics.ctr, prevCtr), icon: Percent, lowerIsBetter: false },
  ];

  const localTotals: Record<LocalMetricKey, number> = {
    messages: currentAgg.messages,
    calls: currentAgg.calls,
    directions: currentAgg.directions,
    leads: currentAgg.leads,
    profileVisits: currentAgg.profileVisits,
  };
  const prevLocalTotals: Record<LocalMetricKey, number> = {
    messages: prevAgg.messages,
    calls: prevAgg.calls,
    directions: prevAgg.directions,
    leads: prevAgg.leads,
    profileVisits: prevAgg.profileVisits,
  };

  const selectedGoal = clientId ? (clients.find((c) => c.id === clientId)?.primary_goal as LocalGoal | null) : null;
  const orderedLocalKeys: LocalMetricKey[] = selectedGoal && GOAL_KPIS[selectedGoal]
    ? [...GOAL_KPIS[selectedGoal], ...(["messages", "calls", "directions", "leads", "profileVisits"] as LocalMetricKey[]).filter((k) => !GOAL_KPIS[selectedGoal].includes(k))]
    : ["messages", "calls", "directions", "leads", "profileVisits"];

  const primaryKey = orderedLocalKeys[0];

  // Todas as métricas locais são exibidas sempre: as zeradas mostram "—" com o
  // motivo, para distinguir "não houve resultado" de "não está configurado".
  const localKpis = orderedLocalKeys.map((key) => {
    const total = localTotals[key];
    return {
      key,
      label: LOCAL_METRIC_LABELS[key],
      value: total > 0 ? formatNumber(total) : "—",
      empty: total === 0,
      hint: total === 0 ? `${LOCAL_METRIC_HINTS[key]} ${SYNC_HINT}` : null,
      delta: pctDelta(total, prevLocalTotals[key]),
      icon: LOCAL_METRIC_ICONS[key],
    };
  });

  const primaryResults = localTotals[primaryKey];
  const costPerPrimary = primaryResults > 0 ? currentAgg.spend / primaryResults : 0;

  const hasInstagram = social?.sources?.includes("Instagram") ?? false;
  const socialHint = (metric: string) =>
    hasInstagram
      ? `A Meta não retornou ${metric} para este perfil no período.`
      : "Nenhum perfil do Instagram vinculado a este cliente. Vincule em Clientes > editar cliente > Perfil do Instagram.";

  const richStats: { key: string; label: string; value: string; icon: typeof Users; hint?: string | null }[] = [];
  if (reachFreq) {
    richStats.push({ key: "reach", label: "Alcance", value: formatNumber(reachFreq.reach), icon: Radio });
    richStats.push({ key: "freq", label: "Frequência", value: reachFreq.frequency.toFixed(2), icon: Repeat });
  }
  if (social) {
    const socialStat = (key: string, label: string, value: number | null | undefined, icon: typeof Users, metric: string) =>
      richStats.push({
        key,
        label,
        value: value != null ? formatNumber(value) : "—",
        icon,
        hint: value != null ? null : socialHint(metric),
      });

    socialStat("followers", "Seguidores", social.followers, Users, "seguidores");
    socialStat("pviews", "Visitas no perfil", social.profileViews, Eye, "visitas no perfil (profile_views)");
    socialStat("sreach", "Alcance social", social.reach, Radio, "alcance");
    socialStat("eng", "Engajamento", social.engagement, Heart, "engajamento");
  }

  // Chart series
  const chartSeries: SeriesPoint[] = useMemo(() => {
    return currentSeries.map((d) => ({
      label: format(new Date(d.date + "T00:00:00"), "dd/MM", { locale: ptBR }),
      spend: d.spend,
      clicks: d.clicks,
    }));
  }, [currentSeries]);

  const hasData = campaigns.length > 0 || dailyMetrics.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral das suas campanhas Meta Ads</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={client} onValueChange={setClient}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList>
              <TabsTrigger value="7">7d</TabsTrigger>
              <TabsTrigger value="14">14d</TabsTrigger>
              <TabsTrigger value="30">30d</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
      ) : !hasData ? (
        <Card className="shadow-card">
          <CardContent className="p-12 text-center space-y-2">
            <p className="text-sm text-muted-foreground">Nenhum dado encontrado.</p>
            <p className="text-xs text-muted-foreground">
              Conecte um cliente ao Meta Ads em{" "}
              <a href="/clients" className="text-primary underline">Clientes</a>
              {" "}e sincronize para ver os dados aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {kpis.map((k) => (
              <Card key={k.label} className="shadow-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</span>
                    <k.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="mt-2 text-xl font-semibold tabular-nums">{k.value}</div>
                  {k.delta !== 0 && (
                    <div
                      className={`mt-1 flex items-center gap-1 text-xs ${
                        (k.delta >= 0 && !k.lowerIsBetter) || (k.delta < 0 && k.lowerIsBetter)
                          ? "text-success"
                          : "text-destructive"
                      }`}
                    >
                      {k.delta >= 0 ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )}
                      {Math.abs(k.delta).toFixed(1)}% vs período anterior
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Resultados locais */}
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resultados de negócio local</CardTitle>
              <CardDescription>
                {selectedGoal
                  ? `Objetivo principal: ${goalLabel(selectedGoal)} · custo por ${LOCAL_METRIC_LABELS[primaryKey].toLowerCase()}: ${primaryResults > 0 ? formatCurrency(costPerPrimary) : "-"}`
                  : "Conversas, ligações, rotas, leads e visitas no perfil no período"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                {localKpis.map((k) => (
                  <div
                    key={k.key}
                    className={`rounded-xl border border-slate-100 p-4 ${k.empty ? "bg-slate-50/30" : "bg-slate-50/60"}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</span>
                      <div className="flex shrink-0 items-center gap-1">
                        {k.hint && <MetricHint text={k.hint} />}
                        <k.icon className={`h-4 w-4 ${k.empty ? "text-muted-foreground/50" : "text-primary"}`} />
                      </div>
                    </div>
                    <div className={`mt-2 text-xl font-semibold tabular-nums ${k.empty ? "text-muted-foreground/60" : ""}`}>
                      {k.value}
                    </div>
                    {k.delta !== 0 && (
                      <div className={`mt-1 flex items-center gap-1 text-xs ${k.delta >= 0 ? "text-success" : "text-destructive"}`}>
                        {k.delta >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                        {Math.abs(k.delta).toFixed(1)}% vs período anterior
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Alcance e presença social (apenas com 1 cliente selecionado) */}
          {clientId && (
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Alcance e presença social</CardTitle>
                <CardDescription>
                  Dados ao vivo da Meta para o período selecionado
                  {social?.sources?.length ? ` · Fontes: ${social.sources.join(" + ")}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {richLoading ? (
                  <p className="py-4 text-sm text-muted-foreground animate-pulse">Buscando dados na Meta...</p>
                ) : richStats.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    Sem dados de alcance/presença disponíveis. Verifique a conexão Meta do cliente (token válido e permissões do Instagram).
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                    {richStats.map((s) => (
                      <div
                        key={s.key}
                        className={`rounded-xl border border-slate-100 p-4 ${s.hint ? "bg-slate-50/30" : "bg-slate-50/60"}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</span>
                          <div className="flex shrink-0 items-center gap-1">
                            {s.hint && <MetricHint text={s.hint} />}
                            <s.icon className={`h-4 w-4 ${s.hint ? "text-muted-foreground/50" : "text-primary"}`} />
                          </div>
                        </div>
                        <div className={`mt-2 text-xl font-semibold tabular-nums ${s.hint ? "text-muted-foreground/60" : ""}`}>
                          {s.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!richLoading && reachFreq && !social && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Presença social indisponível: nenhuma Página do Facebook ou perfil do Instagram vinculado a este cliente.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Chart */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Evolução: gasto e cliques</CardTitle>
              <CardDescription>Últimos {period} dias</CardDescription>
            </CardHeader>
            <CardContent>
              {chartSeries.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Sincronize os dados para ver o gráfico de evolução.
                </p>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartSeries} margin={{ left: 10, right: 10, top: 10 }}>
                      <defs>
                        <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(24 95% 55%)" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="hsl(24 95% 55%)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="clicksFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(28 100% 65%)" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="hsl(28 100% 65%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(value: number, name: string) =>
                          name === "spend" ? [formatCurrency(value), "Gasto"] : [formatNumber(value), "Cliques"]
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area yAxisId="left" type="monotone" dataKey="spend" name="Gasto"
                        stroke="hsl(24 95% 55%)" strokeWidth={2} fill="url(#spendFill)" />
                      <Area yAxisId="right" type="monotone" dataKey="clicks" name="Cliques"
                        stroke="hsl(28 100% 65%)" strokeWidth={2} fill="url(#clicksFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Campaigns table */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Campanhas</CardTitle>
              <CardDescription>{campaigns.length} campanha(s)</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Gasto</TableHead>
                    <TableHead className="text-right">Impressões</TableHead>
                    <TableHead className="text-right">Cliques</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(c.spend)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(c.impressions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(c.clicks)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(c.ctr)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(c.cpc)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
