import { useEffect, useMemo, useState } from "react";
import { endOfMonth, format, startOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Download, FileText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ReportData } from "@/lib/report-types";
import { buildReportPdfBlob, downloadBlob } from "@/lib/report-pdf";
import { summarizePeriod } from "@/lib/ai-service";

interface ReportGeneratorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  onReportCreated?: () => void;
}

interface SocialPresenceSnapshot {
  enabled: boolean;
  profileName: string;
  logoUrl?: string | null;
  sourceLabels: string[];
  metrics: Array<{
    key: SocialMetricPreference;
    label: string;
    value: number | null;
    source: string;
  }>;
}

const PERIOD_PRESETS = [
  { label: "Ultimos 7 dias", days: 7 },
  { label: "Ultimos 30 dias", days: 30 },
  { label: "Ultimos 90 dias", days: 90 },
  { label: "Este mes", days: 0 },
];

const REPORT_METRIC_OPTIONS = [
  { key: "purchaseValue", label: "Valor de conversao de compras", helper: "Valor total gerado por compras" },
  { key: "purchases", label: "Compras", helper: "Quantidade total de compras" },
  { key: "costPerPurchase", label: "Custo por compra", helper: "Investimento medio por compra" },
  { key: "spend", label: "Valor investido", helper: "Total gasto no periodo" },
  { key: "impressions", label: "Impressoes", helper: "Entrega total da conta" },
  { key: "clicks", label: "Total de cliques no link", helper: "Cliques no link registrados no periodo" },
  { key: "messagesStarted", label: "Mensagens iniciadas", helper: "Conversas abertas no periodo" },
  { key: "roas", label: "ROAS", helper: "Retorno sobre investimento" },
  { key: "revenue", label: "Faturamento", helper: "Receita gerada no periodo" },
  { key: "ctr", label: "CTR", helper: "Taxa de cliques no link" },
  { key: "cpc", label: "CPC", helper: "Custo medio por clique" },
  { key: "cpm", label: "CPM", helper: "Custo por mil impressoes" },
  { key: "reach", label: "Alcance", helper: "Pessoas unicas alcancadas" },
  { key: "frequency", label: "Frequencia", helper: "Media de exibicoes por pessoa" },
] as const;

type ReportMetricPreference = (typeof REPORT_METRIC_OPTIONS)[number]["key"];
type SocialMetricPreference = "followers" | "reach" | "engagement";

const META_BASE = "https://graph.facebook.com/v21.0";
const PURCHASE_ACTION_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"] as const;
const SOCIAL_METRIC_OPTIONS = [
  { key: "followers", label: "Seguidores", helper: "Soma Facebook + Instagram quando disponivel" },
  { key: "reach", label: "Alcance", helper: "Insights da Meta para o periodo do relatorio" },
  { key: "engagement", label: "Engajamento", helper: "Interacoes retornadas pela Meta quando disponiveis" },
] as const;

function normalizeAccountId(id: string) {
  return id.startsWith("act_") ? id.slice(4) : id.trim();
}

async function fetchMetaJson<T>(path: string, params: Record<string, string>) {
  const response = await fetch(`${META_BASE}/${path}?${new URLSearchParams(params)}`);
  const json = await response.json();

  if (!response.ok || json.error) {
    throw new Error(json.error?.message || "Erro ao buscar dados na Meta");
  }

  return json as T;
}

async function fetchMetaCollection<T>(path: string, params: Record<string, string>) {
  let url: string | undefined = `${META_BASE}/${path}?${new URLSearchParams(params)}`;
  const rows: T[] = [];

  while (url) {
    const response = await fetch(url);
    const json = await response.json();

    if (!response.ok || json.error) {
      throw new Error(json.error?.message || "Erro ao buscar dados na Meta");
    }

    rows.push(...(Array.isArray(json.data) ? json.data : []));
    url = json.paging?.next;
  }

  return rows;
}

function extractMessagesStarted(actions?: Array<{ action_type?: string; value?: string }>) {
  if (!actions?.length) return 0;

  return actions.reduce((total, action) => {
    const type = action.action_type ?? "";
    if (!type.includes("messaging_conversation_started")) return total;
    return total + (parseInt(action.value ?? "0", 10) || 0);
  }, 0);
}

function extractActionTotal(
  actions: Array<{ action_type?: string; value?: string }> | undefined,
  acceptedTypes: string[]
) {
  if (!actions?.length) return 0;

  return actions.reduce((total, action) => {
    const type = action.action_type ?? "";
    if (!acceptedTypes.includes(type)) return total;
    return total + (parseFloat(action.value ?? "0") || 0);
  }, 0);
}

function extractPrimaryActionMetric(
  rows: Array<{ actions?: Array<{ action_type?: string; value?: string }>; action_values?: Array<{ action_type?: string; value?: string }> }>,
  source: "actions" | "action_values",
  acceptedTypes: readonly string[]
) {
  for (const type of acceptedTypes) {
    const total = rows.reduce((sum, row) => {
      const collection = source === "actions" ? row.actions : row.action_values;
      return sum + extractActionTotal(collection, [type]);
    }, 0);

    if (total > 0) {
      return { type, total };
    }
  }

  return { type: acceptedTypes[0], total: 0 };
}

function buildFallbackRecommendations(data: ReportData) {
  const ctr = data.summary.ctr;
  const cpc = data.summary.cpc;
  const purchases = data.summary.purchases || data.summary.conversions;
  const spend = data.summary.spend;
  const messagesStarted = data.summary.messagesStarted || 0;
  const topCampaign = data.topCampaigns[0];

  const strength =
    ctr >= 1.5
      ? "O periodo mostrou boa capacidade de gerar interesse, com CTR saudavel e volume consistente de cliques."
      : "O periodo mostrou entrega, mas o nivel de interesse ainda pode evoluir, com CTR abaixo do ideal para escalar com seguranca.";

  const warning =
    purchases > 0 || messagesStarted > 0
      ? "O principal foco agora deve ser aumentar a eficiencia do que ja converte, concentrando verba nos conjuntos e criativos com melhor resposta."
      : "O principal ponto de atencao e transformar trafego em resultado, porque houve consumo de verba sem conversoes ou conversas suficientes.";

  const action =
    topCampaign
      ? `Como proximo passo, vale priorizar a campanha ${topCampaign.name} como referencia de otimizacao, revisar segmentacoes de baixo desempenho e testar novas variacoes de criativo para reduzir CPC e elevar conversao.`
      : "Como proximo passo, vale revisar segmentacoes, criativos e pagina de destino para reduzir CPC e melhorar a taxa de resposta do periodo.";

  return `${strength} Foram investidos ${spend.toFixed(2)} no periodo, com CPC medio de ${cpc.toFixed(2)} e ${purchases} compras registradas. ${warning} ${action}`;
}

export function ReportGeneratorDialog({
  isOpen,
  onClose,
  clientId,
  clientName,
  onReportCreated,
}: ReportGeneratorDialogProps) {
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState("30");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [recommendations, setRecommendations] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [recommendationSource, setRecommendationSource] = useState<"empty" | "ai" | "manual">("empty");
  const [metricPreferences, setMetricPreferences] = useState<ReportMetricPreference[]>([
    "purchaseValue",
    "purchases",
    "costPerPurchase",
    "messagesStarted",
    "roas",
    "impressions",
    "ctr",
  ]);
  const [includeSocialPresence, setIncludeSocialPresence] = useState(true);
  const [socialMetricPreferences, setSocialMetricPreferences] = useState<SocialMetricPreference[]>([
    "followers",
    "reach",
    "engagement",
  ]);
  const recommendationKey = useMemo(() => `${clientId}:${startDate}:${endDate}`, [clientId, startDate, endDate]);

  function applyPreset(value: string) {
    setPreset(value);
    const days = parseInt(value);
    if (days === 0) {
      setStartDate(format(startOfMonth(new Date()), "yyyy-MM-dd"));
      setEndDate(format(endOfMonth(new Date()), "yyyy-MM-dd"));
    } else {
      setStartDate(format(subDays(new Date(), days), "yyyy-MM-dd"));
      setEndDate(format(new Date(), "yyyy-MM-dd"));
    }
  }

  async function fetchMessagesStarted(metaAdAccountId?: string | null, metaAccessToken?: string | null) {
    if (!metaAdAccountId || !metaAccessToken) return 0;

    const url = `${META_BASE}/act_${normalizeAccountId(metaAdAccountId)}/insights?${new URLSearchParams({
      fields: "actions",
      level: "account",
      time_range: JSON.stringify({ since: startDate, until: endDate }),
      access_token: metaAccessToken.trim(),
    })}`;

    const response = await fetch(url);
    const json = await response.json();

    if (!response.ok || json.error) {
      throw new Error(json.error?.message || "Erro ao buscar mensagens iniciadas na Meta");
    }

    const rows = Array.isArray(json.data) ? json.data : [];
    return rows.reduce(
      (total: number, row: { actions?: Array<{ action_type?: string; value?: string }> }) =>
        total + extractMessagesStarted(row.actions),
      0
    );
  }

  async function fetchAccountConversionMetrics(metaAdAccountId?: string | null, metaAccessToken?: string | null) {
    if (!metaAdAccountId || !metaAccessToken) {
      return { spend: 0, impressions: 0, clicks: 0, messagesStarted: 0, purchases: 0, purchaseValue: 0, costPerPurchase: 0, reach: 0, frequency: 0 };
    }

    const url = `${META_BASE}/act_${normalizeAccountId(metaAdAccountId)}/insights?${new URLSearchParams({
      fields: "actions,action_values,spend,impressions,inline_link_clicks,reach,frequency",
      level: "account",
      time_range: JSON.stringify({ since: startDate, until: endDate }),
      access_token: metaAccessToken.trim(),
    })}`;

    const response = await fetch(url);
    const json = await response.json();

    if (!response.ok || json.error) {
      throw new Error(json.error?.message || "Erro ao buscar metricas de conversao na Meta");
    }

    const rows = Array.isArray(json.data) ? json.data : [];
    const purchaseMetric = extractPrimaryActionMetric(rows, "actions", PURCHASE_ACTION_TYPES);
    const purchaseValueMetric = extractPrimaryActionMetric(rows, "action_values", PURCHASE_ACTION_TYPES);
    const spend = rows.reduce((total: number, row: { spend?: string }) => total + (parseFloat(row.spend ?? "0") || 0), 0);
    const impressions = rows.reduce((total: number, row: { impressions?: string }) => total + (parseInt(row.impressions ?? "0", 10) || 0), 0);
    const clicks = rows.reduce(
      (total: number, row: { inline_link_clicks?: string }) => total + (parseInt(row.inline_link_clicks ?? "0", 10) || 0),
      0
    );
    const messagesStarted = rows.reduce(
      (total: number, row: { actions?: Array<{ action_type?: string; value?: string }> }) =>
        total + extractMessagesStarted(row.actions),
      0
    );
    const reach = rows.reduce((total: number, row: { reach?: string }) => total + (parseInt(row.reach ?? "0", 10) || 0), 0);
    const frequency = reach > 0 ? impressions / reach : 0;

    const purchases = purchaseMetric.total;
    const purchaseValue = purchaseValueMetric.total;

    return {
      spend,
      impressions,
      clicks,
      messagesStarted,
      purchases,
      purchaseValue,
      costPerPurchase: purchases > 0 ? spend / purchases : 0,
      reach,
      frequency,
    };
  }

  async function fetchMetaCampaignSummaries(metaAdAccountId?: string | null, metaAccessToken?: string | null) {
    if (!metaAdAccountId || !metaAccessToken) return [];

      const rows = await fetchMetaCollection<Array<{
        name?: string;
        status?: string;
        insights?: {
          data?: Array<{
            spend?: string;
            impressions?: string;
            inline_link_clicks?: string;
            actions?: Array<{ action_type?: string; value?: string }>;
            action_values?: Array<{ action_type?: string; value?: string }>;
          }>;
        };
      }>[number]>(`act_${normalizeAccountId(metaAdAccountId)}/campaigns`, {
      fields: `name,status,insights.time_range(${JSON.stringify({ since: startDate, until: endDate })}){spend,impressions,inline_link_clicks,actions,action_values}`,
      limit: "200",
      access_token: metaAccessToken.trim(),
    });

    return rows
      .map((campaign) => {
        const insight = campaign.insights?.data?.[0];
        const purchaseMetric = extractPrimaryActionMetric([{ actions: insight?.actions, action_values: insight?.action_values }], "actions", PURCHASE_ACTION_TYPES);
        const purchaseValueMetric = extractPrimaryActionMetric([{ actions: insight?.actions, action_values: insight?.action_values }], "action_values", PURCHASE_ACTION_TYPES);
        const purchases = purchaseMetric.total;
        const purchaseValue = purchaseValueMetric.total;
        const spend = parseFloat(insight?.spend ?? "0") || 0;
        const impressions = parseInt((insight as { impressions?: string } | undefined)?.impressions ?? "0", 10) || 0;
        const clicks = parseInt((insight as { inline_link_clicks?: string } | undefined)?.inline_link_clicks ?? "0", 10) || 0;

        return {
          name: campaign.name || "Campanha sem nome",
          status: campaign.status || "ACTIVE",
          spend,
          conversions: purchases,
          revenue: purchaseValue,
          roas: spend > 0 ? purchaseValue / spend : 0,
          impressions,
          clicks,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        };
      })
      .filter((campaign) => campaign.spend > 0 || campaign.conversions > 0 || campaign.revenue > 0)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10);
  }

  async function fetchMetaAdSummaries(metaAdAccountId?: string | null, metaAccessToken?: string | null) {
    if (!metaAdAccountId || !metaAccessToken) return [];

    const rows = await fetchMetaCollection<Array<{
      name?: string;
      status?: string;
      creative?: {
        thumbnail_url?: string;
        image_url?: string;
        object_type?: string;
        video_id?: string;
      };
      insights?: {
        data?: Array<{
          spend?: string;
          impressions?: string;
          inline_link_clicks?: string;
        }>;
      };
    }>[number]>(`act_${normalizeAccountId(metaAdAccountId)}/ads`, {
      fields: `name,status,creative{thumbnail_url,image_url,object_type,video_id},insights.time_range(${JSON.stringify({ since: startDate, until: endDate })}){spend,impressions,inline_link_clicks}`,
      limit: "200",
      access_token: metaAccessToken.trim(),
    });

    return rows
      .map((ad) => {
        const insight = ad.insights?.data?.[0];
        const spend = parseFloat(insight?.spend ?? "0") || 0;
        const impressions = parseInt(insight?.impressions ?? "0", 10) || 0;
        const clicks = parseInt(insight?.inline_link_clicks ?? "0", 10) || 0;

        return {
          name: ad.name || "Anuncio sem nome",
          spend,
          impressions,
          clicks,
          status: ad.status || "ACTIVE",
          previewUrl: ad.creative?.thumbnail_url || ad.creative?.image_url || null,
          creativeType: ad.creative?.object_type === "VIDEO" || ad.creative?.video_id ? "video" : "image",
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
          cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        };
      })
      .filter((ad) => ad.spend > 0 || ad.impressions > 0 || ad.clicks > 0)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 12);
  }

  async function fetchFacebookPresence(metaPageId?: string | null, metaAccessToken?: string | null) {
    if (!metaPageId || !metaAccessToken) {
      return {
        pageName: null,
        followers: null,
        reach: null,
        engagement: null,
        instagramAccountId: null,
      };
    }

    const pageInfo = await fetchMetaJson<{
      name?: string;
      fan_count?: number;
      followers_count?: number;
      instagram_business_account?: { id?: string };
    }>(metaPageId, {
      fields: "name,fan_count,followers_count,instagram_business_account{id}",
      access_token: metaAccessToken.trim(),
    });

    let reach: number | null = null;
    let engagement: number | null = null;

    try {
      const insights = await fetchMetaJson<{
        data?: Array<{ name?: string; values?: Array<{ value?: number }> }>;
      }>(`${metaPageId}/insights`, {
        metric: "page_impressions_unique,page_post_engagements",
        since: startDate,
        until: endDate,
        access_token: metaAccessToken.trim(),
      });

      const rows = insights.data || [];
      reach = rows.find((row) => row.name === "page_impressions_unique")?.values?.reduce((sum, item) => sum + (item.value || 0), 0) ?? null;
      engagement =
        rows.find((row) => row.name === "page_post_engagements")?.values?.reduce((sum, item) => sum + (item.value || 0), 0) ?? null;
    } catch {
      // Some page insights are unavailable depending on permissions or account setup.
    }

    return {
      pageName: pageInfo.name || null,
      followers: pageInfo.followers_count ?? pageInfo.fan_count ?? null,
      reach,
      engagement,
      instagramAccountId: pageInfo.instagram_business_account?.id || null,
    };
  }

  async function fetchInstagramPresence(metaInstagramAccountId?: string | null, metaAccessToken?: string | null) {
    if (!metaInstagramAccountId || !metaAccessToken) {
      return {
        username: null,
        followers: null,
        reach: null,
        engagement: null,
      };
    }

    const profile = await fetchMetaJson<{ username?: string; followers_count?: number }>(metaInstagramAccountId, {
      fields: "username,followers_count",
      access_token: metaAccessToken.trim(),
    });

    let reach: number | null = null;
    let engagement: number | null = null;

    try {
      const insights = await fetchMetaJson<{
        data?: Array<{ name?: string; total_value?: { value?: number } }>;
      }>(`${metaInstagramAccountId}/insights`, {
        metric: "reach,accounts_engaged",
        period: "day",
        since: startDate,
        until: endDate,
        access_token: metaAccessToken.trim(),
      });

      const rows = insights.data || [];
      reach = rows.find((row) => row.name === "reach")?.total_value?.value ?? null;
      engagement = rows.find((row) => row.name === "accounts_engaged")?.total_value?.value ?? null;
    } catch {
      // Instagram insights can be unavailable for some accounts or permissions.
    }

    return {
      username: profile.username || null,
      followers: profile.followers_count ?? null,
      reach,
      engagement,
    };
  }

  async function buildSocialPresence(client: {
    name?: string | null;
    logo_url?: string | null;
    meta_page_id?: string | null;
    meta_page_name?: string | null;
    meta_instagram_account_id?: string | null;
    meta_access_token?: string | null;
  }): Promise<SocialPresenceSnapshot | undefined> {
    if (!includeSocialPresence) return undefined;

    const token = client.meta_access_token?.trim();
    const pageResult = token ? await fetchFacebookPresence(client.meta_page_id, token).catch(() => null) : null;
    const instagramAccountId = pageResult?.instagramAccountId || client.meta_instagram_account_id || null;
    const instagramResult = token ? await fetchInstagramPresence(instagramAccountId, token).catch(() => null) : null;
    const sourceLabels = [pageResult ? "Facebook" : null, instagramResult ? "Instagram" : null].filter(Boolean) as string[];
    const sourceText = sourceLabels.length ? sourceLabels.join(" + ") : "Dados nao disponiveis";

    const totals = {
      followers:
        (pageResult?.followers ?? 0) + (instagramResult?.followers ?? 0) > 0
          ? (pageResult?.followers ?? 0) + (instagramResult?.followers ?? 0)
          : null,
      reach:
        (pageResult?.reach ?? 0) + (instagramResult?.reach ?? 0) > 0
          ? (pageResult?.reach ?? 0) + (instagramResult?.reach ?? 0)
          : null,
      engagement:
        (pageResult?.engagement ?? 0) + (instagramResult?.engagement ?? 0) > 0
          ? (pageResult?.engagement ?? 0) + (instagramResult?.engagement ?? 0)
          : null,
    };

    return {
      enabled: true,
      profileName: client.meta_page_name || pageResult?.pageName || client.name || clientName,
      logoUrl: client.logo_url || null,
      sourceLabels,
      metrics: socialMetricPreferences.map((key) => ({
        key,
        label: SOCIAL_METRIC_OPTIONS.find((option) => option.key === key)?.label || key,
        value: totals[key],
        source: sourceText,
      })),
    };
  }

  async function buildReportData(): Promise<ReportData> {
    const { data: clientRaw, error: clientError } = await supabase
      .from("clients")
      .select("name, logo_url, meta_ad_account_id, meta_access_token, meta_page_id, meta_page_name, meta_instagram_account_id")
      .eq("id", clientId)
      .single();

    if (clientError) throw clientError;

    const { data: metricsRaw, error: metricsError } = await supabase
      .from("campaign_daily_metrics")
      .select("spend, impressions, clicks")
      .eq("client_id", clientId)
      .gte("date", startDate)
      .lte("date", endDate);

    if (metricsError) throw metricsError;

    const { data: campaignsRaw, error: campaignsError } = await supabase
      .from("campaigns")
      .select("name, status, spend, conversions")
      .eq("client_id", clientId);

    if (campaignsError) throw campaignsError;

    const { data: adsRaw, error: adsError } = await supabase
      .from("ads")
      .select("name, spend, impressions, clicks, status, thumbnail_url, image_url, creative_type, ad_sets(campaigns(client_id))");

    if (adsError) throw adsError;

    const metrics = metricsRaw || [];
    const campaigns = campaignsRaw || [];
    const ads = (adsRaw || []).filter((ad: any) => ad.ad_sets?.campaigns?.client_id === clientId);

    let conversionMetrics = { spend: 0, impressions: 0, clicks: 0, messagesStarted: 0, purchases: 0, purchaseValue: 0, costPerPurchase: 0, reach: 0, frequency: 0 };
    try {
      conversionMetrics = await fetchAccountConversionMetrics(clientRaw.meta_ad_account_id, clientRaw.meta_access_token);
    } catch {
      try {
        conversionMetrics.messagesStarted = await fetchMessagesStarted(clientRaw.meta_ad_account_id, clientRaw.meta_access_token);
      } catch {
        conversionMetrics.messagesStarted = 0;
      }
    }

    const summary = metrics.reduce(
      (acc: any, item: any) => ({
        spend: acc.spend + (item.spend || 0),
        revenue: 0,
        impressions: acc.impressions + (item.impressions || 0),
        clicks: acc.clicks + (item.clicks || 0),
        conversions: acc.conversions,
        messagesStarted: acc.messagesStarted,
      }),
      { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0, messagesStarted: conversionMetrics.messagesStarted }
    );

    summary.spend = conversionMetrics.spend || summary.spend;
    summary.impressions = conversionMetrics.impressions || summary.impressions;
    summary.clicks = conversionMetrics.clicks || summary.clicks;
    summary.conversions = conversionMetrics.purchases || campaigns.reduce((total: number, campaign: any) => total + (campaign.conversions || 0), 0);
    summary.revenue = conversionMetrics.purchaseValue;
    summary.purchases = conversionMetrics.purchases;
    summary.purchaseValue = conversionMetrics.purchaseValue;
    summary.costPerPurchase = conversionMetrics.costPerPurchase;
    summary.roas = summary.spend > 0 ? summary.revenue / summary.spend : 0;
    summary.ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions) * 100 : 0;
    summary.cpc = summary.clicks > 0 ? summary.spend / summary.clicks : 0;
    summary.cpm = summary.impressions > 0 ? (summary.spend / summary.impressions) * 1000 : 0;
    summary.reach = conversionMetrics.reach;
    summary.frequency = conversionMetrics.frequency;

    let topCampaigns = campaigns
      .map((campaign: any) => ({
        name: campaign.name,
        status: campaign.status,
        spend: campaign.spend || 0,
        conversions: campaign.conversions || 0,
        revenue: 0,
        roas: 0,
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10);

    try {
      const metaCampaigns = await fetchMetaCampaignSummaries(clientRaw.meta_ad_account_id, clientRaw.meta_access_token);
      if (metaCampaigns.length > 0) {
        topCampaigns = metaCampaigns;
      }
    } catch {
      // Fallback para os dados locais se a consulta detalhada falhar.
    }

    let topAds = ads
      .map((ad: any) => ({
        name: ad.name,
        spend: ad.spend || 0,
        impressions: ad.impressions || 0,
        clicks: ad.clicks || 0,
        status: ad.status || "ACTIVE",
        previewUrl: ad.thumbnail_url || ad.image_url || null,
        creativeType: ad.creative_type || "image",
        ctr: ad.impressions > 0 ? ((ad.clicks || 0) / ad.impressions) * 100 : 0,
        cpc: ad.clicks > 0 ? (ad.spend || 0) / ad.clicks : 0,
        cpm: ad.impressions > 0 ? ((ad.spend || 0) / ad.impressions) * 1000 : 0,
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 12);

    try {
      const metaAds = await fetchMetaAdSummaries(clientRaw.meta_ad_account_id, clientRaw.meta_access_token);
      if (metaAds.length > 0) {
        topAds = metaAds;
      }
    } catch {
      // Fallback para anuncios salvos localmente se a consulta do periodo falhar.
    }

    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const periodLabel = `${format(start, "dd MMM yyyy", { locale: ptBR })} ate ${format(end, "dd MMM yyyy", { locale: ptBR })}`;
    const socialPresence = await buildSocialPresence(clientRaw);

    return {
      generatedAt: format(new Date(), "dd/MM/yyyy 'as' HH:mm"),
      client: {
        name: clientRaw.name || clientName,
        adAccountLabel: clientRaw.meta_ad_account_id ? `CA - ${clientRaw.meta_ad_account_id}` : "Conta Meta conectada",
        logoUrl: clientRaw.logo_url || null,
      },
      period: { start: startDate, end: endDate, label: periodLabel },
      summary,
      socialPresence,
      topCampaigns,
      topAds,
      recommendations: recommendations || "Nenhuma recomendacao registrada para este periodo.",
      metricPreferences,
      branding: { primaryColor: "#2563eb", agencyName: "MarketProAds" },
    };
  }

  function toggleMetricPreference(metric: ReportMetricPreference) {
    setMetricPreferences((current) => {
      if (current.includes(metric)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== metric);
      }

      return [...current, metric];
    });
  }

  function toggleSocialMetricPreference(metric: SocialMetricPreference) {
    setSocialMetricPreferences((current) => {
      if (current.includes(metric)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== metric);
      }

      return [...current, metric];
    });
  }

  async function generateAiRecommendations() {
    setAiLoading(true);
    try {
      const reportData = await buildReportData();
      const activeCampaigns = reportData.topCampaigns.filter((campaign) => campaign.status === "ACTIVE").length;
      const activeAds = reportData.topAds.filter((ad) => ad.status === "ACTIVE").length;
      const topCampaign = reportData.topCampaigns[0];
      const topAd = reportData.topAds[0];

      const result = await summarizePeriod({
        period: { start: startDate, end: endDate },
        metrics: {
          spend: reportData.summary.spend,
          impressions: reportData.summary.impressions,
          clicks: reportData.summary.clicks,
          ctr: reportData.summary.ctr,
          cpc: reportData.summary.cpc,
          cpm: reportData.summary.cpm,
          conversions: reportData.summary.conversions,
          messages_started: reportData.summary.messagesStarted || 0,
          active_campaigns: activeCampaigns,
          active_ads: activeAds,
          top_campaign_spend: topCampaign?.spend || 0,
          top_campaign_conversions: topCampaign?.conversions || 0,
          top_ad_ctr: topAd?.ctr || 0,
          top_ad_clicks: topAd?.clicks || 0,
        },
      });

      setRecommendations(result.summary);
      setRecommendationSource("ai");
    } catch (error) {
      const reportData = await buildReportData();
      const fallback = buildFallbackRecommendations(reportData);
      setRecommendations(fallback);
      setRecommendationSource("ai");
      toast.warning(
        error instanceof Error
          ? `${error.message}. Usando recomendacao local.`
          : "IA indisponivel no momento. Usando recomendacao local."
      );
    } finally {
      setAiLoading(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    if (recommendationSource === "manual") return;
    void generateAiRecommendations();
  }, [isOpen, recommendationKey]);

  async function handleGenerate(download: boolean) {
    setLoading(true);
    try {
      let finalRecommendations = recommendations;

      if (!finalRecommendations.trim()) {
        const reportPreview = await buildReportData();
        try {
          const result = await summarizePeriod({
            period: { start: startDate, end: endDate },
            metrics: {
              spend: reportPreview.summary.spend,
              impressions: reportPreview.summary.impressions,
              clicks: reportPreview.summary.clicks,
              ctr: reportPreview.summary.ctr,
              cpc: reportPreview.summary.cpc,
              cpm: reportPreview.summary.cpm,
              conversions: reportPreview.summary.conversions,
              messages_started: reportPreview.summary.messagesStarted || 0,
            },
          });

          finalRecommendations = result.summary;
          setRecommendations(result.summary);
          setRecommendationSource("ai");
        } catch {
          finalRecommendations = buildFallbackRecommendations(reportPreview);
          setRecommendations(finalRecommendations);
          setRecommendationSource("ai");
        }
      }

      const data = await buildReportData();
      data.recommendations = finalRecommendations;

      const { data: session } = await supabase.auth.getSession();
      const tenantId = session.session?.user.id;
      if (!tenantId) throw new Error("Nao autenticado");

      const periodLabel = data.period.label;
      const reportName = `${clientName} - ${periodLabel}`;

      if (download) {
        const blob = await buildReportPdfBlob(data);
        const filename = `relatorio-${clientName.toLowerCase().replace(/\s+/g, "-")}-${startDate}.pdf`;
        downloadBlob(blob, filename);
      }

      const shareToken = crypto.randomUUID();

      const { error } = await supabase.from("reports").insert({
        tenant_id: tenantId,
        client_id: clientId,
        name: reportName,
        period: { start: startDate, end: endDate, label: periodLabel },
        data,
        status: "ready",
        file_url: null,
        share_token: shareToken,
      });

      if (error) throw error;

      toast.success("Relatorio gerado com sucesso!");
      onReportCreated?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao gerar relatorio");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Gerar Relatorio - {clientName}
          </DialogTitle>
          <DialogDescription>Configure o periodo e personalize o relatorio</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Periodo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={preset} onValueChange={applyPreset}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Selecione o periodo" />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_PRESETS.map((item) => (
                    <SelectItem key={item.days} value={String(item.days)}>
                      {item.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Inicio</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(event) => {
                      setStartDate(event.target.value);
                      setPreset("custom");
                    }}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fim</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(event) => {
                      setEndDate(event.target.value);
                      setPreset("custom");
                    }}
                    className="text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Preferencias do relatorio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {REPORT_METRIC_OPTIONS.map((option) => (
                <label
                  key={option.key}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 p-3 transition-colors hover:bg-muted/30"
                >
                  <input
                    type="checkbox"
                    checked={metricPreferences.includes(option.key)}
                    onChange={() => toggleMetricPreference(option.key)}
                    className="mt-1 h-4 w-4 rounded border"
                  />
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="text-xs text-muted-foreground">{option.helper}</div>
                  </div>
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Logo e presenca digital</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">Mostrar logo do cliente + nome</div>
                  <div className="text-xs text-muted-foreground">
                    Usa a logo salva quando a pagina do cliente e conectada na tela de clientes.
                  </div>
                </div>
                <Switch checked={includeSocialPresence} onCheckedChange={setIncludeSocialPresence} />
              </div>

              {includeSocialPresence && (
                <div className="space-y-2">
                  {SOCIAL_METRIC_OPTIONS.map((option) => (
                    <label
                      key={option.key}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 p-3 transition-colors hover:bg-muted/30"
                    >
                      <input
                        type="checkbox"
                        checked={socialMetricPreferences.includes(option.key)}
                        onChange={() => toggleSocialMetricPreference(option.key)}
                        className="mt-1 h-4 w-4 rounded border"
                      />
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium">{option.label}</div>
                        <div className="text-xs text-muted-foreground">{option.helper}</div>
                      </div>
                    </label>
                  ))}

                  <p className="text-xs text-muted-foreground">
                    O sistema tenta buscar Facebook e Instagram automaticamente. Se algum dado nao estiver disponivel na Meta, o relatorio continua sendo gerado normalmente.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-xs">Analise e recomendacoes</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void generateAiRecommendations()}
                disabled={aiLoading || loading}
                className="h-7 px-2 text-xs"
              >
                {aiLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                {recommendations ? "Regenerar com IA" : "Gerar com IA"}
              </Button>
            </div>
            <Textarea
              value={recommendations}
              onChange={(event) => {
                setRecommendations(event.target.value);
                setRecommendationSource(event.target.value.trim() ? "manual" : "empty");
              }}
              placeholder={aiLoading ? "A IA esta analisando o periodo e montando as recomendacoes..." : "A IA vai preencher este campo com base nas metricas do periodo."}
              className="min-h-[100px] text-sm"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={() => handleGenerate(false)} disabled={loading} className="flex-1" variant="outline">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
            <Button onClick={() => handleGenerate(true)} disabled={loading} className="flex-1">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Salvar e baixar PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
