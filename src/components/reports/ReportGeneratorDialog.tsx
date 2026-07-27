import { useEffect, useState } from "react";
import { endOfMonth, format, startOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ReportData } from "@/lib/report-types";
import { buildReportPdfBlob, blobToBase64, downloadBlob } from "@/lib/report-pdf";
import { extractPhoneCalls, extractDirections, extractLeads, GOAL_KPIS, type LocalGoal, type LocalMetricKey } from "@/lib/local-business";
import { MetricPreferencesBuilder } from "./MetricPreferencesBuilder";

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
  { key: "instagramProfileVisits", label: "Visitas no perfil", helper: "Visitas ao perfil do Instagram no periodo" },
  { key: "phoneCalls", label: "Ligacoes", helper: "Cliques para ligar registrados no periodo" },
  { key: "directions", label: "Rotas / Como chegar", helper: "Cliques em rotas ou localizacao no periodo" },
  { key: "leads", label: "Leads", helper: "Cadastros e leads gerados no periodo" },
  { key: "roas", label: "ROAS", helper: "Retorno sobre investimento" },
  { key: "revenue", label: "Faturamento", helper: "Receita gerada no periodo" },
  { key: "reach", label: "Alcance", helper: "Pessoas unicas alcancadas na conta do cliente" },
  { key: "ctr", label: "CTR", helper: "Taxa de cliques no link" },
  { key: "cpc", label: "CPC", helper: "Custo medio por clique" },
  { key: "cpm", label: "CPM", helper: "Custo por mil impressoes" },
  { key: "frequency", label: "Frequencia", helper: "Media de exibicoes por pessoa" },
] as const;

type ReportMetricPreference = (typeof REPORT_METRIC_OPTIONS)[number]["key"];
type SocialMetricPreference = "followers" | "profileViews" | "reach" | "engagement";

const LOCAL_TO_REPORT_METRIC: Record<LocalMetricKey, ReportMetricPreference> = {
  messages: "messagesStarted",
  calls: "phoneCalls",
  directions: "directions",
  leads: "leads",
  profileVisits: "instagramProfileVisits",
};

const META_BASE = "https://graph.facebook.com/v21.0";
const PURCHASE_ACTION_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"] as const;
const SOCIAL_METRIC_OPTIONS = [
  { key: "followers", label: "Seguidores", helper: "Soma Facebook + Instagram quando disponivel" },
  { key: "profileViews", label: "Visitas no perfil", helper: "Visitas ao perfil do Instagram no periodo" },
  { key: "reach", label: "Alcance", helper: "Insights da Meta para o periodo do relatorio" },
  { key: "engagement", label: "Engajamento", helper: "Interacoes retornadas pela Meta quando disponiveis" },
] as const;

function normalizeAccountId(id: string) {
  return id.startsWith("act_") ? id.slice(4) : id.trim();
}

function normalizeInstagramUsername(username: string) {
  return username.trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9._]/g, "");
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

function extractInstagramProfileVisits(actions?: Array<{ action_type?: string; value?: string }>) {
  if (!actions?.length) return 0;

  return actions.reduce((total, action) => {
    const type = (action.action_type ?? "").toLowerCase();
    const isProfileVisit =
      (type.includes("instagram") || type.includes("ig_") || type.includes(".ig")) &&
      type.includes("profile") &&
      (type.includes("visit") || type.includes("view"));

    if (!isProfileVisit) return total;
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
  const [metricPreferences, setMetricPreferences] = useState<ReportMetricPreference[]>([
    "purchaseValue",
    "purchases",
    "costPerPurchase",
    "messagesStarted",
    "instagramProfileVisits",
    "roas",
    "reach",
    "impressions",
    "ctr",
  ]);
  const [includeSocialPresence, setIncludeSocialPresence] = useState(true);
  const [instagramProfileSearch, setInstagramProfileSearch] = useState("");
  const [socialMetricPreferences, setSocialMetricPreferences] = useState<SocialMetricPreference[]>([
    "followers",
    "profileViews",
    "reach",
    "engagement",
  ]);
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    supabase
      .from("clients")
      .select("primary_goal")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const goal = (data?.primary_goal as LocalGoal | null) ?? null;
        if (!goal || !GOAL_KPIS[goal]) return;
        const localPrefs = GOAL_KPIS[goal].map((key) => LOCAL_TO_REPORT_METRIC[key]);
        const general: ReportMetricPreference[] = ["spend", "reach", "impressions", "ctr"];
        setMetricPreferences([...localPrefs, ...general.filter((p) => !localPrefs.includes(p))]);
      });
    return () => {
      active = false;
    };
  }, [isOpen, clientId]);

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
      return { spend: 0, impressions: 0, clicks: 0, messagesStarted: 0, instagramProfileVisits: 0, purchases: 0, purchaseValue: 0, costPerPurchase: 0, reach: 0, frequency: 0 };
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
    const instagramProfileVisits = rows.reduce(
      (total: number, row: { actions?: Array<{ action_type?: string; value?: string }> }) =>
        total + extractInstagramProfileVisits(row.actions),
      0
    );
    const phoneCalls = rows.reduce(
      (total: number, row: { actions?: Array<{ action_type?: string; value?: string }> }) => total + extractPhoneCalls(row.actions),
      0
    );
    const directions = rows.reduce(
      (total: number, row: { actions?: Array<{ action_type?: string; value?: string }> }) => total + extractDirections(row.actions),
      0
    );
    const leads = rows.reduce(
      (total: number, row: { actions?: Array<{ action_type?: string; value?: string }> }) => total + extractLeads(row.actions),
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
      instagramProfileVisits,
      phoneCalls,
      directions,
      leads,
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
        metric: "page_impressions_unique,page_actions_post_reactions_total",
        since: startDate,
        until: endDate,
        access_token: metaAccessToken.trim(),
      });

      const rows = insights.data || [];
      reach = rows.find((row) => row.name === "page_impressions_unique")?.values?.reduce((sum, item) => sum + (item.value || 0), 0) ?? null;
      engagement =
        rows.find((row) => row.name === "page_actions_post_reactions_total")?.values?.reduce((sum, item) => sum + (item.value || 0), 0) ?? null;
    } catch (error) {
      console.warn("Facebook page insights indisponiveis:", error);
    }

    return {
      pageName: pageInfo.name || null,
      followers: pageInfo.followers_count ?? pageInfo.fan_count ?? null,
      reach,
      engagement,
      instagramAccountId: pageInfo.instagram_business_account?.id || null,
    };
  }

  async function fetchInstagramPresence(metaInstagramAccountId?: string | null, metaAccessToken?: string | null, usernameSearch?: string) {
    if (!metaInstagramAccountId || !metaAccessToken) {
      return {
        username: null,
        logoUrl: null,
        followers: null,
        profileViews: null,
        reach: null,
        engagement: null,
      };
    }

    const searchedUsername = normalizeInstagramUsername(usernameSearch ?? "");
    const profile = searchedUsername
      ? (await fetchMetaJson<{
          business_discovery?: {
            username?: string;
            followers_count?: number;
            profile_picture_url?: string;
          };
        }>(metaInstagramAccountId, {
          fields: `business_discovery.username(${searchedUsername}){username,followers_count,profile_picture_url}`,
          access_token: metaAccessToken.trim(),
        })).business_discovery ?? {}
      : await fetchMetaJson<{ username?: string; followers_count?: number; profile_picture_url?: string }>(metaInstagramAccountId, {
          fields: "username,followers_count,profile_picture_url",
          access_token: metaAccessToken.trim(),
        });

    let reach: number | null = null;
    let engagement: number | null = null;
    let profileViews: number | null = null;

    const endDateObj = new Date(`${endDate}T00:00:00`);
    const startDateObj = new Date(`${startDate}T00:00:00`);
    const earliestAllowed = new Date(endDateObj);
    earliestAllowed.setDate(earliestAllowed.getDate() - 30);
    const cappedSince = startDateObj < earliestAllowed
      ? format(earliestAllowed, "yyyy-MM-dd")
      : startDate;

    if (!searchedUsername) {
      const failures: string[] = [];

      async function tryMetric(metricsList: Array<{ metric: string; useTotalValue?: boolean }>): Promise<number | null> {
        for (const { metric, useTotalValue = true } of metricsList) {
          const params: Record<string, string> = {
            metric,
            period: "day",
            since: cappedSince,
            until: endDate,
            access_token: metaAccessToken.trim(),
          };
          if (useTotalValue) params.metric_type = "total_value";
          try {
            const insights = await fetchMetaJson<{
              data?: Array<{
                name?: string;
                total_value?: { value?: number };
                values?: Array<{ value?: number | string }>;
              }>;
            }>(`${metaInstagramAccountId}/insights`, params);
            const row = (insights.data || []).find((r) => r.name === metric);
            if (row?.total_value?.value !== undefined) return row.total_value.value;
            if (row?.values?.length) {
              return row.values.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push(`${metric}: ${message}`);
            console.warn(`IG insights "${metric}" falhou:`, error);
          }
        }
        return null;
      }

      reach = await tryMetric([{ metric: "reach" }, { metric: "impressions" }]);
      engagement = await tryMetric([
        { metric: "accounts_engaged" },
        { metric: "total_interactions" },
      ]);
      profileViews = await tryMetric([
        { metric: "profile_views" },
        { metric: "views" },
        { metric: "profile_views", useTotalValue: false },
      ]);

      if (reach === null && engagement === null && profileViews === null && failures.length > 0) {
        const sample = failures[0]?.toLowerCase() ?? "";
        if (sample.includes("permission") || sample.includes("scope") || sample.includes("insights")) {
          toast.warning(
            "Reconecte o Facebook (Conectar Meta) para autorizar instagram_manage_insights — sem isso, alcance, engajamento e visitas do Instagram ficam vazios."
          );
        } else {
          toast.warning(`Insights do Instagram indisponiveis: ${failures[0]}`);
        }
      }
    }

    return {
      username: profile.username || null,
      logoUrl: profile.profile_picture_url || null,
      followers: profile.followers_count ?? null,
      profileViews,
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
    meta_instagram_username?: string | null;
    meta_access_token?: string | null;
  }): Promise<SocialPresenceSnapshot | undefined> {
    if (!includeSocialPresence) return undefined;

    const token = client.meta_access_token?.trim();
    const pageResult = token ? await fetchFacebookPresence(client.meta_page_id, token).catch(() => null) : null;
    const instagramAccountId = pageResult?.instagramAccountId || client.meta_instagram_account_id || null;
    const instagramUsername = normalizeInstagramUsername(instagramProfileSearch);
    const instagramResult = token ? await fetchInstagramPresence(instagramAccountId, token, instagramUsername).catch(() => null) : null;
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
      profileViews: instagramResult?.profileViews ?? null,
    };

    return {
      enabled: true,
      profileName: instagramResult?.username ? `@${instagramResult.username}` : client.meta_page_name || pageResult?.pageName || client.name || clientName,
      logoUrl: instagramResult?.logoUrl || client.logo_url || null,
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
      .select("name, logo_url, meta_ad_account_id, meta_access_token, meta_page_id, meta_page_name, meta_instagram_account_id, meta_instagram_username")
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

    let conversionMetrics = { spend: 0, impressions: 0, clicks: 0, messagesStarted: 0, instagramProfileVisits: 0, phoneCalls: 0, directions: 0, leads: 0, purchases: 0, purchaseValue: 0, costPerPurchase: 0, reach: 0, frequency: 0 };
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
    summary.phoneCalls = conversionMetrics.phoneCalls;
    summary.directions = conversionMetrics.directions;
    summary.leads = conversionMetrics.leads;

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
    const socialProfileViews = socialPresence?.metrics.find((metric) => metric.key === "profileViews")?.value ?? 0;
    summary.instagramProfileVisits = conversionMetrics.instagramProfileVisits || socialProfileViews || 0;

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
      metricPreferences,
      branding: { primaryColor: "#2563eb", agencyName: "MarketProAds" },
    };
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

  async function handleGenerate(download: boolean) {
    setLoading(true);
    try {
      const data = await buildReportData();

      const { data: session } = await supabase.auth.getSession();
      const tenantId = session.session?.user.id;
      if (!tenantId) throw new Error("Nao autenticado");

      const periodLabel = data.period.label;
      const reportName = `${clientName} - ${periodLabel}`;

      const blob = await buildReportPdfBlob(data);
      const pdfBase64 = await blobToBase64(blob);

      if (download) {
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
        pdf_base64: pdfBase64,
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
            <CardContent>
              <MetricPreferencesBuilder
                options={REPORT_METRIC_OPTIONS}
                value={metricPreferences}
                onChange={(next) => setMetricPreferences(next as ReportMetricPreference[])}
              />
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
                  <div className="space-y-1">
                    <Label className="text-xs">Perfil do Instagram</Label>
                    <Input
                      value={instagramProfileSearch}
                      onChange={(event) => setInstagramProfileSearch(event.target.value)}
                      placeholder="@perfil"
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Se vazio, usa o Instagram conectado ao cliente.
                    </p>
                  </div>

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
