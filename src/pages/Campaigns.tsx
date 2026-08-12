import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { syncClientData } from "@/lib/meta-api";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Eye,
  Filter,
  Flag,
  FolderKanban,
  Heart,
  Lightbulb,
  MousePointerClick,
  PanelsTopLeft,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Target,
  TrendingUp,
} from "lucide-react";

interface Ad {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
}

interface AdSet {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ads: Ad[];
}

interface Campaign {
  id: string;
  client_id: string;
  name: string;
  status: string;
  objective: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  ad_sets: AdSet[];
  client?: {
    name: string;
  } | null;
}

interface Client {
  id: string;
  name: string;
  meta_ad_account_id: string | null;
  meta_token_configured: boolean | null;
}

type PerformanceFilter = "all" | "healthy" | "monitor" | "warning" | "critical" | "no-conversions";
type SortOption = "spend" | "ctr" | "clicks" | "conversions" | "cpc" | "name";
type CampaignAlert = {
  key: string;
  label: string;
  message: string;
  severity: "critical" | "warning" | "info";
  suggestion: string;
};

function getCpa(campaign: Campaign) {
  return campaign.conversions > 0 ? campaign.spend / campaign.conversions : 0;
}

function getHealth(campaign: Campaign) {
  if (campaign.status !== "ACTIVE") {
    return {
      tone: "neutral",
      label: campaign.status === "PAUSED" ? "Em pausa" : "Fora do ar",
      detail: "Nao esta rodando no momento.",
    };
  }

  if (campaign.spend > 300 && campaign.conversions === 0 && campaign.clicks >= 60) {
    return {
      tone: "critical",
      label: "Sem retorno",
      detail: "Gastou bem, recebeu cliques, mas ainda nao converteu.",
    };
  }

  if (campaign.ctr < 1 || campaign.cpc > 5) {
    return {
      tone: "warning",
      label: "Atencao",
      detail: campaign.ctr < 1 ? "CTR abaixo de 1%." : "CPC acima do ideal para escalar.",
    };
  }

  if (campaign.ctr >= 2 && campaign.cpc <= 2.5 && campaign.conversions > 0) {
    return {
      tone: "healthy",
      label: "Saudavel",
      detail: "Boa combinacao de clique e custo.",
    };
  }

  return {
    tone: "monitor",
    label: "Monitorar",
    detail: "Tem tracao, mas ainda merece acompanhamento.",
  };
}

function getHealthBadgeClass(tone: string) {
  if (tone === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "critical") return "border-rose-200 bg-rose-50 text-rose-700";
  if (tone === "monitor") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-border bg-muted text-muted-foreground";
}

function matchesPerformanceFilter(campaign: Campaign, filter: PerformanceFilter) {
  if (filter === "all") return true;
  const health = getHealth(campaign);
  if (filter === "no-conversions") return campaign.status === "ACTIVE" && campaign.spend > 0 && campaign.conversions === 0;
  return health.tone === filter;
}

function sortCampaigns(campaigns: Campaign[], sortBy: SortOption) {
  return [...campaigns].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "ctr") return b.ctr - a.ctr;
    if (sortBy === "clicks") return b.clicks - a.clicks;
    if (sortBy === "conversions") return b.conversions - a.conversions;
    if (sortBy === "cpc") return a.cpc - b.cpc;
    return b.spend - a.spend;
  });
}

function getCampaignAlerts(campaign: Campaign): CampaignAlert[] {
  const alerts: CampaignAlert[] = [];
  const cpa = getCpa(campaign);

  if (campaign.status === "ACTIVE" && campaign.ctr < 1) {
    alerts.push({
      key: "low-ctr",
      label: "CTR baixo",
      message: `CTR em ${formatPercent(campaign.ctr)} indica criativo ou promessa fraca.`,
      severity: "warning",
      suggestion: "Testar novo criativo e nova abertura de copy.",
    });
  }

  if (campaign.status === "ACTIVE" && cpa > 80) {
    alerts.push({
      key: "high-cpa",
      label: "CPA alto",
      message: `CPA em ${formatCurrency(cpa)} acima do ponto confortavel.`,
      severity: "critical",
      suggestion: "Rever publico, evento de conversao e pagina antes de escalar.",
    });
  }

  if (campaign.status === "ACTIVE" && campaign.spend > 300 && campaign.conversions === 0) {
    alerts.push({
      key: "spend-no-result",
      label: "Gasto sem resultado",
      message: `Ja investiu ${formatCurrency(campaign.spend)} sem conversoes.`,
      severity: "critical",
      suggestion: "Pausar ou reduzir verba ate validar oferta e segmentacao.",
    });
  }

  if (campaign.status === "ACTIVE" && campaign.clicks > 100 && campaign.conversions <= 1) {
    alerts.push({
      key: "weak-funnel",
      label: "Funil fraco",
      message: "Recebe clique, mas quase nao transforma em conversao.",
      severity: "warning",
      suggestion: "Revisar pagina, checkout ou formulario.",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      key: "healthy",
      label: "Sem alerta critico",
      message: "A campanha esta dentro de uma faixa mais saudavel para acompanhamento.",
      severity: "info",
      suggestion: "Manter monitoramento e considerar escala gradual se continuar consistente.",
    });
  }

  return alerts;
}

function getSeverityClass(severity: CampaignAlert["severity"]) {
  if (severity === "critical") return "border-rose-200 bg-rose-50 text-rose-700";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

export default function Campaigns() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedClient, setSelectedClient] = useState(() => searchParams.get("client") || "all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [performanceFilter, setPerformanceFilter] = useState<PerformanceFilter>("all");
  const [objectiveFilter, setObjectiveFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("spend");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const [diagnosticCampaign, setDiagnosticCampaign] = useState<Campaign | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setFavoriteIds(JSON.parse(window.localStorage.getItem("campaign-favorites") ?? "[]"));
    setReviewIds(JSON.parse(window.localStorage.getItem("campaign-review-queue") ?? "[]"));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("campaign-favorites", JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("campaign-review-queue", JSON.stringify(reviewIds));
  }, [reviewIds]);

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name, meta_ad_account_id, meta_token_configured")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => setClients((data as Client[]) ?? []));
  }, []);

  useEffect(() => {
    loadCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient]);

  async function loadCampaigns() {
    setLoading(true);
    setOpenId(null);

    let query = supabase
      .from("campaigns")
      .select("*, client:clients(name), ad_sets(*, ads(*))")
      .order("spend", { ascending: false });

    if (selectedClient !== "all") {
      query = query.eq("client_id", selectedClient);
    }

    const { data, error } = await query;
    if (error) toast.error(error.message);
    setCampaigns((data as unknown as Campaign[]) ?? []);
    setLoading(false);
  }

  async function handleSync() {
    if (selectedClient === "all") {
      const connected = clients.filter((client) => client.meta_ad_account_id && client.meta_token_configured);
      if (!connected.length) {
        toast.error("Nenhum cliente conectado ao Meta Ads. Configure em Clientes.");
        return;
      }

      setSyncing(true);
      let errors = 0;

      for (const client of connected) {
        setSyncProgress(`Sincronizando ${client.name}...`);
        try {
          await syncClientData(client.id, client.meta_ad_account_id!, setSyncProgress);
        } catch {
          errors++;
        }
      }

      setSyncing(false);
      setSyncProgress("");

      if (errors) toast.error(`${errors} cliente(s) falharam na sincronizacao`);
      else toast.success("Todos os clientes sincronizados");

      loadCampaigns();
      return;
    }

    const client = clients.find((item) => item.id === selectedClient);
    if (!client?.meta_ad_account_id || !client?.meta_token_configured) {
      toast.error("Este cliente nao esta conectado ao Meta Ads. Configure em Clientes.");
      return;
    }

    setSyncing(true);
    try {
      const result = await syncClientData(
        client.id,
        client.meta_ad_account_id,
        setSyncProgress
      );

      toast.success(
        `Sincronizado! ${result.campaigns} campanhas · ${result.adSets} conjuntos · ${result.ads} anuncios`,
        { duration: 6000 }
      );
      loadCampaigns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na sincronizacao");
    } finally {
      setSyncing(false);
      setSyncProgress("");
    }
  }

  const objectiveOptions = useMemo(() => {
    return [...new Set(campaigns.map((campaign) => campaign.objective).filter(Boolean))].sort();
  }, [campaigns]);

  const filteredCampaigns = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return sortCampaigns(
      campaigns.filter((campaign) => {
        if (statusFilter !== "all" && campaign.status !== statusFilter) return false;
        if (objectiveFilter !== "all" && campaign.objective !== objectiveFilter) return false;
        if (!matchesPerformanceFilter(campaign, performanceFilter)) return false;

        if (!normalizedSearch) return true;

        return [
          campaign.name,
          campaign.objective ?? "",
          campaign.client?.name ?? "",
        ].some((value) => value.toLowerCase().includes(normalizedSearch));
      }),
      sortBy
    );
  }, [campaigns, objectiveFilter, performanceFilter, search, sortBy, statusFilter]);

  const summary = useMemo(() => {
    return filteredCampaigns.reduce(
      (acc, campaign) => {
        const health = getHealth(campaign);
        acc.spend += campaign.spend;
        acc.clicks += campaign.clicks;
        acc.conversions += campaign.conversions;
        if (campaign.status === "ACTIVE") acc.active += 1;
        if (health.tone === "warning" || health.tone === "critical") acc.alerts += 1;
        if (campaign.status === "ACTIVE" && campaign.spend > 0 && campaign.conversions === 0) acc.noConversions += 1;
        return acc;
      },
      { spend: 0, clicks: 0, conversions: 0, active: 0, alerts: 0, noConversions: 0 }
    );
  }, [filteredCampaigns]);

  const topAttention = useMemo(() => {
    return filteredCampaigns
      .filter((campaign) => {
        const tone = getHealth(campaign).tone;
        return tone === "warning" || tone === "critical";
      })
      .slice(0, 3);
  }, [filteredCampaigns]);

  function toggleFavorite(campaignId: string) {
    setFavoriteIds((current) =>
      current.includes(campaignId) ? current.filter((id) => id !== campaignId) : [...current, campaignId]
    );
  }

  function toggleReview(campaignId: string) {
    setReviewIds((current) =>
      current.includes(campaignId) ? current.filter((id) => id !== campaignId) : [...current, campaignId]
    );
  }

  function openCampaignStructure(campaignId: string) {
    setOpenId(campaignId);
  }

  function openCampaignAds(campaignId: string) {
    setOpenId(campaignId);
    window.setTimeout(() => {
      document.getElementById(`campaign-structure-${campaignId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Campanhas</h1>
            <p className="text-sm text-muted-foreground">
              Painel de operacao para encontrar gargalos, campanhas fortes e pontos de otimizacao.
            </p>
          </div>
          {topAttention.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {topAttention.map((campaign) => (
                <Badge
                  key={campaign.id}
                  variant="outline"
                  className={`${getHealthBadgeClass(getHealth(campaign).tone)} max-w-full gap-2 rounded-full px-3 py-1`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="truncate">{campaign.name}</span>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? syncProgress || "Sincronizando..." : "Sincronizar"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-emerald-100 bg-gradient-to-br from-white via-emerald-50/40 to-teal-50/60 shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="rounded-2xl bg-emerald-600 p-3 text-white shadow-sm">
                <Sparkles className="h-5 w-5" />
              </div>
              <Badge variant="outline" className="border-emerald-200 bg-white/80 text-emerald-700">
                {filteredCampaigns.length} no filtro
              </Badge>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">Campanhas ativas</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight">{summary.active}</div>
            <div className="mt-2 text-xs text-muted-foreground">Base ideal para ver o que merece escala agora.</div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                <CircleDollarSign className="h-5 w-5" />
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Investimento</span>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">Gasto acumulado</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight">{formatCurrency(summary.spend)}</div>
            <div className="mt-2 text-xs text-muted-foreground">{formatNumber(summary.clicks)} cliques gerados no filtro.</div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                <TrendingUp className="h-5 w-5" />
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Saude</span>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">Campanhas com alerta</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight">{summary.alerts}</div>
            <div className="mt-2 text-xs text-muted-foreground">CTR baixo, CPC alto ou gasto sem conversao.</div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                <Target className="h-5 w-5" />
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Conversao</span>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">Sem conversao</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight">{summary.noConversions}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              {formatNumber(summary.conversions)} conversoes somadas · {favoriteIds.length} favoritas
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Radar de campanhas</CardTitle>
              <CardDescription>
                Filtre, ordene e encontre rapidamente as campanhas que merecem escala ou intervencao.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              {filteredCampaigns.length} campanha(s) visiveis
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar campanha, cliente ou objetivo"
                className="pl-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="ACTIVE">Ativas</SelectItem>
                <SelectItem value="PAUSED">Pausadas</SelectItem>
                <SelectItem value="DELETED">Excluidas</SelectItem>
              </SelectContent>
            </Select>

            <Select value={objectiveFilter} onValueChange={setObjectiveFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Objetivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os objetivos</SelectItem>
                {objectiveOptions.map((objective) => (
                  <SelectItem key={objective} value={objective!}>
                    {objective}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={performanceFilter} onValueChange={(value) => setPerformanceFilter(value as PerformanceFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="Performance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda a saude</SelectItem>
                <SelectItem value="healthy">Saudaveis</SelectItem>
                <SelectItem value="monitor">Monitorar</SelectItem>
                <SelectItem value="warning">Em atencao</SelectItem>
                <SelectItem value="critical">Criticas</SelectItem>
                <SelectItem value="no-conversions">Sem conversao</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
              <SelectTrigger>
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="spend">Maior gasto</SelectItem>
                <SelectItem value="conversions">Mais conversoes</SelectItem>
                <SelectItem value="clicks">Mais cliques</SelectItem>
                <SelectItem value="ctr">Maior CTR</SelectItem>
                <SelectItem value="cpc">Menor CPC</SelectItem>
                <SelectItem value="name">Nome A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Lista operacional</CardTitle>
          <CardDescription>
            Clique em uma campanha para abrir conjuntos e anuncios com o mesmo contexto de performance.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando campanhas...</div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="space-y-2 p-12 text-center">
              <p className="text-sm text-muted-foreground">Nenhuma campanha encontrada com esses filtros.</p>
              <p className="text-xs text-muted-foreground">
                Ajuste os filtros ou sincronize os clientes em Clientes para atualizar os dados.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Campanha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Saude</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Objetivo</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Cliques</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">CPC</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                  <TableHead className="text-right">CPA</TableHead>
                  <TableHead>Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCampaigns.map((campaign) => {
                  const isOpen = openId === campaign.id;
                  const health = getHealth(campaign);
                  const alerts = getCampaignAlerts(campaign);
                  const conversionShare = campaign.clicks > 0 ? Math.min((campaign.conversions / campaign.clicks) * 100, 100) : 0;
                  const isFavorite = favoriteIds.includes(campaign.id);
                  const inReview = reviewIds.includes(campaign.id);

                  return (
                    <Collapsible key={campaign.id} open={isOpen} asChild>
                      <>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => setOpenId(isOpen ? null : campaign.id)}
                        >
                          <TableCell>
                            <CollapsibleTrigger asChild>
                              <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                            </CollapsibleTrigger>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{campaign.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {campaign.ad_sets?.length ?? 0} conjunto(s) ·{" "}
                                {campaign.ad_sets?.reduce((total, adSet) => total + (adSet.ads?.length ?? 0), 0) ?? 0} anuncio(s)
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {campaign.client?.name ?? "Cliente"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={getHealthBadgeClass(health.tone)}>
                              {health.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={campaign.status} />
                          </TableCell>
                          <TableCell className="max-w-[180px] text-xs text-muted-foreground">
                            {campaign.objective ?? "-"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(campaign.spend)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(campaign.clicks)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatPercent(campaign.ctr)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(campaign.cpc)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(campaign.conversions)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {campaign.conversions > 0 ? formatCurrency(getCpa(campaign)) : "-"}
                          </TableCell>
                          <TableCell onClick={(event) => event.stopPropagation()}>
                            <div className="flex flex-wrap gap-1">
                              <Button variant="outline" size="sm" onClick={() => openCampaignAds(campaign.id)}>
                                <Eye className="mr-1.5 h-3.5 w-3.5" />
                                Ver anuncios
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => openCampaignStructure(campaign.id)}>
                                <FolderKanban className="mr-1.5 h-3.5 w-3.5" />
                                Ver conjuntos
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${campaign.client_id}/reports`)}>
                                <PanelsTopLeft className="mr-1.5 h-3.5 w-3.5" />
                                Relatorio
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setDiagnosticCampaign(campaign)}>
                                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                                Diagnostico IA
                              </Button>
                              <Button
                                variant={isFavorite ? "default" : "outline"}
                                size="sm"
                                onClick={() => toggleFavorite(campaign.id)}
                              >
                                <Heart className={`mr-1.5 h-3.5 w-3.5 ${isFavorite ? "fill-current" : ""}`} />
                                {isFavorite ? "Favorita" : "Favoritar"}
                              </Button>
                              <Button
                                variant={inReview ? "default" : "outline"}
                                size="sm"
                                onClick={() => toggleReview(campaign.id)}
                              >
                                <Flag className="mr-1.5 h-3.5 w-3.5" />
                                {inReview ? "Em revisao" : "Revisar"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        <CollapsibleContent asChild>
                          <TableRow>
                            <TableCell colSpan={13} className="bg-muted/20 p-0">
                              <div id={`campaign-structure-${campaign.id}`} className="grid gap-4 p-4 xl:grid-cols-[1.1fr_1.4fr]">
                                <div className="rounded-2xl border border-border bg-background/80 p-4">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-sm font-medium">Diagnostico rapido</p>
                                      <p className="text-xs text-muted-foreground">{health.detail}</p>
                                    </div>
                                    <Badge variant="outline" className={getHealthBadgeClass(health.tone)}>
                                      {health.label}
                                    </Badge>
                                  </div>

                                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                                        <MousePointerClick className="h-3.5 w-3.5" />
                                        CTR
                                      </div>
                                      <div className="mt-2 text-lg font-semibold">{formatPercent(campaign.ctr)}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {campaign.ctr >= 2 ? "Bom nivel de interesse." : "Criativo ou oferta pedem revisao."}
                                      </div>
                                    </div>

                                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                                        <CircleDollarSign className="h-3.5 w-3.5" />
                                        CPC
                                      </div>
                                      <div className="mt-2 text-lg font-semibold">{formatCurrency(campaign.cpc)}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {campaign.cpc <= 2.5 ? "Custo competitivo para continuar testando." : "Clique caro para o momento."}
                                      </div>
                                    </div>

                                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                                        <Eye className="h-3.5 w-3.5" />
                                        Conversao por clique
                                      </div>
                                      <div className="mt-2 text-lg font-semibold">{conversionShare.toFixed(1)}%</div>
                                      <Progress value={conversionShare} className="mt-3 h-2" />
                                    </div>

                                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                                        <Target className="h-3.5 w-3.5" />
                                        Proxima acao
                                      </div>
                                      <div className="mt-2 text-sm font-medium">
                                        {health.tone === "critical" && "Rever publico, oferta e pagina antes de escalar."}
                                        {health.tone === "warning" && "Testar novo criativo ou angulo para recuperar eficiencia."}
                                        {health.tone === "healthy" && "Boa candidata para escala controlada."}
                                        {health.tone === "monitor" && "Acompanhar mais alguns ciclos antes de decidir."}
                                        {health.tone === "neutral" && "Campanha fora de veiculacao no momento."}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-4 space-y-2">
                                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                                      <Lightbulb className="h-3.5 w-3.5" />
                                      Inteligencia e alertas
                                    </div>
                                    <div className="grid gap-2">
                                      {alerts.map((alert) => (
                                        <div key={alert.key} className={`rounded-xl border p-3 ${getSeverityClass(alert.severity)}`}>
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm font-medium">{alert.label}</div>
                                            <Badge variant="outline" className={getSeverityClass(alert.severity)}>
                                              {alert.severity === "critical" ? "Critico" : alert.severity === "warning" ? "Atencao" : "OK"}
                                            </Badge>
                                          </div>
                                          <div className="mt-1 text-xs opacity-90">{alert.message}</div>
                                          <div className="mt-2 text-xs font-medium">Sugestao: {alert.suggestion}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-border bg-background/80 p-4">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-sm font-medium">Estrutura detalhada</p>
                                      <p className="text-xs text-muted-foreground">
                                        Conjuntos e anuncios ligados a esta campanha.
                                      </p>
                                    </div>
                                    <Badge variant="outline" className="rounded-full">
                                      {campaign.ad_sets?.length ?? 0} conjunto(s)
                                    </Badge>
                                  </div>

                                  {campaign.ad_sets?.length === 0 ? (
                                    <p className="mt-4 text-xs text-muted-foreground">Nenhum conjunto encontrado.</p>
                                  ) : (
                                    <div className="mt-4 space-y-3">
                                      {(campaign.ad_sets ?? []).map((adSet) => (
                                        <div key={adSet.id} className="rounded-xl border border-border/70 bg-muted/10 p-4">
                                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                            <div className="space-y-1">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-medium">{adSet.name}</span>
                                                <StatusBadge status={adSet.status} />
                                              </div>
                                              <div className="text-xs text-muted-foreground">
                                                {formatCurrency(adSet.spend)} · {formatNumber(adSet.impressions)} impressoes ·{" "}
                                                {formatNumber(adSet.clicks)} cliques
                                              </div>
                                            </div>

                                            <Badge variant="outline" className="w-fit rounded-full">
                                              {adSet.ads?.length ?? 0} anuncio(s)
                                            </Badge>
                                          </div>

                                          <div className="mt-3 grid gap-2">
                                            {(adSet.ads ?? []).map((ad) => (
                                              <div
                                                key={ad.id}
                                                className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/80 p-3 sm:flex-row sm:items-center sm:justify-between"
                                              >
                                                <div className="space-y-1">
                                                  <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-medium">{ad.name}</span>
                                                    <StatusBadge status={ad.status} />
                                                  </div>
                                                  <div className="text-xs text-muted-foreground">
                                                    {formatNumber(ad.clicks)} cliques · {formatNumber(ad.impressions)} impressoes
                                                  </div>
                                                </div>
                                                <div className="text-sm font-medium tabular-nums">{formatCurrency(ad.spend)}</div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!diagnosticCampaign} onOpenChange={(open) => !open && setDiagnosticCampaign(null)}>
        <DialogContent className="max-w-2xl">
          {diagnosticCampaign && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Diagnostico IA - {diagnosticCampaign.name}
                </DialogTitle>
                <DialogDescription>
                  Leitura automatica baseada em CTR, CPC, gasto, cliques e conversoes da campanha.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">CTR</div>
                  <div className="mt-2 text-2xl font-semibold">{formatPercent(diagnosticCampaign.ctr)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {diagnosticCampaign.ctr >= 2 ? "Criativo com boa atracao." : "Criativo pedindo novo teste."}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">CPA</div>
                  <div className="mt-2 text-2xl font-semibold">
                    {diagnosticCampaign.conversions > 0 ? formatCurrency(getCpa(diagnosticCampaign)) : "-"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {diagnosticCampaign.conversions > 0 ? "Quanto custa cada conversao." : "Sem base de conversao suficiente."}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Status sugerido</div>
                  <div className="mt-2 flex items-center gap-2 text-2xl font-semibold">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    {getHealth(diagnosticCampaign).label}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{getHealth(diagnosticCampaign).detail}</div>
                </div>
              </div>

              <div className="space-y-3">
                {getCampaignAlerts(diagnosticCampaign).map((alert) => (
                  <div key={alert.key} className={`rounded-2xl border p-4 ${getSeverityClass(alert.severity)}`}>
                    <div className="flex items-center gap-2">
                      {alert.severity === "critical" ? <AlertTriangle className="h-4 w-4" /> : <Star className="h-4 w-4" />}
                      <div className="font-medium">{alert.label}</div>
                    </div>
                    <p className="mt-2 text-sm">{alert.message}</p>
                    <p className="mt-2 text-sm font-medium">Acao recomendada: {alert.suggestion}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
