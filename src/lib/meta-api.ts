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
  insights?: { data: MetaInsight[] };
}

interface MetaPagedResponse<T> {
  data: T[];
  paging?: { next?: string };
  error?: { message: string; code: number };
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

function n(val?: string): number {
  return parseFloat(val ?? "0") || 0;
}

function ni(val?: string): number {
  return parseInt(val ?? "0") || 0;
}

export interface SyncResult {
  campaigns: number;
  adSets: number;
  ads: number;
  days: number;
}

export async function syncClientData(
  clientId: string,
  adAccountId: string,
  accessToken: string,
  onProgress?: (msg: string) => void
): Promise<SyncResult> {
  const accountId = normalizeAccountId(adAccountId);
  const token = accessToken.trim();

  // ── 1. Campaigns ────────────────────────────────────────────────────────────
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
  existingCampaigns?.forEach((c) => { if (c.meta_campaign_id) campaignMap.set(c.meta_campaign_id, c.id); });

  for (const c of metaCampaigns) {
    const ins = c.insights?.data?.[0];
    const payload = {
      client_id: clientId,
      meta_campaign_id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective ?? null,
      spend: n(ins?.spend),
      impressions: ni(ins?.impressions),
      clicks: ni(ins?.clicks),
      ctr: n(ins?.ctr),
      cpc: n(ins?.cpc),
      cpm: n(ins?.cpm),
      conversions: ni(ins?.conversions),
    };
    const existingId = campaignMap.get(c.id);
    if (existingId) {
      await supabase.from("campaigns").update(payload).eq("id", existingId);
    } else {
      const { data } = await supabase.from("campaigns").insert(payload).select("id").single();
      if (data) campaignMap.set(c.id, data.id);
    }
  }

  // ── 2. Ad Sets ───────────────────────────────────────────────────────────────
  onProgress?.("Buscando conjuntos de anúncios...");
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
  existingAdSets?.forEach((a) => { if (a.meta_adset_id) adSetMap.set(a.meta_adset_id, a.id); });

  for (const as of metaAdSets) {
    const campaignInternalId = campaignMap.get(as.campaign_id);
    if (!campaignInternalId) continue;
    const ins = as.insights?.data?.[0];
    const payload = {
      campaign_id: campaignInternalId,
      meta_adset_id: as.id,
      name: as.name,
      status: as.status,
      spend: n(ins?.spend),
      impressions: ni(ins?.impressions),
      clicks: ni(ins?.clicks),
    };
    const existingId = adSetMap.get(as.id);
    if (existingId) {
      await supabase.from("ad_sets").update(payload).eq("id", existingId);
    } else {
      const { data } = await supabase.from("ad_sets").insert(payload).select("id").single();
      if (data) adSetMap.set(as.id, data.id);
    }
  }

  // ── 3. Ads ───────────────────────────────────────────────────────────────────
  onProgress?.("Buscando anúncios...");
  const metaAds = await metaFetchAll<MetaAd>(`act_${accountId}/ads`, {
    fields: "id,name,status,adset_id,insights.date_preset(last_30d){spend,impressions,clicks}",
    limit: "500",
    access_token: token,
  });

  const adSetInternalIds = [...adSetMap.values()];
  const { data: existingAds } = adSetInternalIds.length
    ? await supabase.from("ads").select("id, meta_ad_id").in("ad_set_id", adSetInternalIds)
    : { data: [] as { id: string; meta_ad_id: string | null }[] };

  const adMap = new Map<string, string>();
  existingAds?.forEach((a) => { if (a.meta_ad_id) adMap.set(a.meta_ad_id, a.id); });

  for (const ad of metaAds) {
    const adSetInternalId = adSetMap.get(ad.adset_id);
    if (!adSetInternalId) continue;
    const ins = ad.insights?.data?.[0];
    const payload = {
      ad_set_id: adSetInternalId,
      meta_ad_id: ad.id,
      name: ad.name,
      status: ad.status,
      spend: n(ins?.spend),
      impressions: ni(ins?.impressions),
      clicks: ni(ins?.clicks),
    };
    const existingId = adMap.get(ad.id);
    if (existingId) {
      await supabase.from("ads").update(payload).eq("id", existingId);
    } else {
      await supabase.from("ads").insert(payload);
    }
  }

  // ── 4. Daily metrics (chart) ─────────────────────────────────────────────────
  onProgress?.("Buscando métricas diárias...");
  const dailyData = await metaFetchAll<MetaInsight & { date_start: string }>(
    `act_${accountId}/insights`,
    {
      fields: "spend,impressions,clicks,date_start",
      time_increment: "1",
      date_preset: "last_30d",
      level: "account",
      access_token: token,
    }
  );

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

  // ── 5. Update meta_connected_at ──────────────────────────────────────────────
  await supabase
    .from("clients")
    .update({ meta_connected_at: new Date().toISOString() })
    .eq("id", clientId);

  return {
    campaigns: metaCampaigns.length,
    adSets: metaAdSets.length,
    ads: metaAds.length,
    days: dailyData.length,
  };
}
