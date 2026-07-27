import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function dbGet(supabaseUrl: string, svcKey: string, path: string) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    cache: "no-store",
  }).then(r => r.json());
}

interface ClientRow {
  id: string;
  name: string;
  logo_url: string | null;
  business_segment: string | null;
  monthly_budget: number | null;
  meta_last_sync_at: string | null;
}

interface CampaignRow {
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  conversions: number;
}

interface DailyMetricRow {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
}

// Este endpoint e publico (o token no link E a autenticacao — sem login).
// So devolve campos seguros pra exibir: nunca meta_access_token ou outros
// dados sensiveis do cliente.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token } = await req.json().catch(() => ({}));
    if (!token) throw new Error("Token não informado");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
    if (!supabaseUrl || !svcKey) throw new Error("SUPABASE_URL / SVC_ROLE_KEY não configurados");

    const [client]: ClientRow[] = await dbGet(
      supabaseUrl, svcKey,
      `clients?dashboard_share_token=eq.${token}&select=id,name,logo_url,business_segment,monthly_budget,meta_last_sync_at&limit=1`
    );
    if (!client) {
      return new Response(JSON.stringify({ error: "Dashboard não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().split("T")[0];

    const [dailyMetrics, campaigns]: [DailyMetricRow[], CampaignRow[]] = await Promise.all([
      dbGet(supabaseUrl, svcKey, `campaign_daily_metrics?client_id=eq.${client.id}&date=gte.${sinceStr}&select=date,spend,clicks,impressions&order=date.asc`),
      dbGet(supabaseUrl, svcKey, `campaigns?client_id=eq.${client.id}&select=name,status,spend,impressions,clicks,ctr,cpm,conversions&order=spend.desc`),
    ]);

    const summary = (dailyMetrics || []).reduce(
      (acc, row) => ({
        spend: acc.spend + (row.spend ?? 0),
        clicks: acc.clicks + (row.clicks ?? 0),
        impressions: acc.impressions + (row.impressions ?? 0),
      }),
      { spend: 0, clicks: 0, impressions: 0 }
    );

    const ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions) * 100 : 0;
    const cpm = summary.impressions > 0 ? (summary.spend / summary.impressions) * 1000 : 0;
    const cpc = summary.clicks > 0 ? summary.spend / summary.clicks : 0;

    const budgetPct = client.monthly_budget ? (summary.spend / client.monthly_budget) * 100 : null;

    return new Response(
      JSON.stringify({
        client: {
          name: client.name,
          logoUrl: client.logo_url,
          businessSegment: client.business_segment,
        },
        summary: { ...summary, ctr, cpm, cpc },
        monthlyBudget: client.monthly_budget,
        budgetPct,
        dailySeries: (dailyMetrics || []).map(row => ({ date: row.date, spend: row.spend ?? 0, clicks: row.clicks ?? 0, impressions: row.impressions ?? 0 })),
        campaigns: (campaigns || []).filter(c => c.status === "ACTIVE" || c.spend > 0).slice(0, 15),
        lastSyncAt: client.meta_last_sync_at,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
