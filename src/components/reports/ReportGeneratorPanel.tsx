import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { BookmarkCheck, Download, Eye, FileText, ImagePlus, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ReportData } from "@/lib/report-types";
import type { Json } from "@/integrations/supabase/types";
import { buildReportPdfBlob, blobToBase64, downloadBlob } from "@/lib/report-pdf";
import { extractPhoneCalls, extractDirections, extractLeads, GOAL_KPIS, type LocalGoal, type LocalMetricKey } from "@/lib/local-business";
import { SeletorDeMetricas } from "./SeletorDeMetricas";
import { SeletorDePeriodo } from "./SeletorDePeriodo";
import { hojeEmSaoPaulo, periodoDoModelo, resolverPeriodo, type PeriodoSpec } from "@/lib/report-periodo";
import { metricasDoModelo, metricasParaOLegado, type MetricaRelatorio } from "@/lib/report-metricas";
import { errorMessage } from "@/lib/utils";
import { META_GRAPH_VERSION } from "@/lib/meta-insights";
import { credencialDaPagina, credencialDoCliente, metaGet, metaGetAll, type MetaFetchOptions } from "@/lib/meta-fetch";
import { comprimirImagem, escolherCriativoDestaque, lerSugestaoDaIA } from "@/lib/report-analise";
import { sendChatMessage } from "@/lib/ai-service";
import { useAuth } from "@/hooks/useAuth";
import { nomeDaMarca } from "@/components/MarcaEmpresa";

const MAX_PRINTS = 8;

const CAMPOS_ANALISE = [
  { key: "highlights", label: "Destaques da semana", placeholder: "Um por linha. Ex.: Custo por conversa caiu 18%" },
  { key: "attention", label: "Pontos de atenção", placeholder: "Um por linha. Ex.: Saldo da conta acaba em 4 dias" },
  { key: "nextSteps", label: "Próximos passos", placeholder: "Um por linha. Ex.: Subir novo criativo em vídeo" },
  { key: "notes", label: "Observações do gestor", placeholder: "Texto livre para o cliente" },
] as const;

type Analise = Record<(typeof CAMPOS_ANALISE)[number]["key"], string>;

interface ReportGeneratorPanelProps {
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

type ReportMetricPreference = MetricaRelatorio;
type SocialMetricPreference = "followers" | "profileViews" | "reach" | "engagement" | "contentViews";

const LOCAL_TO_REPORT_METRIC: Record<LocalMetricKey, ReportMetricPreference> = {
  messages: "messagesStarted",
  calls: "phoneCalls",
  directions: "directions",
  leads: "leads",
  profileVisits: "instagramProfileVisits",
};

const META_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const INSTAGRAM_ONLY_METRICS: SocialMetricPreference[] = ["profileViews", "contentViews"];
const PURCHASE_ACTION_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"] as const;
const SOCIAL_METRIC_OPTIONS = [
  { key: "followers", label: "Seguidores", helper: "Soma Facebook + Instagram quando disponivel" },
  { key: "profileViews", label: "Visitas no perfil", helper: "Visitas ao perfil do Instagram no periodo" },
  { key: "reach", label: "Alcance", helper: "Insights da Meta para o periodo do relatorio" },
  { key: "engagement", label: "Engajamento", helper: "Interacoes retornadas pela Meta quando disponiveis" },
  { key: "contentViews", label: "Visualizacoes", helper: "Views de posts, reels e stories no periodo" },
] as const;

function normalizeAccountId(id: string) {
  return id.startsWith("act_") ? id.slice(4) : id.trim();
}

function fetchMetaJson<T>(path: string, params: Record<string, string>) {
  return metaGet<T>(META_BASE, path, params);
}

function fetchMetaCollection<T>(path: string, params: Record<string, string>, options?: MetaFetchOptions) {
  return metaGetAll<T>(META_BASE, path, params, options);
}

interface ReportInsightRow {
  campaign_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  inline_link_clicks?: string;
  actions?: Array<{ action_type?: string; value?: string }>;
  action_values?: Array<{ action_type?: string; value?: string }>;
}

// Pedir `insights` aninhado em /campaigns ou /ads faz a Meta calcular um
// relatorio por entidade e estoura o limite de volume da conta (erro 1). Um
// relatorio unico da conta no nivel desejado traz o mesmo dado bem mais barato.
async function fetchReportInsightsByLevel(
  accountId: string,
  token: string,
  level: "campaign" | "ad",
  fields: string,
  timeRange: string
) {
  const idField = level === "campaign" ? "campaign_id" : "ad_id";

  const rows = await fetchMetaCollection<ReportInsightRow>(
    `act_${accountId}/insights`,
    {
      fields: `${idField},${fields}`,
      level,
      time_range: timeRange,
      access_token: token,
    },
    { limit: 200 }
  );

  const byId = new Map<string, ReportInsightRow>();
  for (const row of rows) {
    const id = row[idField];
    if (id) byId.set(id, row);
  }

  return byId;
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

export function ReportGeneratorPanel({
  isOpen,
  onClose,
  clientId,
  clientName,
  onReportCreated,
}: ReportGeneratorPanelProps) {
  const { empresa } = useAuth();
  const [loading, setLoading] = useState(false);
  const [analise, setAnalise] = useState<Analise>({ highlights: "", attention: "", nextSteps: "", notes: "" });
  const [sugerindo, setSugerindo] = useState(false);
  const [prints, setPrints] = useState<Array<{ src: string; caption: string }>>([]);
  const [incluirDestaque, setIncluirDestaque] = useState(true);
  const [periodo, setPeriodo] = useState<PeriodoSpec>({ tipo: "ultimos_dias", dias: 30 });
  const periodoResolvido = useMemo(() => resolverPeriodo(periodo, hojeEmSaoPaulo()), [periodo]);
  const startDate = periodoResolvido.start;
  const endDate = periodoResolvido.end;
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
  // Modelo salvo no cliente (clients.report_template): vem pre-aplicado e o
  // gestor pode sobrescrever com "Salvar como modelo do cliente".
  const [modeloDoCliente, setModeloDoCliente] = useState<Record<string, unknown> | null>(null);
  const [usandoModelo, setUsandoModelo] = useState(false);
  const [salvandoModelo, setSalvandoModelo] = useState(false);
  const [previa, setPrevia] = useState<{ data: ReportData; blob: Blob; url: string } | null>(null);
  const [gerandoPrevia, setGerandoPrevia] = useState(false);
  const [includeSocialPresence, setIncludeSocialPresence] = useState(true);
  const [socialMetricPreferences, setSocialMetricPreferences] = useState<SocialMetricPreference[]>([
    "followers",
    "profileViews",
    "reach",
    "engagement",
    "contentViews",
  ]);
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    supabase
      .from("clients")
      .select("primary_goal, report_template")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const bruto = data?.report_template;
        const modelo = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : null;
        setModeloDoCliente(modelo);
        const periodoModelo = periodoDoModelo(modelo);
        if (periodoModelo) setPeriodo(periodoModelo);
        // O modelo antigo (so as 5 metricas padrao do envio rapido) nao diz
        // nada sobre o cliente: so vale o que foi salvo por este painel.
        const metricasModelo = modelo?.report_metrics ? metricasDoModelo(modelo) : null;
        if (metricasModelo) {
          setMetricPreferences(metricasModelo);
          setUsandoModelo(true);
          return;
        }
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

  async function fetchMessagesStarted(metaAdAccountId?: string | null, metaAccessToken?: string | null) {
    if (!metaAdAccountId || !metaAccessToken) return 0;

    const json = await fetchMetaJson<{ data?: Array<{ actions?: Array<{ action_type?: string; value?: string }> }> }>(`act_${normalizeAccountId(metaAdAccountId)}/insights`, {
      fields: "actions",
      level: "account",
      time_range: JSON.stringify({ since: startDate, until: endDate }),
      access_token: metaAccessToken.trim(),
    });

    const rows = Array.isArray(json.data) ? json.data : [];
    return rows.reduce(
      (total: number, row: { actions?: Array<{ action_type?: string; value?: string }> }) =>
        total + extractMessagesStarted(row.actions),
      0
    );
  }

  async function fetchAccountConversionMetrics(metaAdAccountId?: string | null, metaAccessToken?: string | null) {
    if (!metaAdAccountId || !metaAccessToken) {
      return { spend: 0, impressions: 0, clicks: 0, messagesStarted: 0, instagramProfileVisits: 0, phoneCalls: 0, directions: 0, leads: 0, purchases: 0, purchaseValue: 0, costPerPurchase: 0, reach: 0, frequency: 0 };
    }

    const json = await fetchMetaJson<{ data?: Array<ReportInsightRow & { reach?: string; frequency?: string }> }>(`act_${normalizeAccountId(metaAdAccountId)}/insights`, {
      fields: "actions,action_values,spend,impressions,inline_link_clicks,reach,frequency",
      level: "account",
      time_range: JSON.stringify({ since: startDate, until: endDate }),
      access_token: metaAccessToken.trim(),
    });

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

    const accountId = normalizeAccountId(metaAdAccountId);
    const token = metaAccessToken.trim();
    const timeRange = JSON.stringify({ since: startDate, until: endDate });

    const [entities, insightsById] = await Promise.all([
      fetchMetaCollection<{ id?: string; name?: string; status?: string }>(
        `act_${accountId}/campaigns`,
        { fields: "id,name,status", access_token: token },
        { limit: 200 }
      ),
      fetchReportInsightsByLevel(
        accountId,
        token,
        "campaign",
        "spend,impressions,inline_link_clicks,actions,action_values",
        timeRange
      ),
    ]);

    const rows = entities.map((campaign) => ({
      ...campaign,
      insight: campaign.id ? insightsById.get(campaign.id) : undefined,
    }));

    return rows
      .map((campaign) => {
        const insight = campaign.insight;
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

    const accountId = normalizeAccountId(metaAdAccountId);
    const token = metaAccessToken.trim();
    const timeRange = JSON.stringify({ since: startDate, until: endDate });

    const [entities, insightsById] = await Promise.all([
      fetchMetaCollection<{
        id?: string;
        name?: string;
        status?: string;
        creative?: {
          thumbnail_url?: string;
          image_url?: string;
          object_type?: string;
          video_id?: string;
        };
      }>(
        `act_${accountId}/ads`,
        { fields: "id,name,status,creative{thumbnail_url,image_url,object_type,video_id}", access_token: token },
        { limit: 100 }
      ),
      fetchReportInsightsByLevel(accountId, token, "ad", "spend,impressions,inline_link_clicks", timeRange),
    ]);

    const rows = entities.map((ad) => ({
      ...ad,
      insight: ad.id ? insightsById.get(ad.id) : undefined,
    }));

    return rows
      .map((ad) => {
        const insight = ad.insight;
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
    // Retorna null (e não um objeto vazio) para que a origem "Facebook" só
    // apareça no relatório quando a página realmente foi consultada.
    if (!metaPageId || !metaAccessToken) return null;

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

  async function fetchInstagramPresence(metaInstagramAccountId?: string | null, metaAccessToken?: string | null) {
    if (!metaInstagramAccountId || !metaAccessToken) return null;

    const igId = metaInstagramAccountId;
    const token = metaAccessToken.trim();

    const profile = await fetchMetaJson<{ username?: string; followers_count?: number; profile_picture_url?: string }>(igId, {
      fields: "username,followers_count,profile_picture_url",
      access_token: token,
    });

    const endDateObj = new Date(`${endDate}T00:00:00`);
    const startDateObj = new Date(`${startDate}T00:00:00`);
    const earliestAllowed = new Date(endDateObj);
    earliestAllowed.setDate(earliestAllowed.getDate() - 30);
    const cappedSince = startDateObj < earliestAllowed
      ? format(earliestAllowed, "yyyy-MM-dd")
      : startDate;

    // Guardado por metrica: a legenda do card mostra por que aquele numero faltou.
    const failures: Partial<Record<SocialMetricPreference, string>> = {};

    async function tryMetric(
      key: SocialMetricPreference,
      metricsList: Array<{ metric: string; useTotalValue?: boolean }>
    ): Promise<number | null> {
      for (const { metric, useTotalValue = true } of metricsList) {
        const params: Record<string, string> = {
          metric,
          period: "day",
          since: cappedSince,
          until: endDate,
          access_token: token,
        };
        if (useTotalValue) params.metric_type = "total_value";
        try {
          const insights = await fetchMetaJson<{
            data?: Array<{
              name?: string;
              total_value?: { value?: number };
              values?: Array<{ value?: number | string }>;
            }>;
          }>(`${igId}/insights`, params);
          const row = (insights.data || []).find((r) => r.name === metric);
          if (row?.total_value?.value !== undefined) return row.total_value.value;
          if (row?.values?.length) {
            return row.values.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
          }
        } catch (error) {
          if (!failures[key]) failures[key] = errorMessage(error, "Erro nos insights do Instagram");
          console.warn(`IG insights "${metric}" falhou:`, error);
        }
      }
      return null;
    }

    const reach = await tryMetric("reach", [{ metric: "reach" }]);
    const engagement = await tryMetric("engagement", [{ metric: "accounts_engaged" }, { metric: "total_interactions" }]);
    const profileViews = await tryMetric("profileViews", [{ metric: "profile_views" }, { metric: "profile_views", useTotalValue: false }]);
    // views conta conteudo visto (posts, reels, stories) — e a sucessora de
    // impressions, nao de profile_views. No lugar das visitas ela inflava o
    // relatorio em varias ordens de grandeza.
    const contentViews = await tryMetric("contentViews", [{ metric: "views" }]);

    const firstFailure = failures.reach || failures.engagement || failures.profileViews || failures.contentViews || "";
    if (reach === null && engagement === null && profileViews === null && contentViews === null && firstFailure) {
      const sample = firstFailure.toLowerCase();
      if (sample.includes("permission") || sample.includes("scope") || sample.includes("insights")) {
        toast.warning(
          "Reconecte o Facebook (Conectar Meta) para autorizar instagram_manage_insights — sem isso, alcance, engajamento e visitas do Instagram ficam vazios.",
          { duration: 12000 }
        );
      } else {
        toast.warning(`Insights do Instagram indisponiveis: ${firstFailure}`, { duration: 12000 });
      }
    }

    return {
      username: profile.username || null,
      logoUrl: profile.profile_picture_url || null,
      followers: profile.followers_count ?? null,
      profileViews,
      contentViews,
      reach,
      engagement,
      failures,
    };
  }

  async function buildSocialPresence(client: {
    name?: string | null;
    logo_url?: string | null;
    meta_page_id?: string | null;
    meta_page_name?: string | null;
    meta_instagram_account_id?: string | null;
    meta_instagram_username?: string | null;
    meta_token_configured?: boolean | null;
  }): Promise<SocialPresenceSnapshot | undefined> {
    if (!includeSocialPresence) return undefined;

    const token = client.meta_token_configured ? credencialDoCliente(clientId) : undefined;

    // O erro da Graph API precisa chegar ao usuario: engolido, um token sem
    // escopo de Pagina/Instagram vira "nao vinculado" e manda investigar o
    // vinculo, que esta correto.
    async function attempt<T>(promise: Promise<T>, fallback: string) {
      return promise
        .then((value) => ({ value, error: null as string | null }))
        .catch((error) => ({ value: null, error: errorMessage(error, fallback) }));
    }

    // Leitura de Pagina e de Instagram pede Page access token: com o token de
    // usuario a Meta responde (#10) mesmo com a permissao concedida. Cai no
    // token de usuario so para cliente conectado antes de guardarmos o da
    // Pagina — ali o #10 volta, e a mensagem manda reconectar.
    const pageToken = client.meta_token_configured ? credencialDaPagina(clientId) : undefined;

    const pageOutcome = pageToken
      ? await attempt(fetchFacebookPresence(client.meta_page_id, pageToken), "Erro ao ler a Pagina do Facebook")
      : { value: null, error: null as string | null };
    const pageResult = pageOutcome.value;

    const instagramAccountId = pageResult?.instagramAccountId || client.meta_instagram_account_id || null;
    const instagramOutcome = pageToken
      ? await attempt(fetchInstagramPresence(instagramAccountId, pageToken), "Erro ao ler o perfil do Instagram")
      : { value: null, error: null as string | null };
    const instagramResult = instagramOutcome.value;

    if (pageOutcome.error) {
      toast.warning(`Pagina do Facebook (${client.meta_page_id}): ${pageOutcome.error}`, { duration: 12000 });
    }
    if (instagramOutcome.error) {
      toast.warning(`Instagram (${instagramAccountId}): ${instagramOutcome.error}`, { duration: 12000 });
    }
    const sourceLabels = [pageResult ? "Facebook" : null, instagramResult ? "Instagram" : null].filter(Boolean) as string[];
    const sourceText = sourceLabels.length ? sourceLabels.join(" + ") : "Dados nao disponiveis";
    const hasInstagram = Boolean(instagramResult);

    if (!hasInstagram && !instagramAccountId && socialMetricPreferences.includes("profileViews")) {
      toast.warning(
        "Este cliente nao tem perfil do Instagram vinculado — visitas no perfil, alcance e engajamento saem vazios. Vincule em Clientes > editar cliente > Perfil do Instagram."
      );
    }

    // Sem valor, a legenda explica a causa em vez de repetir a origem.
    function missingSource(key: SocialMetricPreference) {
      if (!hasInstagram) {
        if (instagramAccountId) return "Falha ao ler o Instagram";
        return key === "followers" ? "Sem dados no periodo" : "Instagram nao vinculado";
      }
      const failure = instagramResult?.failures?.[key];
      if (!failure) return "Sem dados no periodo";
      const reason = failure.toLowerCase();
      if (reason.includes("permission") || reason.includes("scope")) return "Falta permissao de insights";
      if (reason.includes("metric") || reason.includes("must be one of")) return "Metrica nao suportada pela Meta";
      // A celula do card e estreita: o inicio do texto da Meta ja diz o que houve.
      return `IG: ${failure.slice(0, 44)}`;
    }

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
      contentViews: instagramResult?.contentViews ?? null,
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
        source: totals[key] != null ? (INSTAGRAM_ONLY_METRICS.includes(key) ? "Instagram" : sourceText) : missingSource(key),
      })),
    };
  }

  async function sugerirComIA() {
    setSugerindo(true);
    try {
      const { reply } = await sendChatMessage([{
        role: "user",
        content:
          `Vou montar o relatório do cliente ${clientName} para o período de ${startDate} a ${endDate}. ` +
          "Com base nos dados, responda SOMENTE um JSON, sem texto antes ou depois, no formato " +
          '{"destaques": ["..."], "atencao": ["..."], "proximos_passos": ["..."]}. ' +
          "Cada lista com 2 a 4 itens curtos, escritos para o cliente ler, com números concretos quando houver.",
      }], clientId);
      const sugestao = lerSugestaoDaIA(reply);
      if (!sugestao) {
        setAnalise(a => ({ ...a, notes: a.notes || reply.trim() }));
        return toast.info("A IA não devolveu no formato esperado; coloquei a resposta em Observações para você editar");
      }
      setAnalise(a => ({ ...a, ...sugestao }));
      toast.success("Sugestão preenchida — revise antes de gerar");
    } catch (err) {
      toast.error(errorMessage(err, "Não foi possível falar com a IA"));
    } finally {
      setSugerindo(false);
    }
  }

  async function adicionarPrints(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    const vagas = MAX_PRINTS - prints.length;
    if (vagas <= 0) return toast.error(`No máximo ${MAX_PRINTS} prints por relatório`);
    const lista = [...arquivos].filter(f => f.type.startsWith("image/")).slice(0, vagas);
    try {
      const novos = await Promise.all(lista.map(async f => ({ src: await comprimirImagem(f), caption: "" })));
      setPrints(p => [...p, ...novos]);
      if (arquivos.length > vagas) toast.info(`Só couberam ${vagas}: o limite é ${MAX_PRINTS} prints`);
    } catch (err) {
      toast.error(errorMessage(err, "Não foi possível ler a imagem"));
    }
  }

  async function buildReportData(): Promise<ReportData> {
    const { data: clientRaw, error: clientError } = await supabase
      .from("clients")
      .select("name, logo_url, meta_ad_account_id, meta_token_configured, meta_page_id, meta_page_name, meta_instagram_account_id, meta_instagram_username")
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
    const ads = (adsRaw || []).filter((ad) => ad.ad_sets?.campaigns?.client_id === clientId);

    let conversionMetrics = { spend: 0, impressions: 0, clicks: 0, messagesStarted: 0, instagramProfileVisits: 0, phoneCalls: 0, directions: 0, leads: 0, purchases: 0, purchaseValue: 0, costPerPurchase: 0, reach: 0, frequency: 0 };
    try {
      conversionMetrics = await fetchAccountConversionMetrics(clientRaw.meta_ad_account_id, clientRaw.meta_token_configured ? credencialDoCliente(clientId) : null);
    } catch {
      try {
        conversionMetrics.messagesStarted = await fetchMessagesStarted(clientRaw.meta_ad_account_id, clientRaw.meta_token_configured ? credencialDoCliente(clientId) : null);
      } catch {
        conversionMetrics.messagesStarted = 0;
      }
    }

    const summary = metrics.reduce<ReportData["summary"]>(
      (acc, item) => ({
        ...acc,
        spend: acc.spend + (item.spend || 0),
        impressions: acc.impressions + (item.impressions || 0),
        clicks: acc.clicks + (item.clicks || 0),
      }),
      { spend: 0, revenue: 0, roas: 0, ctr: 0, cpc: 0, cpm: 0, impressions: 0, clicks: 0, conversions: 0, messagesStarted: conversionMetrics.messagesStarted }
    );

    summary.spend = conversionMetrics.spend || summary.spend;
    summary.impressions = conversionMetrics.impressions || summary.impressions;
    summary.clicks = conversionMetrics.clicks || summary.clicks;
    summary.conversions = conversionMetrics.purchases || campaigns.reduce((total: number, campaign) => total + (campaign.conversions || 0), 0);
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
      .map((campaign) => ({
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
      const metaCampaigns = await fetchMetaCampaignSummaries(clientRaw.meta_ad_account_id, clientRaw.meta_token_configured ? credencialDoCliente(clientId) : null);
      if (metaCampaigns.length > 0) {
        topCampaigns = metaCampaigns;
      }
    } catch {
      // Fallback para os dados locais se a consulta detalhada falhar.
    }

    let topAds = ads
      .map((ad) => ({
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
      const metaAds = await fetchMetaAdSummaries(clientRaw.meta_ad_account_id, clientRaw.meta_token_configured ? credencialDoCliente(clientId) : null);
      if (metaAds.length > 0) {
        topAds = metaAds;
      }
    } catch {
      // Fallback para anuncios salvos localmente se a consulta do periodo falhar.
    }

    const periodLabel = periodoResolvido.label;
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
      branding: { primaryColor: empresa?.cor_primaria || "#2563eb", agencyName: nomeDaMarca(empresa) },
      analysis: analise,
      featuredAd: incluirDestaque ? escolherCriativoDestaque(topAds) ?? undefined : undefined,
      screenshots: prints.map(p => ({ src: p.src, caption: p.caption.trim() || undefined })),
    };
  }


  function fecharPrevia() {
    if (previa) URL.revokeObjectURL(previa.url);
    setPrevia(null);
  }

  async function gerarPrevia() {
    setGerandoPrevia(true);
    try {
      const data = await buildReportData();
      const blob = await buildReportPdfBlob(data);
      if (previa) URL.revokeObjectURL(previa.url);
      setPrevia({ data, blob, url: URL.createObjectURL(blob) });
    } catch (error) {
      toast.error(errorMessage(error, "Erro ao montar a prévia"));
    } finally {
      setGerandoPrevia(false);
    }
  }

  async function salvarModeloDoCliente() {
    setSalvandoModelo(true);
    try {
      const legado = metricasParaOLegado(metricPreferences);
      // O envio rapido da tela de Clientes so conhece 7, 14 e 30 dias.
      const periodoLegado = periodo.tipo === "ultimos_dias" && [7, 14, 30].includes(periodo.dias) ? `${periodo.dias}d` : undefined;
      const modelo: Record<string, unknown> = {
        ...(modeloDoCliente ?? {}),
        report_metrics: metricPreferences,
        ...(periodo.tipo !== "intervalo" ? { periodo } : {}),
        ...(legado.length ? { metrics: legado } : {}),
        ...(periodoLegado ? { period: periodoLegado } : {}),
      };
      const { error } = await supabase.from("clients").update({ report_template: modelo as Json }).eq("id", clientId);
      if (error) throw error;
      setModeloDoCliente(modelo);
      setUsandoModelo(true);
      toast.success("Modelo salvo: os próximos relatórios e agendamentos deste cliente já começam assim");
    } catch (error) {
      toast.error(errorMessage(error, "Não foi possível salvar o modelo do cliente"));
    } finally {
      setSalvandoModelo(false);
    }
  }

  async function handleGenerate(download: boolean, pronto?: { data: ReportData; blob: Blob }) {
    setLoading(true);
    try {
      const data = pronto?.data ?? (await buildReportData());

      const { data: session } = await supabase.auth.getSession();
      const tenantId = session.session?.user.id;
      if (!tenantId) throw new Error("Nao autenticado");

      const periodLabel = data.period.label;
      const reportName = `${clientName} - ${periodLabel}`;

      const blob = pronto?.blob ?? (await buildReportPdfBlob(data));
      const pdfBase64 = await blobToBase64(blob);

      if (download) {
        const filename = `relatorio-${clientName.toLowerCase().replace(/\s+/g, "-")}-${data.period.start}.pdf`;
        downloadBlob(blob, filename);
      }

      const shareToken = crypto.randomUUID();

      const { error } = await supabase.from("reports").insert({
        tenant_id: tenantId,
        client_id: clientId,
        name: reportName,
        period: data.period,
        data: data as unknown as Json,
        status: "ready",
        file_url: null,
        pdf_base64: pdfBase64,
        share_token: shareToken,
      });

      if (error) throw error;

      toast.success("Relatorio gerado com sucesso!");
      fecharPrevia();
      onReportCreated?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao gerar relatorio");
    } finally {
      setLoading(false);
    }
  }

  const ocupado = loading || gerandoPrevia;

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />
            Gerar Relatorio - {clientName}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Configure o periodo e personalize o relatorio</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Período</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Escolha um atalho, uma quantidade de dias ou as datas exatas.</p>
          </CardHeader>
          <CardContent>
            <SeletorDePeriodo value={periodo} onChange={setPeriodo} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-3 space-y-0 pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                Métricas do relatório
                {usandoModelo && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary ring-1 ring-primary/20">
                    Modelo do cliente
                  </span>
                )}
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Só o que estiver marcado aparece no PDF, na prévia e no link do cliente.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={salvarModeloDoCliente} disabled={salvandoModelo || ocupado} className="shrink-0">
              {salvandoModelo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BookmarkCheck className="mr-2 h-4 w-4" />}
              Salvar como modelo do cliente
            </Button>
          </CardHeader>
          <CardContent>
            <SeletorDeMetricas value={metricPreferences} onChange={setMetricPreferences} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-sm">Análise do gestor</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Entra numa página própria do PDF. Um item por linha.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={sugerirComIA} disabled={sugerindo || loading}>
              {sugerindo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Sugerir com IA
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {CAMPOS_ANALISE.map(campo => (
              <div key={campo.key} className="space-y-1">
                <Label className="text-xs">{campo.label}</Label>
                <Textarea
                  rows={4}
                  value={analise[campo.key]}
                  placeholder={campo.placeholder}
                  onChange={e => setAnalise(a => ({ ...a, [campo.key]: e.target.value }))}
                  className="text-sm"
                />
              </div>
            ))}
            <label className="flex items-center gap-3 text-sm md:col-span-2">
              <Switch checked={incluirDestaque} onCheckedChange={setIncluirDestaque} />
              Destacar o criativo que mais performou (maior CTR entre os anúncios com verba relevante)
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Prints de campanhas e criativos</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Até {MAX_PRINTS} imagens, duas por página do PDF. Legenda opcional.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {prints.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {prints.map((p, i) => (
                  <div key={i} className="space-y-2 rounded-lg border p-2">
                    <div className="relative">
                      <img src={p.src} alt={`Print ${i + 1}`} className="h-32 w-full rounded object-cover" />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute right-1 top-1 h-7 w-7"
                        aria-label="Remover print"
                        onClick={() => setPrints(lista => lista.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Input
                      value={p.caption}
                      placeholder="Legenda"
                      className="h-8 text-xs"
                      onChange={e => setPrints(lista => lista.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))}
                    />
                  </div>
                ))}
              </div>
            )}
            {prints.length < MAX_PRINTS && (
              <Label className="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground transition-colors hover:bg-muted/40">
                <ImagePlus className="h-5 w-5" />
                Adicionar prints
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => { adicionarPrints(e.target.files); e.target.value = ""; }}
                />
              </Label>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button onClick={gerarPrevia} disabled={ocupado} variant="ghost">
            {gerandoPrevia ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
            Pré-visualizar
          </Button>
          <Button onClick={() => handleGenerate(false)} disabled={ocupado} variant="outline">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Salvar
          </Button>
          <Button onClick={() => handleGenerate(true)} disabled={ocupado}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Salvar e baixar PDF
          </Button>
        </div>

        <Dialog open={!!previa} onOpenChange={(aberto) => !aberto && fecharPrevia()}>
          <DialogContent className="flex h-[90vh] max-w-4xl flex-col gap-3 p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Prévia do relatório</DialogTitle>
              <DialogDescription className="break-words">
                {previa?.data.period.label} · é exatamente este PDF que será salvo.
              </DialogDescription>
            </DialogHeader>
            {previa && (
              <iframe title="Prévia do relatório em PDF" src={previa.url} className="min-h-0 w-full flex-1 rounded-lg border border-border/60 bg-white" />
            )}
            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
              <Button variant="ghost" onClick={fecharPrevia} disabled={loading}>
                Voltar e ajustar
              </Button>
              <Button variant="outline" onClick={() => previa && handleGenerate(false, previa)} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Salvar
              </Button>
              <Button onClick={() => previa && handleGenerate(true, previa)} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Salvar e baixar PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
