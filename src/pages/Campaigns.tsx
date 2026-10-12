import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatNumber } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { syncClientData } from "@/lib/meta-api";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  BrainCircuit,
  ChevronRight,
  CircleDollarSign,
  Eye,
  Filter,
  Flag,
  FolderKanban,
  Heart,
  Lightbulb,
  ListChecks,
  Megaphone,
  MessageCircle,
  PanelsTopLeft,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { credencialDoCliente } from "@/lib/meta-fetch";
import { useEstadoDaTela } from "@/hooks/useEstadoDaTela";
import {
  GASTO_MINIMO,
  GRUPOS,
  KPI_DEF,
  KPIS_POR_GRUPO,
  RESULTADO_POR_GRUPO,
  alcanceEstimado,
  analisarCampanhas,
  formatarKpi,
  labelGrupo,
  resultadoDaCampanha,
  resumirCliente,
  severidadeDaCampanha,
  valorKpi,
  type AnaliseCampanha,
  type AnuncioEntrada,
  type CampanhaEntrada,
  type GrupoObjetivo,
  type ResumoCliente,
} from "@/lib/analise-campanhas";
import { CartaoAchado, KpisDaCampanha, PainelInteligencia } from "@/components/campanhas/PainelInteligencia";
import { useDadosInteligencia } from "@/components/campanhas/useDadosInteligencia";

interface Ad {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  messages: number;
  frequency: number | null;
}

interface AdSet {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  messages: number;
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
  messages: number;
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
type Tone = "healthy" | "monitor" | "warning" | "critical" | "neutral";

const VAZIA: AnaliseCampanha["achados"] = [];

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function conversationLabel(count: number) {
  return count === 1 ? "1 conversa" : `${formatNumber(count)} conversas`;
}

// Alcance e frequencia nao existem na tabela de campanhas: saem dos anuncios.
function paraEntrada(c: Campaign): CampanhaEntrada {
  const ads = (c.ad_sets ?? []).flatMap(s => s.ads ?? []);
  const { alcance, frequencia } = alcanceEstimado(ads);
  return { ...c, reach: alcance, frequency: frequencia };
}

/** Saude da linha = pior achado da inteligencia, entao lista e painel nunca discordam. */
function getHealth(c: CampanhaEntrada, achados: AnaliseCampanha["achados"]): { tone: Tone; label: string; detail: string } {
  if (c.status !== "ACTIVE") {
    return { tone: "neutral", label: c.status === "PAUSED" ? "Em pausa" : "Fora do ar", detail: "Não está rodando no momento." };
  }
  const sev = severidadeDaCampanha(achados);
  const primeiro = achados.find(a => a.severidade === sev);
  if (sev === "critico") return { tone: "critical", label: "Crítica", detail: primeiro?.titulo ?? "" };
  if (sev === "atencao") return { tone: "warning", label: "Atenção", detail: primeiro?.titulo ?? "" };
  if (sev === "oportunidade") return { tone: "healthy", label: "Escalar", detail: primeiro?.titulo ?? "" };
  const r = resultadoDaCampanha(c);
  if (Number(c.spend) < GASTO_MINIMO) return { tone: "monitor", label: "Pouco dado", detail: "Gasto ainda baixo para avaliar." };
  if ((r.volume ?? 0) > 0) return { tone: "healthy", label: "Saudável", detail: "Dentro do esperado para o objetivo." };
  return { tone: "monitor", label: "Monitorar", detail: "Tem tração, mas ainda merece acompanhamento." };
}

function getHealthBadgeClass(tone: Tone) {
  if (tone === "healthy") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  if (tone === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-400";
  if (tone === "critical") return "border-rose-500/30 bg-rose-500/10 text-rose-400";
  if (tone === "monitor") return "border-sky-500/30 bg-sky-500/10 text-sky-400";
  return "border-border bg-muted text-muted-foreground";
}

const PROXIMA_ACAO: Record<Tone, string> = {
  critical: "Agir agora: veja os achados abaixo antes de manter a verba.",
  warning: "Ajustar criativo, público ou lance para recuperar eficiência.",
  healthy: "Boa candidata para escala controlada.",
  monitor: "Acompanhar mais alguns dias antes de decidir.",
  neutral: "Campanha fora de veiculação no momento.",
};

/** Sem resultado so faz sentido para quem tem resultado de negocio: reconhecimento nao entra. */
function semResultado(c: CampanhaEntrada) {
  const r = resultadoDaCampanha(c);
  if (r.grupo === "reconhecimento") return false;
  return c.status === "ACTIVE" && Number(c.spend) > 0 && (r.volume ?? 0) === 0;
}

// Em campanha de mensagem a pergunta e sempre "qual anuncio trouxe conversa",
// entao o ranking manda; nos demais objetivos o gasto continua guiando a leitura.
function sortAds(ads: Ad[], messaging: boolean) {
  return [...ads].sort((a, b) => {
    if (messaging) {
      const diff = (b.messages ?? 0) - (a.messages ?? 0);
      if (diff !== 0) return diff;
    }
    return b.spend - a.spend;
  });
}

/** Indicadores de apoio do objetivo: os que nao sao gasto, resultado ou custo do resultado. */
function kpisDeApoio(grupo: GrupoObjetivo) {
  const r = RESULTADO_POR_GRUPO[grupo];
  return KPIS_POR_GRUPO[grupo].filter(k => k !== "investido" && k !== r.volume && k !== r.custo);
}

export default function Campaigns() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedClient, setSelectedClient] = useState(() => searchParams.get("client") || "all");
  const [aba, setAba] = useEstadoDaTela<"lista" | "inteligencia">("campanhas:aba", "lista");
  const [statusFilter, setStatusFilter] = useEstadoDaTela("campanhas:status", "all");
  const [performanceFilter, setPerformanceFilter] = useEstadoDaTela<PerformanceFilter>("campanhas:saude", "all");
  const [grupoFilter, setGrupoFilter] = useEstadoDaTela<"all" | GrupoObjetivo>("campanhas:grupo", "all");
  const [sortBy, setSortBy] = useEstadoDaTela<SortOption>("campanhas:ordem", "spend");
  const [search, setSearch] = useEstadoDaTela("campanhas:busca", "");
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const [diagnosticId, setDiagnosticId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setFavoriteIds(JSON.parse(window.localStorage.getItem("campaign-favorites") ?? "[]"));
      setReviewIds(JSON.parse(window.localStorage.getItem("campaign-review-queue") ?? "[]"));
    } catch {
      // storage bloqueado: favoritos so nao persistem
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("campaign-favorites", JSON.stringify(favoriteIds));
    } catch {
      // idem
    }
  }, [favoriteIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem("campaign-review-queue", JSON.stringify(reviewIds));
    } catch {
      // idem
    }
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
    setLoadError(null);
    setOpenId(null);

    let query = supabase
      .from("campaigns")
      .select("*, client:clients(name), ad_sets(*, ads(*))")
      .order("spend", { ascending: false });

    if (selectedClient !== "all") {
      query = query.eq("client_id", selectedClient);
    }

    const { data, error } = await query;
    if (error) {
      setLoadError(error.message);
      toast.error(error.message);
    }
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
          await syncClientData(client.id, client.meta_ad_account_id!, credencialDoCliente(client.id), setSyncProgress);
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
        credencialDoCliente(client.id),
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

  // ── Inteligencia ───────────────────────────────────────────────────────────

  const entradas = useMemo(() => campaigns.map(paraEntrada), [campaigns]);

  const anuncios = useMemo<AnuncioEntrada[]>(
    () => campaigns.flatMap(c =>
      c.status !== "ACTIVE" ? [] : (c.ad_sets ?? []).flatMap(s => (s.ads ?? []).map(a => ({
        id: a.id, name: a.name, status: a.status, campaign_id: c.id, frequency: a.frequency,
      })))
    ),
    [campaigns]
  );

  const adIdsAtivos = useMemo(() => anuncios.filter(a => a.status === "ACTIVE").map(a => a.id).sort(), [anuncios]);
  const intel = useDadosInteligencia(adIdsAtivos, selectedClient === "all" ? null : selectedClient);
  const hoje = useMemo(hojeIso, []);

  const analise = useMemo(
    () => analisarCampanhas({
      campanhas: entradas,
      carteira: intel.dados.carteira.length ? intel.dados.carteira : undefined,
      clientes: intel.dados.clientes,
      anuncios,
      diasAnuncios: intel.dados.diasAnuncios,
      hoje,
    }),
    [entradas, intel.dados, anuncios, hoje]
  );

  const analisePorId = useMemo(() => new Map(analise.campanhas.map(a => [a.campanha.id, a])), [analise]);
  const entradaPorId = useMemo(() => new Map(entradas.map(e => [e.id, e])), [entradas]);
  const clientesIntel = useMemo(() => new Map(intel.dados.clientes.map(c => [c.id, c])), [intel.dados.clientes]);
  const nomesClientes = useMemo(() => new Map(campaigns.map(c => [c.client_id, c.client?.name ?? "Cliente"])), [campaigns]);

  const resumos = useMemo(() => {
    const m = new Map<string, ResumoCliente>();
    for (const id of new Set(entradas.map(e => e.client_id))) {
      m.set(id, resumirCliente(
        id, entradas, intel.dados.diasConta, intel.dados.financeiro, hoje, intel.dados.pctCustoOperacional.get(id),
      ));
    }
    return m;
  }, [entradas, intel.dados, hoje]);

  const achadosDe = (id: string) => analisePorId.get(id)?.achados ?? VAZIA;

  // ── Lista ──────────────────────────────────────────────────────────────────

  const filteredCampaigns = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const lista = campaigns.filter((campaign) => {
      const e = entradaPorId.get(campaign.id)!;
      const grupo = analisePorId.get(campaign.id)?.grupo;
      if (statusFilter !== "all" && campaign.status !== statusFilter) return false;
      if (grupoFilter !== "all" && grupo !== grupoFilter) return false;
      if (performanceFilter === "no-conversions") {
        if (!semResultado(e)) return false;
      } else if (performanceFilter !== "all" && getHealth(e, achadosDe(campaign.id)).tone !== performanceFilter) {
        return false;
      }

      if (!normalizedSearch) return true;
      return [campaign.name, campaign.objective ?? "", campaign.client?.name ?? "", grupo ? labelGrupo(grupo) : ""]
        .some((value) => value.toLowerCase().includes(normalizedSearch));
    });

    const volume = (c: Campaign) => resultadoDaCampanha(entradaPorId.get(c.id)!).volume ?? 0;
    return lista.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "ctr") return (valorKpi(b, "ctr") ?? 0) - (valorKpi(a, "ctr") ?? 0);
      if (sortBy === "clicks") return b.clicks - a.clicks;
      if (sortBy === "conversions") return volume(b) - volume(a);
      if (sortBy === "cpc") return (valorKpi(a, "cpc") ?? Infinity) - (valorKpi(b, "cpc") ?? Infinity);
      return b.spend - a.spend;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns, entradaPorId, analisePorId, grupoFilter, performanceFilter, search, sortBy, statusFilter]);

  const summary = useMemo(() => {
    return filteredCampaigns.reduce(
      (acc, campaign) => {
        const e = entradaPorId.get(campaign.id)!;
        const tone = getHealth(e, achadosDe(campaign.id)).tone;
        acc.spend += campaign.spend;
        acc.clicks += campaign.clicks;
        acc.messages += campaign.messages ?? 0;
        acc.conversions += campaign.conversions ?? 0;
        if (campaign.status === "ACTIVE") acc.active += 1;
        if (tone === "warning" || tone === "critical") acc.alerts += 1;
        if (tone === "healthy" && severidadeDaCampanha(achadosDe(campaign.id)) === "oportunidade") acc.scale += 1;
        if (semResultado(e)) acc.noResults += 1;
        return acc;
      },
      { spend: 0, clicks: 0, messages: 0, conversions: 0, active: 0, alerts: 0, scale: 0, noResults: 0 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredCampaigns, entradaPorId, analisePorId]);

  const topAttention = useMemo(() => {
    return filteredCampaigns
      .filter((campaign) => severidadeDaCampanha(achadosDe(campaign.id)) === "critico")
      .slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredCampaigns, analisePorId]);

  const totalAchados = analise.achados.length;

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

  function openCampaignAds(campaignId: string) {
    setOpenId(campaignId);
    window.setTimeout(() => {
      document.getElementById(`campaign-structure-${campaignId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }

  function abrirNaLista(campaignId: string) {
    setAba("lista");
    // Um filtro esquecido na lista esconderia justamente a campanha pedida.
    setStatusFilter("all");
    setPerformanceFilter("all");
    setGrupoFilter("all");
    setSearch("");
    openCampaignAds(campaignId);
  }

  const diagnostic = diagnosticId ? analisePorId.get(diagnosticId) ?? null : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Megaphone className="h-6 w-6" />
          </div>
          <div className="min-w-0 space-y-2">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Campanhas</h1>
              <p className="text-sm text-muted-foreground">
                Cada campanha avaliada pelo próprio objetivo: gargalos, custos fora do esperado e oportunidades de escala.
              </p>
            </div>
            {topAttention.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {topAttention.map((campaign) => (
                  <button key={campaign.id} type="button" onClick={() => abrirNaLista(campaign.id)} className="max-w-full">
                    <Badge
                      variant="outline"
                      className={`${getHealthBadgeClass("critical")} max-w-full gap-2 rounded-full px-3 py-1`}
                    >
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate" title={campaign.name}>{campaign.name}</span>
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
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

          <Button variant="outline" onClick={handleSync} disabled={syncing} className="min-w-0">
            <RefreshCw className={`mr-2 h-4 w-4 shrink-0 ${syncing ? "animate-spin" : ""}`} />
            <span className="truncate">{syncing ? syncProgress || "Sincronizando..." : "Sincronizar"}</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ResumoCard
          icon={<Sparkles className="h-5 w-5" />}
          titulo="Campanhas ativas"
          valor={formatNumber(summary.active)}
          detalhe={`${filteredCampaigns.length} no filtro · ${summary.scale} candidata(s) a escalar`}
        />
        <ResumoCard
          icon={<CircleDollarSign className="h-5 w-5" />}
          titulo="Investido (30 dias)"
          valor={formatCurrency(summary.spend)}
          detalhe={`${formatNumber(summary.clicks)} cliques no filtro`}
        />
        <ResumoCard
          icon={<TrendingUp className="h-5 w-5" />}
          titulo="Com alerta"
          valor={formatNumber(summary.alerts)}
          detalhe="Crítico ou atenção, pelos indicadores do objetivo"
        />
        <ResumoCard
          icon={<Target className="h-5 w-5" />}
          titulo="Sem resultado"
          valor={formatNumber(summary.noResults)}
          detalhe={`${conversationLabel(summary.messages)} · ${formatNumber(summary.conversions)} conversões · ${favoriteIds.length} favoritas`}
        />
      </div>

      <Tabs value={aba} onValueChange={(v) => setAba(v as typeof aba)} className="space-y-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="lista" className="gap-1.5">
            <ListChecks className="h-4 w-4" /> Lista
          </TabsTrigger>
          <TabsTrigger value="inteligencia" className="gap-1.5">
            <BrainCircuit className="h-4 w-4" /> Inteligência
            {totalAchados > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 rounded-full px-1.5 text-[11px]">{totalAchados}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inteligencia" className="mt-0">
          <PainelInteligencia
            analises={analise.campanhas}
            clientes={clientesIntel}
            nomesClientes={nomesClientes}
            resumos={resumos}
            financeiroDisponivel={intel.dados.financeiroDisponivel}
            carregando={loading || intel.carregando}
            erro={loadError ?? intel.erro}
            onTentarDeNovo={() => { loadCampaigns(); intel.recarregar(); }}
            onAbrirCampanha={abrirNaLista}
          />
        </TabsContent>

        <TabsContent value="lista" className="mt-0 space-y-6">
          <Card className="rounded-2xl border-border/60 bg-card/60 shadow-card">
            <CardHeader className="gap-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>Radar de campanhas</CardTitle>
                  <CardDescription>
                    Filtre por objetivo para ver só os indicadores que importam para ele.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Filter className="h-3.5 w-3.5" />
                  {filteredCampaigns.length} campanha(s) visíveis
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))]">
                <div className="relative sm:col-span-2 lg:col-span-1">
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
                    <SelectItem value="DELETED">Excluídas</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={grupoFilter} onValueChange={(v) => setGrupoFilter(v as typeof grupoFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Objetivo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os objetivos</SelectItem>
                    {GRUPOS.map((g) => (
                      <SelectItem key={g.valor} value={g.valor}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={performanceFilter} onValueChange={(value) => setPerformanceFilter(value as PerformanceFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Saúde" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toda a saúde</SelectItem>
                    <SelectItem value="healthy">Saudáveis / escalar</SelectItem>
                    <SelectItem value="monitor">Monitorar</SelectItem>
                    <SelectItem value="warning">Em atenção</SelectItem>
                    <SelectItem value="critical">Críticas</SelectItem>
                    <SelectItem value="no-conversions">Sem resultado</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Ordenar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spend">Maior gasto</SelectItem>
                    <SelectItem value="conversions">Mais resultados</SelectItem>
                    <SelectItem value="clicks">Mais cliques</SelectItem>
                    <SelectItem value="ctr">Maior CTR</SelectItem>
                    <SelectItem value="cpc">Menor CPC</SelectItem>
                    <SelectItem value="name">Nome A-Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
          </Card>

          <Card className="rounded-2xl border-border/60 bg-card/60 shadow-card">
            <CardHeader>
              <CardTitle>Lista operacional</CardTitle>
              <CardDescription>
                Resultado e custo seguem o objetivo: mensagens por custo por conversa, tráfego por CPC,
                reconhecimento por CPM, conversões por custo por resultado.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {loading ? (
                <div className="space-y-2 px-6 pb-6">
                  {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
                </div>
              ) : loadError ? (
                <div className="space-y-3 p-10 text-center">
                  <p className="text-sm text-destructive">Não foi possível carregar as campanhas: {loadError}</p>
                  <Button variant="outline" size="sm" onClick={loadCampaigns}>
                    <RefreshCw className="mr-2 h-3.5 w-3.5" /> Tentar de novo
                  </Button>
                </div>
              ) : filteredCampaigns.length === 0 ? (
                <div className="space-y-2 p-12 text-center">
                  <p className="text-sm text-muted-foreground">Nenhuma campanha encontrada com esses filtros.</p>
                  <p className="text-xs text-muted-foreground">
                    Ajuste os filtros ou sincronize os clientes para atualizar os dados.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Campanha</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Saúde</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Objetivo</TableHead>
                      <TableHead className="text-right">Gasto</TableHead>
                      <TableHead className="text-right">Resultado</TableHead>
                      <TableHead className="text-right">Custo do resultado</TableHead>
                      <TableHead>Indicadores do objetivo</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCampaigns.map((campaign) => {
                      const isOpen = openId === campaign.id;
                      const entrada = entradaPorId.get(campaign.id)!;
                      const intelCamp = analisePorId.get(campaign.id);
                      const achados = intelCamp?.achados ?? VAZIA;
                      const health = getHealth(entrada, achados);
                      const res = resultadoDaCampanha(entrada);
                      const messaging = res.grupo === "mensagens";
                      const custoDef = KPI_DEF[res.custoChave];
                      const saturados = new Set(achados.filter(a => a.tipo === "criativo_saturado").map(a => a.anuncioId));
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
                              <TableCell className="min-w-[200px]">
                                <div className="space-y-1">
                                  <div className="break-words font-medium">{campaign.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {campaign.ad_sets?.length ?? 0} conjunto(s) ·{" "}
                                    {campaign.ad_sets?.reduce((total, adSet) => total + (adSet.ads?.length ?? 0), 0) ?? 0} anúncio(s)
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {campaign.client?.name ?? "Cliente"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={getHealthBadgeClass(health.tone)} title={health.detail}>
                                  {health.label}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={campaign.status} />
                              </TableCell>
                              <TableCell className="max-w-[180px]">
                                <Badge variant="outline" className="rounded-full text-[11px]">{labelGrupo(res.grupo)}</Badge>
                                <div className="mt-1 truncate text-[11px] text-muted-foreground" title={campaign.objective ?? ""}>
                                  {campaign.objective ?? "-"}
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(campaign.spend)}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                <div>{formatarKpi(res.volume, "numero")}</div>
                                <div className="text-[11px] font-normal text-muted-foreground">
                                  {res.unidade}{res.grupo === "reconhecimento" && res.volume !== null ? " (est.)" : ""}
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <div>{formatarKpi(res.custo, custoDef.formato)}</div>
                                <div className="text-[11px] font-normal text-muted-foreground">{res.custoLabel}</div>
                              </TableCell>
                              <TableCell className="text-xs">
                                {kpisDeApoio(res.grupo).map((k) => (
                                  <div key={k} className="whitespace-nowrap">
                                    <span className="text-muted-foreground">{KPI_DEF[k].label}: </span>
                                    <span className="tabular-nums">{formatarKpi(valorKpi(entrada, k), KPI_DEF[k].formato)}</span>
                                  </div>
                                ))}
                              </TableCell>
                              <TableCell onClick={(event) => event.stopPropagation()}>
                                <div className="flex min-w-[220px] flex-wrap gap-1">
                                  <Button variant="outline" size="sm" onClick={() => openCampaignAds(campaign.id)}>
                                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                                    Ver anúncios
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => setOpenId(campaign.id)}>
                                    <FolderKanban className="mr-1.5 h-3.5 w-3.5" />
                                    Ver conjuntos
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${campaign.client_id}/reports`)}>
                                    <PanelsTopLeft className="mr-1.5 h-3.5 w-3.5" />
                                    Relatório
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => setDiagnosticId(campaign.id)}>
                                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                                    Diagnóstico
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
                                    {inReview ? "Em revisão" : "Revisar"}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>

                            <CollapsibleContent asChild>
                              <TableRow>
                                <TableCell colSpan={11} className="bg-muted/20 p-0">
                                  <div id={`campaign-structure-${campaign.id}`} className="grid gap-4 p-4 xl:grid-cols-[1.1fr_1.4fr]">
                                    <div className="min-w-0 rounded-2xl border border-border bg-background/80 p-4">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-sm font-medium">Diagnóstico · {labelGrupo(res.grupo)}</p>
                                          <p className="text-xs text-muted-foreground">{PROXIMA_ACAO[health.tone]}</p>
                                        </div>
                                        <Badge variant="outline" className={getHealthBadgeClass(health.tone)}>
                                          {health.label}
                                        </Badge>
                                      </div>

                                      {intelCamp && (
                                        <div className="mt-4">
                                          <KpisDaCampanha analise={intelCamp} />
                                        </div>
                                      )}

                                      <div className="mt-4 space-y-2">
                                        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                                          <Lightbulb className="h-3.5 w-3.5" />
                                          Inteligência e alertas
                                        </div>
                                        {achados.length === 0 ? (
                                          <p className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                                            {campaign.status !== "ACTIVE"
                                              ? "Campanha fora do ar: não entra na análise."
                                              : Number(campaign.spend) < GASTO_MINIMO
                                                ? `Menos de ${formatCurrency(GASTO_MINIMO)} investidos: ainda cedo para julgar.`
                                                : "Nenhum alerta pelos indicadores do objetivo. Mantenha o acompanhamento."}
                                          </p>
                                        ) : (
                                          <div className="grid gap-2">
                                            {achados.map((a) => <CartaoAchado key={a.id} achado={a} />)}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <div className="min-w-0 rounded-2xl border border-border bg-background/80 p-4">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                          <p className="text-sm font-medium">Estrutura detalhada</p>
                                          <p className="text-xs text-muted-foreground">
                                            Conjuntos e anúncios ligados a esta campanha.
                                          </p>
                                        </div>
                                        <Badge variant="outline" className="rounded-full">
                                          {campaign.ad_sets?.length ?? 0} conjunto(s)
                                        </Badge>
                                      </div>

                                      {(campaign.ad_sets?.length ?? 0) === 0 ? (
                                        <p className="mt-4 text-xs text-muted-foreground">Nenhum conjunto encontrado.</p>
                                      ) : (
                                        <div className="mt-4 space-y-3">
                                          {(campaign.ad_sets ?? []).map((adSet) => (
                                            <div key={adSet.id} className="rounded-xl border border-border/70 bg-muted/10 p-4">
                                              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                                <div className="min-w-0 space-y-1">
                                                  <div className="flex flex-wrap items-center gap-2">
                                                    <span className="break-words text-sm font-medium">{adSet.name}</span>
                                                    <StatusBadge status={adSet.status} />
                                                  </div>
                                                  <div className="text-xs text-muted-foreground">
                                                    {formatCurrency(adSet.spend)} · {formatNumber(adSet.impressions)} impressões ·{" "}
                                                    {formatNumber(adSet.clicks)} cliques
                                                    {messaging && ` · ${conversationLabel(adSet.messages ?? 0)}`}
                                                  </div>
                                                </div>

                                                <Badge variant="outline" className="w-fit rounded-full">
                                                  {adSet.ads?.length ?? 0} anúncio(s)
                                                </Badge>
                                              </div>

                                              <div className="mt-3 grid gap-2">
                                                {sortAds(adSet.ads ?? [], messaging).map((ad, index) => (
                                                  <div
                                                    key={ad.id}
                                                    className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/80 p-3 sm:flex-row sm:items-center sm:justify-between"
                                                  >
                                                    <div className="min-w-0 space-y-1">
                                                      <div className="flex flex-wrap items-center gap-2">
                                                        <span className="break-words text-sm font-medium">{ad.name}</span>
                                                        <StatusBadge status={ad.status} />
                                                        {messaging && index === 0 && (ad.messages ?? 0) > 0 && (
                                                          <Badge
                                                            variant="outline"
                                                            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                                          >
                                                            <MessageCircle className="mr-1 h-3 w-3" />
                                                            Mais conversas
                                                          </Badge>
                                                        )}
                                                        {saturados.has(ad.id) && (
                                                          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">
                                                            Saturado
                                                          </Badge>
                                                        )}
                                                      </div>
                                                      <div className="text-xs text-muted-foreground">
                                                        {formatNumber(ad.clicks)} cliques · {formatNumber(ad.impressions)} impressões
                                                        {Number(ad.frequency) > 0 && ` · frequência ${formatarKpi(Number(ad.frequency), "multiplo")}`}
                                                      </div>
                                                    </div>
                                                    <div className="text-right">
                                                      <div className="text-sm font-medium tabular-nums">{formatCurrency(ad.spend)}</div>
                                                      {messaging && (
                                                        <div className="text-xs tabular-nums text-muted-foreground">
                                                          {(ad.messages ?? 0) > 0
                                                            ? `${conversationLabel(ad.messages)} · ${formatCurrency(ad.spend / ad.messages)} cada`
                                                            : "nenhuma conversa"}
                                                        </div>
                                                      )}
                                                    </div>
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
        </TabsContent>
      </Tabs>

      <Dialog open={!!diagnostic} onOpenChange={(open) => !open && setDiagnosticId(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {diagnostic && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-start gap-2 break-words pr-6">
                  <Sparkles className="mt-1 h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0">Diagnóstico · {diagnostic.campanha.name}</span>
                </DialogTitle>
                <DialogDescription>
                  Objetivo: {labelGrupo(diagnostic.grupo)}. Leitura feita pelos indicadores desse objetivo, últimos 30 dias.
                </DialogDescription>
              </DialogHeader>

              <KpisDaCampanha analise={diagnostic} />

              <div className="space-y-3">
                {diagnostic.achados.length === 0 ? (
                  <p className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                    {PROXIMA_ACAO[getHealth(diagnostic.campanha, diagnostic.achados).tone]}
                  </p>
                ) : (
                  diagnostic.achados.map((a) => <CartaoAchado key={a.id} achado={a} />)
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResumoCard({ icon, titulo, valor, detalhe }: { icon: ReactNode; titulo: string; valor: string; detalhe: string }) {
  return (
    <Card className="rounded-2xl border-border/60 bg-card/60 shadow-card">
      <CardContent className="p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          {icon}
        </div>
        <div className="mt-4 text-sm text-muted-foreground">{titulo}</div>
        <div className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{valor}</div>
        <div className="mt-2 break-words text-xs text-muted-foreground">{detalhe}</div>
      </CardContent>
    </Card>
  );
}
