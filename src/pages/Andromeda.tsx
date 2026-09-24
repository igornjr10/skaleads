import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { ALL_CHECKS } from "@/lib/audit/checks";
import type { AuditCheckResult, AuditContext } from "@/lib/audit/types";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { downloadBlob } from "@/lib/report-pdf";
import { toast } from "sonner";
import {
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  ChevronsRight,
  Copy,
  Download,
  Layers,
  Lightbulb,
  Radar,
  RefreshCw,
  Sparkles,
  Target,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  Wand2,
} from "lucide-react";

interface Client {
  id: string;
  name: string;
  status: string;
  meta_sync_status: string;
  meta_auto_sync_enabled: boolean;
  meta_last_sync_at: string | null;
  meta_ad_account_id?: string | null;
  meta_access_token?: string | null;
}

interface Ad {
  id: string;
  status: string;
}

interface AdSet {
  id: string;
  name: string;
  status: string;
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
  conversions: number;
  ad_sets: AdSet[];
  client?: {
    name: string;
  } | null;
}

interface DailyMetric {
  client_id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
}

interface ScoreBreakdown {
  overall: number;
  creative: number;
  structure: number;
  automation: number;
  signal: number;
}

interface AndromedaInsight {
  tone: "good" | "warning" | "critical";
  title: string;
  detail: string;
  action: string;
}

interface ActionPlanItem {
  bucket: "today" | "tomorrow" | "scale" | "pause";
  title: string;
  detail: string;
}

const ADVANCED_CHECK_IDS = [
  "cbo_usage",
  "learning_phase",
  "learning_stalled",
  "duplicate_objectives",
  "creative_diversity",
  "creative_fatigue",
  "low_ctr",
  "ad_frequency",
  "min_active_ads",
  "budget_efficiency",
  "budget_variation",
  "account_status",
  "payment_method",
  "high_cpc",
] as const;

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeCtr(impressions: number, clicks: number) {
  return impressions > 0 ? (clicks / impressions) * 100 : 0;
}

function buildAndromedaScore(clients: Client[], campaigns: Campaign[], metrics: DailyMetric[]): ScoreBreakdown {
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "ACTIVE");
  const activeAdSets = activeCampaigns.flatMap((campaign) =>
    (campaign.ad_sets || []).filter((adSet) => adSet.status === "ACTIVE")
  );
  const activeAds = activeAdSets.flatMap((adSet) => (adSet.ads || []).filter((ad) => ad.status === "ACTIVE"));

  const adsPerSet = activeAdSets.length > 0 ? activeAds.length / activeAdSets.length : 0;
  const adSetsPerCampaign = activeCampaigns.length > 0 ? activeAdSets.length / activeCampaigns.length : 0;
  const avgCtr = average(activeCampaigns.map((campaign) => campaign.ctr || 0));
  const avgCpc = average(activeCampaigns.filter((campaign) => campaign.clicks > 0).map((campaign) => campaign.cpc || 0));
  const noConversionShare = activeCampaigns.length
    ? activeCampaigns.filter((campaign) => campaign.spend > 300 && campaign.conversions === 0).length / activeCampaigns.length
    : 0;
  const syncHealthyShare = clients.length
    ? clients.filter((client) => client.meta_sync_status === "healthy").length / clients.length
    : 0;
  const autoSyncShare = clients.length
    ? clients.filter((client) => client.meta_auto_sync_enabled).length / clients.length
    : 0;

  const recentCutoff = new Date();
  recentCutoff.setDate(recentCutoff.getDate() - 7);
  const previousCutoff = new Date();
  previousCutoff.setDate(previousCutoff.getDate() - 14);

  const recentRows = metrics.filter((row) => new Date(`${row.date}T00:00:00`) >= recentCutoff);
  const previousRows = metrics.filter((row) => {
    const date = new Date(`${row.date}T00:00:00`);
    return date >= previousCutoff && date < recentCutoff;
  });

  const recentImpressions = recentRows.reduce((sum, row) => sum + (row.impressions || 0), 0);
  const recentClicks = recentRows.reduce((sum, row) => sum + (row.clicks || 0), 0);
  const previousImpressions = previousRows.reduce((sum, row) => sum + (row.impressions || 0), 0);
  const previousClicks = previousRows.reduce((sum, row) => sum + (row.clicks || 0), 0);
  const recentCtr = computeCtr(recentImpressions, recentClicks);
  const previousCtr = computeCtr(previousImpressions, previousClicks);
  const ctrDrop = previousCtr > 0 ? ((previousCtr - recentCtr) / previousCtr) * 100 : 0;

  let creative = 100;
  if (activeAds.length === 0) creative -= 60;
  if (adsPerSet < 2) creative -= 30;
  else if (adsPerSet < 3) creative -= 15;
  if (avgCtr < 1) creative -= 25;
  else if (avgCtr < 1.5) creative -= 12;
  if (ctrDrop > 30) creative -= 20;
  else if (ctrDrop > 15) creative -= 10;

  let structure = 100;
  if (activeCampaigns.length >= 10) structure -= 18;
  else if (activeCampaigns.length >= 6) structure -= 10;
  if (adSetsPerCampaign > 4) structure -= 22;
  else if (adSetsPerCampaign > 2.5) structure -= 10;
  if (noConversionShare > 0.4) structure -= 18;
  else if (noConversionShare > 0.2) structure -= 8;

  let automation = 100;
  if (syncHealthyShare < 0.5) automation -= 35;
  else if (syncHealthyShare < 0.8) automation -= 18;
  if (autoSyncShare < 0.3) automation -= 25;
  else if (autoSyncShare < 0.7) automation -= 10;

  let signal = 100;
  if (recentClicks < 300) signal -= 25;
  else if (recentClicks < 800) signal -= 10;
  if (recentImpressions < 10000) signal -= 20;
  else if (recentImpressions < 50000) signal -= 10;
  if (avgCpc > 5) signal -= 18;
  else if (avgCpc > 3) signal -= 8;

  creative = clampScore(creative);
  structure = clampScore(structure);
  automation = clampScore(automation);
  signal = clampScore(signal);

  return {
    creative,
    structure,
    automation,
    signal,
    overall: clampScore((creative + structure + automation + signal) / 4),
  };
}

function buildInsights(score: ScoreBreakdown, clients: Client[], campaigns: Campaign[], metrics: DailyMetric[]): AndromedaInsight[] {
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "ACTIVE");
  const activeAdSets = activeCampaigns.flatMap((campaign) =>
    (campaign.ad_sets || []).filter((adSet) => adSet.status === "ACTIVE")
  );
  const activeAds = activeAdSets.flatMap((adSet) => (adSet.ads || []).filter((ad) => ad.status === "ACTIVE"));
  const adsPerSet = activeAdSets.length > 0 ? activeAds.length / activeAdSets.length : 0;
  const noConversionCampaigns = activeCampaigns.filter((campaign) => campaign.spend > 300 && campaign.conversions === 0);
  const lowCtrCampaigns = activeCampaigns.filter((campaign) => campaign.ctr < 1);
  const healthySyncClients = clients.filter((client) => client.meta_sync_status === "healthy").length;
  const autoSyncClients = clients.filter((client) => client.meta_auto_sync_enabled).length;

  const recentCutoff = new Date();
  recentCutoff.setDate(recentCutoff.getDate() - 7);
  const previousCutoff = new Date();
  previousCutoff.setDate(previousCutoff.getDate() - 14);

  const recentRows = metrics.filter((row) => new Date(`${row.date}T00:00:00`) >= recentCutoff);
  const previousRows = metrics.filter((row) => {
    const date = new Date(`${row.date}T00:00:00`);
    return date >= previousCutoff && date < recentCutoff;
  });

  const recentCtr = computeCtr(
    recentRows.reduce((sum, row) => sum + row.impressions, 0),
    recentRows.reduce((sum, row) => sum + row.clicks, 0)
  );
  const previousCtr = computeCtr(
    previousRows.reduce((sum, row) => sum + row.impressions, 0),
    previousRows.reduce((sum, row) => sum + row.clicks, 0)
  );
  const ctrDrop = previousCtr > 0 ? ((previousCtr - recentCtr) / previousCtr) * 100 : 0;

  const insights: AndromedaInsight[] = [];

  if (adsPerSet < 3) {
    insights.push({
      tone: adsPerSet < 2 ? "critical" : "warning",
      title: "Pouca diversidade criativa",
      detail: `A media esta em ${adsPerSet.toFixed(1)} anuncio(s) por conjunto ativo. O Andromeda aprende melhor quando tem mais variacoes para testar.`,
      action: "Leve cada conjunto principal para pelo menos 3 criativos ativos com angulos diferentes.",
    });
  } else {
    insights.push({
      tone: "good",
      title: "Base criativa com bom volume",
      detail: `A estrutura tem ${formatNumber(activeAds.length)} anuncios ativos para ${formatNumber(activeAdSets.length)} conjuntos.`,
      action: "Continue renovando criativos sem fragmentar demais a conta.",
    });
  }

  if (noConversionCampaigns.length > 0) {
    insights.push({
      tone: noConversionCampaigns.length >= 3 ? "critical" : "warning",
      title: "Verba presa em campanhas sem retorno",
      detail: `${formatNumber(noConversionCampaigns.length)} campanha(s) ativas ja passaram de R$ 300 sem conversao.`,
      action: "Corte gasto improdutivo e concentre a verba nas campanhas com melhor sinal de compra.",
    });
  }

  if (lowCtrCampaigns.length > 0) {
    insights.push({
      tone: lowCtrCampaigns.length >= 3 ? "warning" : "good",
      title: "Criativos ainda nao estao abrindo interesse suficiente",
      detail: `${formatNumber(lowCtrCampaigns.length)} campanha(s) ativas estao abaixo de 1% de CTR.`,
      action: "Teste novas aberturas, promessas mais diretas e criativos com prova mais clara.",
    });
  }

  if (ctrDrop > 15) {
    insights.push({
      tone: ctrDrop > 30 ? "critical" : "warning",
      title: "Sinal de fadiga recente",
      detail: `O CTR consolidado caiu ${ctrDrop.toFixed(0)}% na comparacao entre as ultimas duas semanas.`,
      action: "Suba uma nova rodada de criativos antes de escalar mais a estrutura atual.",
    });
  }

  if (healthySyncClients < clients.length || autoSyncClients < clients.length) {
    insights.push({
      tone: "warning",
      title: "Base de automacao ainda incompleta",
      detail: `${formatNumber(healthySyncClients)} cliente(s) com sync saudavel e ${formatNumber(autoSyncClients)} com auto sync ligado.`,
      action: "Padronize sync saudavel e auto sync para que a IA trabalhe com dados mais confiaveis.",
    });
  }

  if (!insights.length) {
    insights.push({
      tone: "good",
      title: "Estrutura consistente para o Andromeda",
      detail: "Os principais sinais da conta estao equilibrados entre criativo, estrutura e automacao.",
      action: "Mantenha a simplicidade da conta e use a IA para aumentar volume com seguranca.",
    });
  }

  return insights.slice(0, 4);
}

function getScoreTone(score: number) {
  if (score >= 80) return "good";
  if (score >= 60) return "warning";
  return "critical";
}

function getScoreLabel(score: number) {
  if (score >= 80) return "Pronta para escalar";
  if (score >= 60) return "Boa base, mas ainda com friccao";
  return "Estrutura pedindo ajuste";
}

function getToneClasses(tone: "good" | "warning" | "critical") {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function groupByClient<T extends { client_id: string }>(rows: T[]) {
  const map = new Map<string, T[]>();

  rows.forEach((row) => {
    const bucket = map.get(row.client_id) || [];
    bucket.push(row);
    map.set(row.client_id, bucket);
  });

  return map;
}

function normalizeAdAccountId(value?: string | null) {
  if (!value) return "";
  return value.startsWith("act_") ? value.slice(4) : value.trim();
}

function buildActionPlan(
  campaigns: Campaign[],
  score: ScoreBreakdown,
  insights: AndromedaInsight[],
  advancedResults: AuditCheckResult[]
) {
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "ACTIVE");
  const highWasteCampaigns = activeCampaigns.filter((campaign) => campaign.spend > 300 && campaign.conversions === 0);
  const lowCtrCampaigns = activeCampaigns.filter((campaign) => campaign.ctr < 1);
  const scaleCandidates = activeCampaigns
    .filter((campaign) => campaign.ctr >= 2 && campaign.cpc <= 2.5 && campaign.conversions > 0)
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 3);

  const failedChecks = advancedResults.filter((result) => result.status === "fail");
  const warningChecks = advancedResults.filter((result) => result.status === "warn");

  const plan: ActionPlanItem[] = [];

  if (highWasteCampaigns.length > 0) {
    plan.push({
      bucket: "today",
      title: "Cortar desperdicio nas campanhas sem retorno",
      detail: `${formatNumber(highWasteCampaigns.length)} campanha(s) ja passaram de R$ 300 sem conversao. Reduza verba ou pause ate revisar oferta, pagina e evento de conversao.`,
    });
  }

  if (failedChecks.length > 0) {
    plan.push({
      bucket: "today",
      title: "Resolver os gargalos criticos da leitura profunda",
      detail: `Priorize ${failedChecks.slice(0, 3).map((check) => check.name).join(", ")} para destravar entrega e confianca operacional da conta.`,
    });
  }

  if (lowCtrCampaigns.length > 0 || score.creative < 70) {
    plan.push({
      bucket: "tomorrow",
      title: "Subir uma nova rodada de criativos",
      detail: lowCtrCampaigns.length > 0
        ? `${formatNumber(lowCtrCampaigns.length)} campanha(s) estao com CTR abaixo de 1%. Teste novas aberturas, provas e formatos para melhorar a resposta.`
        : "A base criativa ainda esta curta para o Andromeda. Amplie a variacao por conjunto com novos angulos e hooks.",
    });
  }

  if (warningChecks.length > 0 || score.structure < 75) {
    plan.push({
      bucket: "tomorrow",
      title: "Simplificar a estrutura antes de escalar",
      detail: warningChecks.length > 0
        ? `Ha sinais de friccao em ${warningChecks.slice(0, 2).map((check) => check.name).join(" e ")}. Consolide campanhas, reduza fragmentacao e preserve mais sinal por conjunto.`
        : "A estrutura ainda esta pedindo consolidacao. Menos campanhas e menos conjuntos ajudam a IA a trabalhar melhor.",
    });
  }

  if (scaleCandidates.length > 0) {
    plan.push({
      bucket: "scale",
      title: "Escalar o que ja mostrou eficiencia",
      detail: `As melhores candidatas agora sao ${scaleCandidates.map((campaign) => campaign.name).join(", ")}. Escale com cuidado, protegendo os criativos que ja converteram.`,
    });
  } else if (score.overall >= 80) {
    plan.push({
      bucket: "scale",
      title: "Conta pronta para aumento gradual de verba",
      detail: "Os sinais estao equilibrados. O melhor movimento agora e escalar devagar enquanto renova os criativos com consistencia.",
    });
  }

  if (highWasteCampaigns.length > 0) {
    plan.push({
      bucket: "pause",
      title: "Pausar campanhas que so consomem verba",
      detail: `Evite insistir em ${highWasteCampaigns.slice(0, 3).map((campaign) => campaign.name).join(", ")} antes de corrigir criativo, publico ou pagina.`,
    });
  } else if (insights.some((insight) => insight.tone === "critical")) {
    plan.push({
      bucket: "pause",
      title: "Segurar escala ate corrigir os pontos criticos",
      detail: "Existe pelo menos um sinal critico na conta. Antes de colocar mais verba, estabilize criativo, sinal ou automacao.",
    });
  }

  return plan.slice(0, 8);
}

function getPlanBucketMeta(bucket: ActionPlanItem["bucket"]) {
  if (bucket === "today") {
    return {
      label: "Corrigir hoje",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  if (bucket === "tomorrow") {
    return {
      label: "Testar amanha",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  if (bucket === "scale") {
    return {
      label: "Escalar",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  return {
    label: "Pausar",
    className: "border-slate-200 bg-slate-50 text-slate-700",
  };
}

function buildPlanExportText(params: {
  clientName: string;
  score: ScoreBreakdown;
  insights: AndromedaInsight[];
  actionPlan: ActionPlanItem[];
  advancedResults: AuditCheckResult[];
}) {
  const { clientName, score, insights, actionPlan, advancedResults } = params;

  const lines: string[] = [
    `Plano de Acao Andromeda - ${clientName}`,
    "",
    `Score geral: ${score.overall}/100`,
    `Criativo: ${score.creative}/100`,
    `Estrutura: ${score.structure}/100`,
    `Automacao: ${score.automation}/100`,
    `Sinal: ${score.signal}/100`,
    "",
    "Leituras principais:",
    ...insights.map((insight) => `- ${insight.title}: ${insight.detail} Acao: ${insight.action}`),
    "",
    "Plano de acao:",
    ...actionPlan.map((item) => {
      const bucket = getPlanBucketMeta(item.bucket);
      return `- [${bucket.label}] ${item.title}: ${item.detail}`;
    }),
  ];

  if (advancedResults.length > 0) {
    lines.push("", "Leitura profunda:");
    advancedResults.forEach((result) => {
      lines.push(`- ${result.name} (${result.status}): ${result.message}`);
      if (result.recommendation) {
        lines.push(`  Acao: ${result.recommendation}`);
      }
    });
  }

  return lines.join("\n");
}

export default function Andromeda() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState("all");
  const [clients, setClients] = useState<Client[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [advancedResults, setAdvancedResults] = useState<AuditCheckResult[]>([]);

  useEffect(() => {
    void loadPageData();
  }, []);

  useEffect(() => {
    setAdvancedResults([]);
  }, [selectedClient]);

  async function loadPageData() {
    setLoading(true);

    const [clientsRes, campaignsRes, metricsRes] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name, status, meta_sync_status, meta_auto_sync_enabled, meta_last_sync_at, meta_ad_account_id, meta_access_token")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("campaigns")
        .select("id, client_id, name, status, objective, spend, impressions, clicks, ctr, cpc, conversions, client:clients(name), ad_sets(id, name, status, ads(id, status))")
        .order("spend", { ascending: false }),
      supabase
        .from("campaign_daily_metrics")
        .select("client_id, date, spend, impressions, clicks")
        .gte("date", new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0])
        .order("date"),
    ]);

    setClients((clientsRes.data as Client[]) || []);
    setCampaigns((campaignsRes.data as unknown as Campaign[]) || []);
    setDailyMetrics((metricsRes.data as DailyMetric[]) || []);
    setLoading(false);
  }

  async function runAdvancedDiagnostics() {
    if (selectedClient === "all") return;

    const client = clients.find((item) => item.id === selectedClient);
    if (!client?.meta_ad_account_id || !client?.meta_access_token) return;

    setAdvancedLoading(true);
    try {
      const context: AuditContext = {
        clientId: client.id,
        adAccountId: normalizeAdAccountId(client.meta_ad_account_id),
        accessToken: client.meta_access_token.trim(),
      };

      const checks = ALL_CHECKS.filter((check) => ADVANCED_CHECK_IDS.includes(check.id as (typeof ADVANCED_CHECK_IDS)[number]));
      const settled = await Promise.all(
        checks.map(async (check) => {
          try {
            const result = await check.run(context);
            return {
              id: check.id,
              name: check.name,
              category: check.category,
              severity: check.severity,
              ...result,
            } satisfies AuditCheckResult;
          } catch (error) {
            return {
              id: check.id,
              name: check.name,
              category: check.category,
              severity: check.severity,
              status: "skip",
              message: error instanceof Error ? error.message : "Nao foi possivel executar este check agora.",
            } satisfies AuditCheckResult;
          }
        })
      );

      setAdvancedResults(settled);
    } finally {
      setAdvancedLoading(false);
    }
  }

  const filteredClients = useMemo(() => {
    if (selectedClient === "all") return clients;
    return clients.filter((client) => client.id === selectedClient);
  }, [clients, selectedClient]);

  const filteredCampaigns = useMemo(() => {
    if (selectedClient === "all") return campaigns;
    return campaigns.filter((campaign) => campaign.client_id === selectedClient);
  }, [campaigns, selectedClient]);

  const filteredMetrics = useMemo(() => {
    if (selectedClient === "all") return dailyMetrics;
    return dailyMetrics.filter((row) => row.client_id === selectedClient);
  }, [dailyMetrics, selectedClient]);

  const score = useMemo(
    () => buildAndromedaScore(filteredClients, filteredCampaigns, filteredMetrics),
    [filteredClients, filteredCampaigns, filteredMetrics]
  );

  const insights = useMemo(
    () => buildInsights(score, filteredClients, filteredCampaigns, filteredMetrics),
    [score, filteredClients, filteredCampaigns, filteredMetrics]
  );

  const activeCampaigns = filteredCampaigns.filter((campaign) => campaign.status === "ACTIVE");
  const activeAdSets = activeCampaigns.flatMap((campaign) =>
    (campaign.ad_sets || []).filter((adSet) => adSet.status === "ACTIVE")
  );
  const activeAds = activeAdSets.flatMap((adSet) => (adSet.ads || []).filter((ad) => ad.status === "ACTIVE"));
  const totalSpend = filteredCampaigns.reduce((sum, campaign) => sum + (campaign.spend || 0), 0);
  const totalClicks = filteredCampaigns.reduce((sum, campaign) => sum + (campaign.clicks || 0), 0);
  const totalImpressions = filteredCampaigns.reduce((sum, campaign) => sum + (campaign.impressions || 0), 0);
  const totalConversions = filteredCampaigns.reduce((sum, campaign) => sum + (campaign.conversions || 0), 0);
  const avgCtr = computeCtr(totalImpressions, totalClicks);
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

  const campaignsByClient = useMemo(() => groupByClient(campaigns), [campaigns]);
  const metricsByClient = useMemo(() => groupByClient(dailyMetrics), [dailyMetrics]);

  const clientReadiness = useMemo(() => {
    return clients
      .map((client) => {
        const clientCampaigns = campaignsByClient.get(client.id) || [];
        const clientMetrics = metricsByClient.get(client.id) || [];
        const scoreBreakdown = buildAndromedaScore([client], clientCampaigns, clientMetrics);
        const activeCount = clientCampaigns.filter((campaign) => campaign.status === "ACTIVE").length;

        return {
          id: client.id,
          name: client.name,
          score: scoreBreakdown.overall,
          activeCampaigns: activeCount,
          syncStatus: client.meta_sync_status,
          topGap:
            scoreBreakdown.creative <= scoreBreakdown.structure &&
            scoreBreakdown.creative <= scoreBreakdown.automation &&
            scoreBreakdown.creative <= scoreBreakdown.signal
              ? "Criativo"
              : scoreBreakdown.structure <= scoreBreakdown.automation && scoreBreakdown.structure <= scoreBreakdown.signal
                ? "Estrutura"
                : scoreBreakdown.automation <= scoreBreakdown.signal
                  ? "Automacao"
                  : "Sinal",
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [campaignsByClient, clients, metricsByClient]);

  const blockers = useMemo(() => {
    return activeCampaigns
      .map((campaign) => {
        const cpa = campaign.conversions > 0 ? campaign.spend / campaign.conversions : 0;
        let reason = "Campanha pedindo observacao";
        let severity: "warning" | "critical" = "warning";

        if (campaign.spend > 300 && campaign.conversions === 0) {
          reason = "Gastou sem gerar conversao";
          severity = "critical";
        } else if (campaign.ctr < 1) {
          reason = "CTR baixo para a fase atual";
        } else if (campaign.cpc > 5) {
          reason = "Clique caro para escalar";
        } else if (campaign.conversions > 0 && cpa > 80) {
          reason = "Custo por resultado acima do confortavel";
        }

        return {
          id: campaign.id,
          name: campaign.name,
          spend: campaign.spend,
          ctr: campaign.ctr,
          cpc: campaign.cpc,
          conversions: campaign.conversions,
          reason,
          severity,
        };
      })
      .filter((campaign) => campaign.reason !== "Campanha pedindo observacao")
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 6);
  }, [activeCampaigns]);

  const scoreTone = getScoreTone(score.overall);
  const scoreClasses = getToneClasses(scoreTone);
  const selectedClientRecord = selectedClient === "all" ? null : clients.find((client) => client.id === selectedClient) || null;
  const canRunAdvancedDiagnostics = !!selectedClientRecord?.meta_ad_account_id && !!selectedClientRecord?.meta_access_token;
  const advancedSummary = useMemo(() => {
    return advancedResults.reduce(
      (acc, result) => {
        if (result.status === "pass") acc.pass += 1;
        if (result.status === "warn") acc.warn += 1;
        if (result.status === "fail") acc.fail += 1;
        if (result.status === "skip") acc.skip += 1;
        return acc;
      },
      { pass: 0, warn: 0, fail: 0, skip: 0 }
    );
  }, [advancedResults]);
  const actionPlan = useMemo(
    () => buildActionPlan(filteredCampaigns, score, insights, advancedResults),
    [advancedResults, filteredCampaigns, insights, score]
  );
  const exportClientName = selectedClientRecord?.name || "Todos os clientes";

  async function copyActionPlan() {
    const content = buildPlanExportText({
      clientName: exportClientName,
      score,
      insights,
      actionPlan,
      advancedResults,
    });

    await navigator.clipboard.writeText(content);
    toast.success("Plano copiado");
  }

  function exportActionPlan() {
    const content = buildPlanExportText({
      clientName: exportClientName,
      score,
      insights,
      actionPlan,
      advancedResults,
    });

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const filename = `andromeda-${exportClientName.toLowerCase().replace(/\s+/g, "-")}.txt`;
    downloadBlob(blob, filename);
    toast.success("Plano exportado");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <Brain className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Andromeda IA</h1>
              <p className="text-sm text-muted-foreground">
                Diagnostico pratico para saber se a conta esta pronta para a nova logica de entrega da Meta.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-full sm:w-56">
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
          <Button variant="outline" onClick={() => void loadPageData()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar leitura
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
            <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-white via-emerald-50/60 to-amber-50/80 shadow-card">
              <CardContent className="p-6">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <Badge variant="outline" className={`${scoreClasses} rounded-full px-3 py-1`}>
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      {getScoreLabel(score.overall)}
                    </Badge>
                    <div>
                      <p className="text-sm text-muted-foreground">Score de prontidao Andromeda</p>
                      <div className="mt-1 text-5xl font-semibold tracking-tight">{score.overall}</div>
                    </div>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                      A leitura abaixo combina criativo, estrutura, automacao e qualidade de sinal para mostrar o quanto
                      a conta esta pronta para deixar a IA trabalhar com menos friccao.
                    </p>
                  </div>

                  <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-sm">
                    <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Campanhas ativas</div>
                      <div className="mt-2 text-2xl font-semibold">{formatNumber(activeCampaigns.length)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Anuncios ativos</div>
                      <div className="mt-2 text-2xl font-semibold">{formatNumber(activeAds.length)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">CTR medio</div>
                      <div className="mt-2 text-2xl font-semibold">{formatPercent(avgCtr)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">CPC medio</div>
                      <div className="mt-2 text-2xl font-semibold">{formatCurrency(avgCpc)}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radar className="h-5 w-5 text-primary" />
                  Leitura rapida
                </CardTitle>
                <CardDescription>Os quatro blocos que mais influenciam a entrega no Andromeda.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { key: "creative", label: "Criativo", value: score.creative },
                  { key: "structure", label: "Estrutura", value: score.structure },
                  { key: "automation", label: "Automacao", value: score.automation },
                  { key: "signal", label: "Sinal", value: score.signal },
                ].map((item) => (
                  <div key={item.key} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>{item.label}</span>
                      <span className="font-medium">{item.value}/100</span>
                    </div>
                    <Progress value={item.value} className="h-2.5" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="shadow-card">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Investimento</span>
                </div>
                <div className="mt-4 text-sm text-muted-foreground">Volume que alimenta a IA</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight">{formatCurrency(totalSpend)}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {formatNumber(totalClicks)} cliques e {formatNumber(totalImpressions)} impressoes no recorte.
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                    <Layers className="h-5 w-5" />
                  </div>
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Estrutura</span>
                </div>
                <div className="mt-4 text-sm text-muted-foreground">Conjuntos por campanha</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight">
                  {activeCampaigns.length > 0 ? (activeAdSets.length / activeCampaigns.length).toFixed(1) : "0.0"}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Estruturas muito abertas ou muito fragmentadas custam eficiencia.
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                    <Wand2 className="h-5 w-5" />
                  </div>
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Criativos</span>
                </div>
                <div className="mt-4 text-sm text-muted-foreground">Anuncios por conjunto ativo</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight">
                  {activeAdSets.length > 0 ? (activeAds.length / activeAdSets.length).toFixed(1) : "0.0"}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  O ideal e ter pelo menos 3 criativos por conjunto principal.
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="rounded-2xl bg-rose-100 p-3 text-rose-700">
                    <Target className="h-5 w-5" />
                  </div>
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Resultado</span>
                </div>
                <div className="mt-4 text-sm text-muted-foreground">Conversoes mapeadas</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight">{formatNumber(totalConversions)}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Quanto mais sinal real, melhor a IA entende onde insistir.
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="diagnostic" className="space-y-4">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="diagnostic">Diagnostico</TabsTrigger>
              <TabsTrigger value="deep">Leitura profunda</TabsTrigger>
              <TabsTrigger value="plan">Plano de acao</TabsTrigger>
              <TabsTrigger value="clients">Clientes</TabsTrigger>
              <TabsTrigger value="playbook">Playbook</TabsTrigger>
            </TabsList>

            <TabsContent value="diagnostic" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[1fr_0.92fr]">
                <Card className="shadow-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bot className="h-5 w-5 text-primary" />
                      O que a Andromeda faria agora
                    </CardTitle>
                    <CardDescription>Leitura pratica para priorizar os proximos ajustes da conta.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {insights.map((insight) => (
                      <div key={insight.title} className={`rounded-2xl border p-4 ${getToneClasses(insight.tone)}`}>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {insight.tone === "good" ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
                          {insight.title}
                        </div>
                        <p className="mt-2 text-sm opacity-90">{insight.detail}</p>
                        <p className="mt-3 text-sm font-medium">Acao sugerida: {insight.action}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="shadow-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TriangleAlert className="h-5 w-5 text-primary" />
                      Maiores bloqueios de escala
                    </CardTitle>
                    <CardDescription>Campanhas que mais seguram o score atual.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {blockers.length === 0 ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                        Nenhum bloqueio critico encontrado no recorte atual. Boa base para testar escala.
                      </div>
                    ) : (
                      blockers.map((blocker) => (
                        <div
                          key={blocker.id}
                          className={`rounded-2xl border p-4 ${blocker.severity === "critical" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium">{blocker.name}</div>
                            <Badge variant="outline" className={blocker.severity === "critical" ? "border-rose-200 text-rose-700" : "border-amber-200 text-amber-700"}>
                              {blocker.severity === "critical" ? "Critico" : "Atencao"}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">{blocker.reason}</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span>Gasto: {formatCurrency(blocker.spend)}</span>
                            <span>CTR: {formatPercent(blocker.ctr)}</span>
                            <span>CPC: {formatCurrency(blocker.cpc)}</span>
                            <span>Conversoes: {formatNumber(blocker.conversions)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="deep" className="space-y-4">
              <Card className="shadow-card">
                <CardHeader>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        Leitura profunda Andromeda
                      </CardTitle>
                      <CardDescription>
                        Checks avancados de estrutura, criativo, entrega e conta para um cliente especifico.
                      </CardDescription>
                    </div>
                    <Button
                      onClick={() => void runAdvancedDiagnostics()}
                      disabled={!canRunAdvancedDiagnostics || advancedLoading}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${advancedLoading ? "animate-spin" : ""}`} />
                      {advancedLoading ? "Rodando checks..." : "Rodar leitura profunda"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedClient === "all" ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                      Selecione um cliente para rodar os checks avancados da conta Meta.
                    </div>
                  ) : !canRunAdvancedDiagnostics ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                      Esse cliente ainda nao tem conta Meta conectada com token valido para a leitura profunda.
                    </div>
                  ) : advancedResults.length === 0 ? (
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                      Clique em <strong className="text-foreground">Rodar leitura profunda</strong> para verificar CBO, aprendizado, fadiga,
                      frequencia, orçamento e saude operacional da conta.
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                          <div className="text-xs uppercase tracking-wide text-emerald-700">Passou</div>
                          <div className="mt-2 text-2xl font-semibold text-emerald-800">{advancedSummary.pass}</div>
                        </div>
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                          <div className="text-xs uppercase tracking-wide text-amber-700">Atencao</div>
                          <div className="mt-2 text-2xl font-semibold text-amber-800">{advancedSummary.warn}</div>
                        </div>
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                          <div className="text-xs uppercase tracking-wide text-rose-700">Critico</div>
                          <div className="mt-2 text-2xl font-semibold text-rose-800">{advancedSummary.fail}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-xs uppercase tracking-wide text-slate-700">Ignorados</div>
                          <div className="mt-2 text-2xl font-semibold text-slate-800">{advancedSummary.skip}</div>
                        </div>
                      </div>

                      <div className="grid gap-3">
                        {advancedResults.map((result) => {
                          const tone =
                            result.status === "pass" ? "good" : result.status === "warn" ? "warning" : result.status === "fail" ? "critical" : null;

                          return (
                            <div
                              key={result.id}
                              className={`rounded-2xl border p-4 ${
                                tone ? getToneClasses(tone) : "border-slate-200 bg-slate-50 text-slate-700"
                              }`}
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium">{result.name}</p>
                                    <Badge variant="outline" className="rounded-full">
                                      {result.category}
                                    </Badge>
                                  </div>
                                  <p className="mt-2 text-sm opacity-90">{result.message}</p>
                                  {result.details && <p className="mt-2 text-sm opacity-80">{result.details}</p>}
                                  {result.recommendation && (
                                    <p className="mt-3 text-sm font-medium">Acao recomendada: {result.recommendation}</p>
                                  )}
                                </div>
                                <Badge
                                  variant="outline"
                                  className={
                                    result.status === "pass"
                                      ? "border-emerald-200 text-emerald-700"
                                      : result.status === "warn"
                                        ? "border-amber-200 text-amber-700"
                                        : result.status === "fail"
                                          ? "border-rose-200 text-rose-700"
                                          : "border-slate-200 text-slate-700"
                                  }
                                >
                                  {result.status === "pass"
                                    ? "OK"
                                    : result.status === "warn"
                                      ? "Atencao"
                                      : result.status === "fail"
                                        ? "Critico"
                                        : "Ignorado"}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="plan" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <Card className="shadow-card">
                  <CardHeader>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-primary" />
                          Plano de acao do Andromeda
                        </CardTitle>
                        <CardDescription>
                          Uma sequencia objetiva do que atacar agora para destravar a conta.
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => void copyActionPlan()}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copiar plano
                        </Button>
                        <Button variant="outline" size="sm" onClick={exportActionPlan}>
                          <Download className="mr-2 h-4 w-4" />
                          Exportar .txt
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {actionPlan.length === 0 ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                        Nenhum plano urgente foi montado. A conta esta relativamente equilibrada para seguir monitorando e escalar com calma.
                      </div>
                    ) : (
                      actionPlan.map((item, index) => {
                        const bucket = getPlanBucketMeta(item.bucket);
                        return (
                          <div key={`${item.bucket}-${index}`} className={`rounded-2xl border p-4 ${bucket.className}`}>
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-medium">{item.title}</p>
                              <Badge variant="outline" className={bucket.className}>
                                {bucket.label}
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm opacity-90">{item.detail}</p>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-card">
                  <CardHeader>
                    <CardTitle>Sequencia recomendada</CardTitle>
                    <CardDescription>
                      A logica ideal e arrumar a base antes de colocar mais combustivel na conta.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {[
                      {
                        step: "1",
                        title: "Tirar o peso morto",
                        text: "Corte campanhas com gasto relevante e nenhum retorno antes de aumentar investimento no resto.",
                      },
                      {
                        step: "2",
                        title: "Reforcar criativo",
                        text: "O Andromeda responde melhor quando tem variacao criativa suficiente para encontrar combinacoes vencedoras.",
                      },
                      {
                        step: "3",
                        title: "Consolidar estrutura",
                        text: "Menos fragmentacao gera mais sinal por conjunto e deixa a IA alocar melhor a verba.",
                      },
                      {
                        step: "4",
                        title: "Escalar o que provou resultado",
                        text: "So depois disso vale subir orcamento nas campanhas com CTR, CPC e conversao mais consistentes.",
                      },
                    ].map((item) => (
                      <div key={item.step} className="flex gap-3 rounded-2xl border border-border/70 p-4">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
                          {item.step}
                        </div>
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="clients" className="space-y-4">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Ranking de prontidao por cliente</CardTitle>
                  <CardDescription>Quem esta mais perto de operar no modelo novo com menos atrito.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {clientReadiness.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum cliente ativo encontrado.</p>
                  ) : (
                    clientReadiness.map((client) => (
                      <div key={client.id} className="rounded-2xl border border-border/70 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{client.name}</p>
                              <Badge variant="outline" className={getToneClasses(getScoreTone(client.score))}>
                                Score {client.score}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {client.activeCampaigns} campanha(s) ativa(s) · maior gargalo em {client.topGap.toLowerCase()}.
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="rounded-full">
                              Sync: {client.syncStatus}
                            </Badge>
                            <Button variant="outline" size="sm" onClick={() => setSelectedClient(client.id)}>
                              Ver leitura
                              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-3">
                          <Progress value={client.score} className="h-2.5" />
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="playbook" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    icon: Lightbulb,
                    title: "Criativo vira alvo",
                    text: "Nao tente adivinhar publico demais. Melhore os angulos, promessas, provas e formatos do criativo.",
                  },
                  {
                    icon: Layers,
                    title: "Simplifique estrutura",
                    text: "Menos campanhas e menos fragmentacao ajudam o algoritmo a concentrar sinal e verba no que responde.",
                  },
                  {
                    icon: Radar,
                    title: "Alimente com sinal real",
                    text: "Sem cliques, compras e eventos confiaveis, a IA nao consegue encontrar padroes bons de escala.",
                  },
                  {
                    icon: ChevronsRight,
                    title: "Escala com calma",
                    text: "Primeiro arrume CTR, custo do clique e criativos. Depois aumente verba com estrutura mais limpa.",
                  },
                ].map(({ icon: Icon, title, text }) => (
                  <Card key={title} className="shadow-card">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-primary" />
                        <CardTitle className="text-base">{title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{text}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="shadow-card border-emerald-200 bg-gradient-to-br from-white via-emerald-50/50 to-amber-50/70">
                <CardHeader>
                  <CardTitle>Proximo passo sugerido</CardTitle>
                  <CardDescription>Use a leitura da Andromeda para acionar a proxima etapa do produto.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 md:flex-row">
                  <Button className="flex-1" onClick={() => navigate("/campaigns")}>
                    Ir para campanhas
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button className="flex-1" variant="outline" onClick={() => navigate("/clients")}>
                    Revisar clientes e sync
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button className="flex-1" variant="outline" onClick={() => navigate("/alerts")}>
                    Ajustar alertas
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
