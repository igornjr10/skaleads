import { supabase } from "@/integrations/supabase/client";
import { subDays, format } from "date-fns";

export type Dimension =
  | "age"
  | "gender"
  | "placement"
  | "device_platform"
  | "publisher_platform"
  | "country"
  | "region";

export interface BreakdownRow {
  dimension_value: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  reach: number;
  ctr: number;
  cpa: number;
  cpm: number;
}

export interface HeatmapCell {
  dim1Value: string;
  dim2Value: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
}

export async function getBreakdown(
  clientId: string,
  days: number,
  dimension: Dimension
): Promise<BreakdownRow[]> {
  const dateStart = format(subDays(new Date(), days), "yyyy-MM-dd");

  const { data, error } = await supabase
    .from("ad_breakdowns")
    .select("dimension_value, impressions, clicks, spend, conversions, reach")
    .eq("client_id", clientId)
    .eq("dimension", dimension)
    .gte("date_start", dateStart);

  if (error) throw error;

  // Aggregate (multiple date ranges might exist)
  const aggregated = new Map<string, BreakdownRow>();
  for (const row of (data || []) as any[]) {
    const existing = aggregated.get(row.dimension_value);
    if (existing) {
      existing.impressions += row.impressions || 0;
      existing.clicks += row.clicks || 0;
      existing.spend += row.spend || 0;
      existing.conversions += row.conversions || 0;
      existing.reach += row.reach || 0;
    } else {
      aggregated.set(row.dimension_value, {
        dimension_value: row.dimension_value,
        impressions: row.impressions || 0,
        clicks: row.clicks || 0,
        spend: row.spend || 0,
        conversions: row.conversions || 0,
        reach: row.reach || 0,
        ctr: 0,
        cpa: 0,
        cpm: 0,
      });
    }
  }

  const result = Array.from(aggregated.values()).map(r => ({
    ...r,
    ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
    cpa: r.conversions > 0 ? r.spend / r.conversions : 0,
    cpm: r.impressions > 0 ? (r.spend / r.impressions) * 1000 : 0,
  }));

  return result.sort((a, b) => b.spend - a.spend);
}

export async function getHeatmap(
  clientId: string,
  days: number,
  dim1: Dimension,
  dim2: Dimension
): Promise<{ dim1Values: string[]; dim2Values: string[]; cells: HeatmapCell[] }> {
  const [rows1, rows2] = await Promise.all([
    getBreakdown(clientId, days, dim1),
    getBreakdown(clientId, days, dim2),
  ]);

  const dim1Values = rows1.slice(0, 8).map(r => r.dimension_value);
  const dim2Values = rows2.slice(0, 6).map(r => r.dimension_value);

  // For a real heatmap we'd need cross-breakdown data from the API.
  // Approximate: distribute proportionally based on each dimension's share.
  const totalSpend = rows1.reduce((s, r) => s + r.spend, 0);
  const cells: HeatmapCell[] = [];

  for (const d1 of dim1Values) {
    const row1 = rows1.find(r => r.dimension_value === d1)!;
    const share1 = totalSpend > 0 ? row1.spend / totalSpend : 0;

    for (const d2 of dim2Values) {
      const row2 = rows2.find(r => r.dimension_value === d2);
      const share2 = totalSpend > 0 && row2 ? row2.spend / totalSpend : 0;
      const estimatedSpend = totalSpend * Math.sqrt(share1 * share2);
      const estimatedImpressions = Math.round((row1.impressions + (row2?.impressions || 0)) / 2 * Math.sqrt(share1 * share2) * 2);
      const estimatedClicks = Math.round((row1.clicks + (row2?.clicks || 0)) / 2 * Math.sqrt(share1 * share2) * 2);

      cells.push({
        dim1Value: d1,
        dim2Value: d2,
        spend: estimatedSpend,
        impressions: estimatedImpressions,
        clicks: estimatedClicks,
        ctr: estimatedImpressions > 0 ? (estimatedClicks / estimatedImpressions) * 100 : 0,
      });
    }
  }

  return { dim1Values, dim2Values, cells };
}
