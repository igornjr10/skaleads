import { supabase } from "@/integrations/supabase/client";
import { extractLocalActionTotals, extractMessages, type MetaAction } from "@/lib/local-business";
import {
  fetchAccountFunding,
  fetchFundingEvents,
  firstOfMonthIso,
  persistFundingEvents,
} from "@/lib/meta-funding";
import {
  metaGet,
  metaGetAll,
  presetToRange,
  splitDateRange,
  type MetaFetchOptions,
} from "@/lib/meta-fetch";

const META_BASE = "https://graph.facebook.com/v21.0";

interface MetaInsight {
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  conversions?: string;
  date_start?: string;
}

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
}

interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
}

interface MetaAd {
  id: string;
  name: string;
  status: string;
  adset_id: string;
  creative?: {
    thumbnail_url?: string;
    image_url?: string;
    body?: string;
    title?: string;
    object_type?: string;
    video_id?: string;
  };
}

interface MetaAdInsightRow {
  ad_id: string;
  date_start: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  reach?: string;
  frequency?: string;
  conversions?: string;
  video_thruplay_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p25_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p75_watched_actions?: Array<{ action_type: string; value: string }>;
  video_view_by_age_bucket_and_gender?: Array<{ action_type: string; value: string }>;
}

interface MetaBreakdownRow {
  age?: string;
  gender?: string;
  placement?: string;
  device_platform?: string;
  publisher_platform?: string;
  country?: string;
  region?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  reach?: string;
  conversions?: string;
}

function extractAction(actions?: Array<{ action_type: string; value: string }>, type = "video_view"): number {
  return parseInt(actions?.find((action) => action.action_type === type)?.value ?? "0") || 0;
}

function metaFetchAll<T>(path: string, params: Record<string, string>, options?: MetaFetchOptions): Promise<T[]> {
  return metaGetAll<T>(META_BASE, path, params, options);
}

interface MetaLevelInsight {
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  conversions?: string;
  actions?: MetaAction[];
}

// A migration das colunas `messages` roda a mao no SQL Editor, entao o front
// pode subir antes dela. Sem essa checagem o upsert inteiro morre em 42703 e o
// sync para de gravar qualquer coisa.
let messagesColumnSupported: boolean | null = null;

async function supportsMessagesColumn(): Promise<boolean> {
  if (messagesColumnSupported !== null) return messagesColumnSupported;
  const { error } = await supabase.from("campaigns").select("messages").limit(1);
  messagesColumnSupported = !error;
  return messagesColumnSupported;
}

// Campanha de mensagem nao produz `conversions`: a conversa iniciada chega
// dentro de `actions`. Guardar por entidade e o que permite dizer qual anuncio
// trouxe cada conversa.
function messagesPayload(supported: boolean, actions?: MetaAction[]): { messages?: number } {
  return supported ? { messages: extractMessages(actions) } : {};
}

// Pedir `insights` aninhado em /campaigns, /adsets ou /ads faz a Meta calcular
// um relatorio por entidade e estoura o limite de volume da conta (erro 1).
// Um unico relatorio da conta no nivel desejado devolve o mesmo dado por uma
// fracao do custo.
async function fetchInsightsByLevel(
  accountId: string,
  token: string,
  level: "campaign" | "adset" | "ad",
  datePreset: string
): Promise<Map<string, MetaLevelInsight>> {
  const idField = `${level}_id` as "campaign_id" | "adset_id" | "ad_id";

  const rows = await metaFetchAll<MetaLevelInsight>(
    `act_${accountId}/insights`,
    {
      fields: `${idField},spend,impressions,clicks,ctr,cpc,cpm,conversions,actions`,
      level,
      date_preset: datePreset,
      access_token: token,
    },
    { limit: 200 }
  );

  const byId = new Map<string, MetaLevelInsight>();
  for (const row of rows) {
    const id = row[idField];
    if (id) byId.set(id, row);
  }

  return byId;
}

function normalizeAccountId(id: string): string {
  return id.startsWith("act_") ? id.slice(4) : id.trim();
}

function n(value?: string): number {
  return parseFloat(value ?? "0") || 0;
}

function ni(value?: string): number {
  return parseInt(value ?? "0") || 0;
}

function inferSyncStatusFromError(message: string): "expired" | "error" | "warning" {
  const text = message.toLowerCase();

  if (
    text.includes("invalid oauth") ||
    text.includes("session has expired") ||
    text.includes("access token") ||
    text.includes("permissions error") ||
    text.includes("expired")
  ) {
    return "expired";
  }

  if (
    text.includes("rate limit") ||
    text.includes("temporar") ||
    text.includes("try again") ||
    text.includes("volume de dados") ||
    text.includes("limitando as requisicoes") ||
    text.includes("reduce the amount of data")
  ) {
    return "warning";
  }

  return "error";
}

async function updateClientIntegrationState(
  clientId: string,
  updates: Record<string, unknown>,
  incrementSyncRuns = false
) {
  let meta_sync_runs: number | undefined;

  if (incrementSyncRuns) {
    const { data } = await supabase.from("clients").select("meta_sync_runs").eq("id", clientId).single();
    meta_sync_runs = ((data?.meta_sync_runs as number | null) ?? 0) + 1;
  }

  await supabase
    .from("clients")
    .update({
      ...updates,
      ...(incrementSyncRuns ? { meta_sync_runs } : {}),
    })
    .eq("id", clientId);
}

export interface SyncResult {
  campaigns: number;
  adSets: number;
  ads: number;
  days: number;
}

export interface MetaConnectionStatus {
  isValid: boolean;
  accountId: string;
  accountName: string | null;
  accountStatus: string | null;
  checkedAt: string;
}

export async function validateMetaConnection(
  adAccountId: string,
  accessToken: string
): Promise<MetaConnectionStatus> {
  const accountId = normalizeAccountId(adAccountId);
  const token = accessToken.trim();
  const checkedAt = new Date().toISOString();

  const json = await metaGet<{ id?: string; name?: string; account_status?: number }>(META_BASE, `act_${accountId}`, {
    fields: "id,name,account_status",
    access_token: token,
  });

  return {
    isValid: true,
    accountId: json.id ?? accountId,
    accountName: json.name ?? null,
    accountStatus: json.account_status ? String(json.account_status) : null,
    checkedAt,
  };
}

export async function syncClientData(
  clientId: string,
  adAccountId: string,
  accessToken: string,
  onProgress?: (msg: string) => void
): Promise<SyncResult> {
  const accountId = normalizeAccountId(adAccountId);
  const token = accessToken.trim();

  await updateClientIntegrationState(clientId, {
    meta_sync_status: "syncing",
    meta_last_sync_error: null,
  });

  try {
    const connection = await validateMetaConnection(accountId, token);

    onProgress?.("Buscando campanhas...");
    const metaCampaigns = await metaFetchAll<MetaCampaign>(
      `act_${accountId}/campaigns`,
      {
        fields: "id,name,status,objective",
        access_token: token,
      },
      { limit: 200 }
    );

    const campaignInsights = await fetchInsightsByLevel(accountId, token, "campaign", "last_30d");
    const withMessages = await supportsMessagesColumn();

    const { data: existingCampaigns } = await supabase
      .from("campaigns")
      .select("id, meta_campaign_id")
      .eq("client_id", clientId);

    const campaignMap = new Map<string, string>();
    existingCampaigns?.forEach((campaign) => {
      if (campaign.meta_campaign_id) campaignMap.set(campaign.meta_campaign_id, campaign.id);
    });

    for (const campaign of metaCampaigns) {
      const insight = campaignInsights.get(campaign.id);
      const payload = {
        client_id: clientId,
        meta_campaign_id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        objective: campaign.objective ?? null,
        spend: n(insight?.spend),
        impressions: ni(insight?.impressions),
        clicks: ni(insight?.clicks),
        ctr: n(insight?.ctr),
        cpc: n(insight?.cpc),
        cpm: n(insight?.cpm),
        conversions: ni(insight?.conversions),
        ...messagesPayload(withMessages, insight?.actions),
      };

      const existingId = campaignMap.get(campaign.id);
      if (existingId) {
        await supabase.from("campaigns").update(payload).eq("id", existingId);
      } else {
        const { data } = await supabase.from("campaigns").insert(payload).select("id").single();
        if (data) campaignMap.set(campaign.id, data.id);
      }
    }

    onProgress?.("Buscando conjuntos de anuncios...");
    const metaAdSets = await metaFetchAll<MetaAdSet>(
      `act_${accountId}/adsets`,
      {
        fields: "id,name,status,campaign_id",
        access_token: token,
      },
      { limit: 200 }
    );

    const adSetInsights = await fetchInsightsByLevel(accountId, token, "adset", "last_30d");

    const campaignInternalIds = [...campaignMap.values()];
    const { data: existingAdSets } = campaignInternalIds.length
      ? await supabase.from("ad_sets").select("id, meta_adset_id").in("campaign_id", campaignInternalIds)
      : { data: [] as { id: string; meta_adset_id: string | null }[] };

    const adSetMap = new Map<string, string>();
    existingAdSets?.forEach((adSet) => {
      if (adSet.meta_adset_id) adSetMap.set(adSet.meta_adset_id, adSet.id);
    });

    for (const adSet of metaAdSets) {
      const campaignInternalId = campaignMap.get(adSet.campaign_id);
      if (!campaignInternalId) continue;

      const insight = adSetInsights.get(adSet.id);
      const payload = {
        campaign_id: campaignInternalId,
        meta_adset_id: adSet.id,
        name: adSet.name,
        status: adSet.status,
        spend: n(insight?.spend),
        impressions: ni(insight?.impressions),
        clicks: ni(insight?.clicks),
        ...messagesPayload(withMessages, insight?.actions),
      };

      const existingId = adSetMap.get(adSet.id);
      if (existingId) {
        await supabase.from("ad_sets").update(payload).eq("id", existingId);
      } else {
        const { data } = await supabase.from("ad_sets").insert(payload).select("id").single();
        if (data) adSetMap.set(adSet.id, data.id);
      }
    }

    onProgress?.("Buscando anuncios...");
    const metaAds = await metaFetchAll<MetaAd>(
      `act_${accountId}/ads`,
      {
        fields: "id,name,status,adset_id,creative{thumbnail_url,image_url,body,title,object_type,video_id}",
        access_token: token,
      },
      { limit: 100 }
    );

    const adInsights = await fetchInsightsByLevel(accountId, token, "ad", "last_30d");

    const adSetInternalIds = [...adSetMap.values()];
    const { data: existingAds } = adSetInternalIds.length
      ? await supabase.from("ads").select("id, meta_ad_id").in("ad_set_id", adSetInternalIds)
      : { data: [] as { id: string; meta_ad_id: string | null }[] };

    const adMap = new Map<string, string>();
    existingAds?.forEach((ad) => {
      if (ad.meta_ad_id) adMap.set(ad.meta_ad_id, ad.id);
    });

    for (const ad of metaAds) {
      const adSetInternalId = adSetMap.get(ad.adset_id);
      if (!adSetInternalId) continue;

      const insight = adInsights.get(ad.id);
      const creative = ad.creative;
      const creativeType = creative?.object_type === "VIDEO" || creative?.video_id ? "video" : "image";
      const payload = {
        ad_set_id: adSetInternalId,
        meta_ad_id: ad.id,
        name: ad.name,
        status: ad.status,
        spend: n(insight?.spend),
        impressions: ni(insight?.impressions),
        clicks: ni(insight?.clicks),
        ...messagesPayload(withMessages, insight?.actions),
        thumbnail_url: creative?.thumbnail_url ?? null,
        image_url: creative?.image_url ?? null,
        video_id: creative?.video_id ?? null,
        body: creative?.body ?? null,
        title: creative?.title ?? null,
        creative_type: creativeType,
        creative_synced_at: new Date().toISOString(),
      };

      const existingId = adMap.get(ad.id);
      if (existingId) {
        await supabase.from("ads").update(payload).eq("id", existingId);
        adMap.set(ad.id, existingId);
      } else {
        const { data } = await supabase.from("ads").insert(payload).select("id").single();
        if (data) adMap.set(ad.id, data.id);
      }
    }

    onProgress?.("Buscando metricas diarias...");
    const dailyData = await metaFetchAll<MetaInsight & { date_start: string; actions?: MetaAction[] }>(
      `act_${accountId}/insights`,
      {
        fields: "spend,impressions,clicks,actions,date_start",
        time_increment: "1",
        date_preset: "last_30d",
        level: "account",
        access_token: token,
      },
      { limit: 100 }
    );

    for (const day of dailyData) {
      const local = extractLocalActionTotals(day.actions);
      await supabase.from("campaign_daily_metrics").upsert(
        {
          client_id: clientId,
          date: day.date_start,
          spend: n(day.spend),
          impressions: ni(day.impressions),
          clicks: ni(day.clicks),
          messages: local.messages,
          calls: local.calls,
          directions: local.directions,
          leads: local.leads,
          profile_visits: local.profileVisits,
        },
        { onConflict: "client_id,date" }
      );
    }

    onProgress?.("Lendo saldo e aportes da conta...");
    // Saldo e aporte sao extras: saem de um texto formatado e de um log sem
    // parametros documentados. Se qualquer um falhar, o sync ja entregou
    // campanha e metrica, e o card cai na verba digitada a mao.
    let fundingState: Record<string, unknown> = {};
    try {
      const funding = await fetchAccountFunding(accountId, token);
      fundingState = {
        meta_balance_cents: funding.balanceCents,
        meta_balance_label: funding.balanceLabel,
        meta_funding_type: funding.fundingType,
        meta_balance_at: new Date().toISOString(),
      };
      const events = await fetchFundingEvents(accountId, token, firstOfMonthIso());
      await persistFundingEvents(clientId, events);
    } catch {
      /* nao-bloqueante por design */
    }

    const completedAt = new Date().toISOString();
    await updateClientIntegrationState(
      clientId,
      {
        ...fundingState,
        meta_connected_at: completedAt,
        meta_last_sync_at: completedAt,
        meta_last_verified_at: connection.checkedAt,
        meta_last_sync_error: null,
        meta_sync_status: "healthy",
      },
      true
    );

    return {
      campaigns: metaCampaigns.length,
      adSets: metaAdSets.length,
      ads: metaAds.length,
      days: dailyData.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao sincronizar com Meta";
    await updateClientIntegrationState(clientId, {
      meta_last_sync_error: message,
      meta_sync_status: inferSyncStatusFromError(message),
    });
    throw error;
  }
}

export async function syncAdDailyMetrics(
  clientId: string,
  adAccountId: string,
  accessToken: string,
  datePreset = "last_30d",
  onProgress?: (msg: string) => void
): Promise<number> {
  const accountId = normalizeAccountId(adAccountId);
  const token = accessToken.trim();

  // `level=ad` com `time_increment=1` gera uma linha por anuncio por dia. No
  // periodo inteiro de uma vez a Meta recusa a query por volume (erro 1), entao
  // pedimos semana a semana: varias requisicoes baratas em vez de uma impossivel.
  const { since, until } = presetToRange(datePreset);
  const windows = splitDateRange(since, until, 7);
  const insights: MetaAdInsightRow[] = [];

  for (const [index, window] of windows.entries()) {
    onProgress?.(`Metricas por anuncio (${index + 1}/${windows.length})...`);
    const rows = await metaFetchAll<MetaAdInsightRow>(
      `act_${accountId}/insights`,
      {
        fields: "ad_id,impressions,clicks,spend,reach,frequency,video_thruplay_watched_actions,video_p25_watched_actions,video_p75_watched_actions",
        level: "ad",
        time_increment: "1",
        time_range: JSON.stringify(window),
        access_token: token,
      },
      { limit: 100 }
    );
    insights.push(...rows);
  }

  const metaAdIds = [...new Set(insights.map((row) => row.ad_id).filter(Boolean))];
  const { data: adsData } = metaAdIds.length
    ? await supabase.from("ads").select("id, meta_ad_id").in("meta_ad_id", metaAdIds)
    : { data: [] as { id: string; meta_ad_id: string | null }[] };

  const adIdMap = new Map<string, string>();
  (adsData || []).forEach((ad) => {
    if (ad.meta_ad_id) adIdMap.set(ad.meta_ad_id, ad.id);
  });

  let inserted = 0;
  for (const row of insights) {
    const internalId = adIdMap.get(row.ad_id);
    if (!internalId) continue;

    await supabase.from("ad_daily_metrics").upsert(
      {
        ad_id: internalId,
        date: row.date_start,
        impressions: ni(row.impressions),
        clicks: ni(row.clicks),
        spend: n(row.spend),
        reach: ni(row.reach),
        frequency: n(row.frequency),
        video_thruplay: extractAction(row.video_thruplay_watched_actions),
        video_p25_views: extractAction(row.video_p25_watched_actions),
        video_p75_views: extractAction(row.video_p75_watched_actions),
      },
      { onConflict: "ad_id,date" }
    );
    inserted++;
  }

  return inserted;
}

const DIMENSIONS = ["age", "gender", "placement", "device_platform", "publisher_platform", "country", "region"] as const;

function resolveDatePresetRange(datePreset: string): { dateStart: string; dateStop: string } {
  const today = new Date();
  const dateStop = today.toISOString().split("T")[0];

  const presetDays: Record<string, number> = {
    last_7d: 7,
    last_14d: 14,
    last_30d: 30,
    last_90d: 90,
  };

  const days = presetDays[datePreset] ?? 30;
  const dateStart = new Date(today.getTime() - days * 86400000).toISOString().split("T")[0];

  return { dateStart, dateStop };
}

export async function syncAudienceBreakdowns(
  clientId: string,
  adAccountId: string,
  accessToken: string,
  datePreset = "last_30d",
  onProgress?: (msg: string) => void
): Promise<number> {
  const accountId = normalizeAccountId(adAccountId);
  const token = accessToken.trim();
  let total = 0;
  const { dateStart, dateStop } = resolveDatePresetRange(datePreset);

  for (const dimension of DIMENSIONS) {
    onProgress?.(`Buscando breakdown: ${dimension}...`);
    try {
      const rows = await metaFetchAll<MetaBreakdownRow>(
        `act_${accountId}/insights`,
        {
          fields: "impressions,clicks,spend,reach",
          breakdowns: dimension,
          date_preset: datePreset,
          level: "account",
          access_token: token,
        },
        { limit: 100 }
      );

      for (const row of rows) {
        const dimensionValue = (row as Record<string, string | undefined>)[dimension];
        if (!dimensionValue) continue;

        await supabase.from("ad_breakdowns").upsert(
          {
            client_id: clientId,
            date_start: dateStart,
            date_stop: dateStop,
            dimension,
            dimension_value: dimensionValue,
            impressions: ni(row.impressions),
            clicks: ni(row.clicks),
            spend: n(row.spend),
            reach: ni(row.reach),
            conversions: 0,
          },
          { onConflict: "client_id,date_start,date_stop,dimension,dimension_value" }
        );
        total++;
      }
    } catch {
      // Some dimensions may be unavailable; continue with the others.
    }
  }

  return total;
}

export async function getClientAdImages(clientId: string) {
  const { data } = await supabase
    .from("ads")
    .select("image_url, name, status, ad_set_id")
    .in(
      "ad_set_id",
      (
        await supabase
          .from("ad_sets")
          .select("id")
          .in(
            "campaign_id",
            (await supabase.from("campaigns").select("id").eq("client_id", clientId)).data?.map((campaign) => campaign.id) || []
          )
      ).data?.map((adSet) => adSet.id) || []
    )
    .not("image_url", "is", null);

  return data || [];
}
