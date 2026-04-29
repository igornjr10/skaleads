import { supabase } from "@/integrations/supabase/client";

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
  insights?: { data: MetaInsight[] };
}

interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  insights?: { data: MetaInsight[] };
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
  insights?: { data: MetaInsight[] };
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

interface MetaPagedResponse<T> {
  data: T[];
  paging?: { next?: string };
  error?: { message: string; code: number };
}

function extractAction(actions?: Array<{ action_type: string; value: string }>, type = "video_view"): number {
  return parseInt(actions?.find((action) => action.action_type === type)?.value ?? "0") || 0;
}

async function metaFetchAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
  let url: string | undefined = `${META_BASE}/${path}?${new URLSearchParams(params)}`;
  const items: T[] = [];

  while (url) {
    const res = await fetch(url);
    const json: MetaPagedResponse<T> = await res.json();
    if (json.error) throw new Error(json.error.message);
    items.push(...(json.data ?? []));
    url = json.paging?.next;
  }

  return items;
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

  if (text.includes("rate limit") || text.includes("temporar") || text.includes("try again")) {
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

  const url = `${META_BASE}/act_${accountId}?${new URLSearchParams({
    fields: "id,name,account_status",
    access_token: token,
  })}`;

  const response = await fetch(url);
  const json = await response.json();
  if (json.error) throw new Error(json.error.message);

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
    const metaCampaigns = await metaFetchAll<MetaCampaign>(`act_${accountId}/campaigns`, {
      fields: "id,name,status,objective,insights.date_preset(last_30d){spend,impressions,clicks,ctr,cpc,cpm,conversions}",
      limit: "100",
      access_token: token,
    });

    const { data: existingCampaigns } = await supabase
      .from("campaigns")
      .select("id, meta_campaign_id")
      .eq("client_id", clientId);

    const campaignMap = new Map<string, string>();
    existingCampaigns?.forEach((campaign) => {
      if (campaign.meta_campaign_id) campaignMap.set(campaign.meta_campaign_id, campaign.id);
    });

    for (const campaign of metaCampaigns) {
      const insight = campaign.insights?.data?.[0];
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
    const metaAdSets = await metaFetchAll<MetaAdSet>(`act_${accountId}/adsets`, {
      fields: "id,name,status,campaign_id,insights.date_preset(last_30d){spend,impressions,clicks}",
      limit: "200",
      access_token: token,
    });

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

      const insight = adSet.insights?.data?.[0];
      const payload = {
        campaign_id: campaignInternalId,
        meta_adset_id: adSet.id,
        name: adSet.name,
        status: adSet.status,
        spend: n(insight?.spend),
        impressions: ni(insight?.impressions),
        clicks: ni(insight?.clicks),
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
    const metaAds = await metaFetchAll<MetaAd>(`act_${accountId}/ads`, {
      fields: "id,name,status,adset_id,creative{thumbnail_url,image_url,body,title,object_type,video_id},insights.date_preset(last_30d){spend,impressions,clicks}",
      limit: "500",
      access_token: token,
    });

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

      const insight = ad.insights?.data?.[0];
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
    const dailyData = await metaFetchAll<MetaInsight & { date_start: string }>(`act_${accountId}/insights`, {
      fields: "spend,impressions,clicks,date_start",
      time_increment: "1",
      date_preset: "last_30d",
      level: "account",
      access_token: token,
    });

    for (const day of dailyData) {
      await supabase.from("campaign_daily_metrics").upsert(
        {
          client_id: clientId,
          date: day.date_start,
          spend: n(day.spend),
          impressions: ni(day.impressions),
          clicks: ni(day.clicks),
        },
        { onConflict: "client_id,date" }
      );
    }

    const completedAt = new Date().toISOString();
    await updateClientIntegrationState(
      clientId,
      {
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

  onProgress?.("Buscando metricas diarias por anuncio...");

  const insights = await metaFetchAll<MetaAdInsightRow>(`act_${accountId}/insights`, {
    fields: "ad_id,impressions,clicks,spend,reach,frequency,video_thruplay_watched_actions,video_p25_watched_actions,video_p75_watched_actions",
    level: "ad",
    time_increment: "1",
    date_preset: datePreset,
    access_token: token,
    limit: "500",
  });

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
      const rows = await metaFetchAll<MetaBreakdownRow>(`act_${accountId}/insights`, {
        fields: "impressions,clicks,spend,reach",
        breakdowns: dimension,
        date_preset: datePreset,
        level: "account",
        access_token: token,
        limit: "500",
      });

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
