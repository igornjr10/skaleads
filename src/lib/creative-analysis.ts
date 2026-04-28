import { supabase } from "@/integrations/supabase/client";

export type FatigueStatus = "NONE" | "MODERATE" | "SEVERE";

export interface DailyMetric {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  reach: number;
  frequency: number;
  video_3s_views: number;
  video_p25_views: number;
  video_p75_views: number;
  video_thruplay: number;
}

export interface CreativeItem {
  id: string;
  meta_ad_id: string | null;
  name: string;
  status: string;
  thumbnail_url: string | null;
  image_url: string | null;
  video_id: string | null;
  body: string | null;
  title: string | null;
  creative_type: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  frequency: number;
  ctr: number;
  cpa: number;
  roas: number;
  hookRate: number | null;
  holdRate: number | null;
  fatigueStatus: FatigueStatus;
}

export type SortField = "spend" | "ctr" | "cpa" | "conversions" | "frequency" | "roas";
export type SortDir = "asc" | "desc";

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

export function computeFatigue(dailyMetrics: DailyMetric[]): FatigueStatus {
  const sorted = [...dailyMetrics].sort((a, b) => a.date.localeCompare(b.date));
  // Need at least 10 days to have a meaningful baseline (7) + current window (3)
  if (sorted.length < 10) return "NONE";

  const baseline = sorted.slice(0, 7);
  const recent = sorted.slice(-3);

  const baselineCTR = avg(baseline.map(m => m.impressions > 0 ? m.clicks / m.impressions : 0));
  const currentCTR = avg(recent.map(m => m.impressions > 0 ? m.clicks / m.impressions : 0));
  const freq = avg(recent.map(m => m.frequency));

  const delta = baselineCTR > 0 ? (baselineCTR - currentCTR) / baselineCTR : 0;

  if (delta > 0.40 && freq > 3.5) return "SEVERE";
  if (delta > 0.25 && freq > 2.5) return "MODERATE";
  return "NONE";
}

export interface GalleryFilters {
  period: number; // days
  fatigueOnly: boolean;
  sortField: SortField;
  sortDir: SortDir;
  search: string;
}

export async function getCreativesGallery(
  clientId: string,
  filters: GalleryFilters
): Promise<CreativeItem[]> {
  // Join ads → ad_sets → campaigns filtering by client_id
  const { data: adsRaw, error } = await supabase
    .from("ads")
    .select(`
      id, meta_ad_id, name, status,
      thumbnail_url, image_url, video_id, body, title, creative_type,
      spend, impressions, clicks, conversions, frequency,
      ad_sets!inner(campaign_id, campaigns!inner(client_id))
    `)
    .eq("ad_sets.campaigns.client_id", clientId);

  if (error) throw error;

  // Fetch daily metrics for fatigue calculation for all these ads
  const adIds = (adsRaw || []).map((a: any) => a.id);
  const dailyByAd = new Map<string, DailyMetric[]>();

  if (adIds.length > 0) {
    const { data: dailyRaw } = await supabase
      .from("ad_daily_metrics")
      .select("ad_id, date, impressions, clicks, spend, conversions, reach, frequency, video_3s_views, video_p25_views, video_p75_views, video_thruplay")
      .in("ad_id", adIds)
      .order("date");

    for (const row of (dailyRaw || []) as any[]) {
      if (!dailyByAd.has(row.ad_id)) dailyByAd.set(row.ad_id, []);
      dailyByAd.get(row.ad_id)!.push(row);
    }
  }

  let creatives: CreativeItem[] = (adsRaw || []).map((ad: any) => {
    const daily = dailyByAd.get(ad.id) || [];
    const fatigueStatus = computeFatigue(daily);

    const totalImpressionsDaily = daily.reduce((s, d) => s + d.impressions, 0);
    const totalV3s = daily.reduce((s, d) => s + (d.video_3s_views || 0), 0);
    const totalP25 = daily.reduce((s, d) => s + (d.video_p25_views || 0), 0);
    const totalThruplay = daily.reduce((s, d) => s + (d.video_thruplay || 0), 0);

    const isVideo = ad.creative_type === "video" || !!ad.video_id;
    const hookRate = isVideo && totalImpressionsDaily > 0 ? (totalV3s / totalImpressionsDaily) * 100 : null;
    const holdRate = isVideo && totalP25 > 0 ? (totalThruplay / totalP25) * 100 : null;

    const ctr = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0;
    const cpa = ad.conversions > 0 ? ad.spend / ad.conversions : 0;
    const roas = ad.spend > 0 ? 0 : 0; // revenue not tracked at ad level yet

    return {
      id: ad.id,
      meta_ad_id: ad.meta_ad_id,
      name: ad.name,
      status: ad.status,
      thumbnail_url: ad.thumbnail_url,
      image_url: ad.image_url,
      video_id: ad.video_id,
      body: ad.body,
      title: ad.title,
      creative_type: ad.creative_type || "image",
      spend: ad.spend || 0,
      impressions: ad.impressions || 0,
      clicks: ad.clicks || 0,
      conversions: ad.conversions || 0,
      frequency: ad.frequency || 0,
      ctr,
      cpa,
      roas,
      hookRate,
      holdRate,
      fatigueStatus,
    };
  });

  // Filter
  if (filters.fatigueOnly) {
    creatives = creatives.filter(c => c.fatigueStatus !== "NONE");
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    creatives = creatives.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.body?.toLowerCase().includes(q)) ||
      (c.title?.toLowerCase().includes(q))
    );
  }

  // Sort
  creatives.sort((a, b) => {
    const va = a[filters.sortField] as number;
    const vb = b[filters.sortField] as number;
    return filters.sortDir === "desc" ? vb - va : va - vb;
  });

  return creatives;
}

export async function getCreativeMetrics(adId: string): Promise<DailyMetric[]> {
  const { data, error } = await supabase
    .from("ad_daily_metrics")
    .select("date, impressions, clicks, spend, conversions, reach, frequency, video_3s_views, video_p25_views, video_p75_views, video_thruplay")
    .eq("ad_id", adId)
    .order("date");

  if (error) throw error;
  return (data || []) as DailyMetric[];
}
