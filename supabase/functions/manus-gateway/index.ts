import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function parsePeriodDays(period: string | null): number {
  if (!period) return 30;
  const n = parseInt(period.replace("d", ""));
  return isNaN(n) ? 30 : n;
}

function sinceDate(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().split("T")[0];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("MANUS_API_KEY");
  if (!expectedKey || apiKey !== expectedKey) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const path = url.pathname.replace(/.*\/manus-gateway/, "") || "/";
  const params = url.searchParams;
  const generatedAt = new Date().toISOString();

  const meta = (endpoint: string, extra?: Record<string, unknown>) => ({
    generated_at: generatedAt,
    endpoint,
    ...extra,
  });

  try {
    // GET /
    if (path === "/" || path === "") {
      return json({
        success: true,
        data: {
          name: "Ad Campaign Hub — Manus Gateway",
          version: "1.0",
          endpoints: [
            "GET /clients",
            "GET /clients/:id/campaigns  ?status=ACTIVE&sort_by=spend&period=30d",
            "GET /clients/:id/metrics   ?period=30d",
            "GET /clients/:id/audit",
            "GET /clients/:id/alerts",
            "GET /summary",
          ],
        },
        meta: meta("/"),
      });
    }

    // GET /clients
    if (path === "/clients") {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, status, meta_sync_status, meta_last_sync_at, city, state, primary_goal, business_segment")
        .order("name");
      if (error) throw error;
      return json({ success: true, data, meta: meta("/clients") });
    }

    // GET /clients/:id/campaigns
    const campaignsMatch = path.match(/^\/clients\/([^/]+)\/campaigns$/);
    if (campaignsMatch) {
      const clientId = campaignsMatch[1];
      const statusFilter = params.get("status");
      const validSorts = ["spend", "impressions", "clicks", "ctr", "cpc", "cpm", "conversions"];
      const sortBy = validSorts.includes(params.get("sort_by") ?? "") ? params.get("sort_by")! : "spend";

      let query = supabase
        .from("campaigns")
        .select("id, name, status, objective, spend, impressions, clicks, ctr, cpc, cpm, conversions, updated_at")
        .eq("client_id", clientId)
        .order(sortBy, { ascending: false });

      if (statusFilter) query = query.eq("status", statusFilter.toUpperCase());

      const { data, error } = await query;
      if (error) throw error;

      return json({
        success: true,
        data,
        meta: meta(path, { filters: { status: statusFilter, sort_by: sortBy } }),
      });
    }

    // GET /clients/:id/metrics
    const metricsMatch = path.match(/^\/clients\/([^/]+)\/metrics$/);
    if (metricsMatch) {
      const clientId = metricsMatch[1];
      const days = parsePeriodDays(params.get("period"));
      const since = sinceDate(days);

      const { data, error } = await supabase
        .from("campaign_daily_metrics")
        .select("date, spend, impressions, clicks, messages, calls, directions, leads, profile_visits")
        .eq("client_id", clientId)
        .gte("date", since)
        .order("date", { ascending: true });
      if (error) throw error;

      const totals = (data ?? []).reduce(
        (acc, row) => ({
          spend: acc.spend + (row.spend ?? 0),
          impressions: acc.impressions + (row.impressions ?? 0),
          clicks: acc.clicks + (row.clicks ?? 0),
          messages: acc.messages + (row.messages ?? 0),
          calls: acc.calls + (row.calls ?? 0),
          directions: acc.directions + (row.directions ?? 0),
          leads: acc.leads + (row.leads ?? 0),
          profile_visits: acc.profile_visits + (row.profile_visits ?? 0),
        }),
        { spend: 0, impressions: 0, clicks: 0, messages: 0, calls: 0, directions: 0, leads: 0, profile_visits: 0 },
      );

      const ctr = totals.impressions > 0 ? +((totals.clicks / totals.impressions) * 100).toFixed(2) : 0;
      const cpc = totals.clicks > 0 ? +(totals.spend / totals.clicks).toFixed(2) : 0;

      return json({
        success: true,
        data: { period: `${days}d`, since, totals: { ...totals, ctr, cpc }, daily: data },
        meta: meta(path),
      });
    }

    // GET /clients/:id/audit
    const auditMatch = path.match(/^\/clients\/([^/]+)\/audit$/);
    if (auditMatch) {
      const clientId = auditMatch[1];

      const { data, error } = await supabase
        .from("audit_runs")
        .select("id, score, category_scores, results, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      if (!data) {
        return json({ success: true, data: null, meta: meta(path) });
      }

      const severityWeight: Record<string, number> = { critical: 3, warning: 2, info: 1 };
      const topIssues = ((data.results ?? []) as any[])
        .filter((r) => r.status === "fail" || r.status === "warn")
        .sort((a, b) => (severityWeight[b.severity] ?? 0) - (severityWeight[a.severity] ?? 0))
        .slice(0, 5)
        .map(({ id, name, status, severity, message, recommendation }) => ({
          id, name, status, severity, message, recommendation,
        }));

      return json({
        success: true,
        data: {
          score: data.score,
          category_scores: data.category_scores,
          top_issues: topIssues,
          run_at: data.created_at,
        },
        meta: meta(path),
      });
    }

    // GET /clients/:id/alerts
    const alertsMatch = path.match(/^\/clients\/([^/]+)\/alerts$/);
    if (alertsMatch) {
      const clientId = alertsMatch[1];

      const { data: clientAlerts } = await supabase
        .from("alerts")
        .select("id, name")
        .eq("client_id", clientId);

      const alertIds = (clientAlerts ?? []).map((a: any) => a.id);

      if (alertIds.length === 0) {
        return json({ success: true, data: [], meta: meta(path) });
      }

      const alertNameById = Object.fromEntries((clientAlerts ?? []).map((a: any) => [a.id, a.name]));

      const { data: events, error } = await supabase
        .from("alert_events")
        .select("id, alert_id, triggered_at, status, entity_type, entity_name, metric_value")
        .in("alert_id", alertIds)
        .in("status", ["open", "acknowledged"])
        .order("triggered_at", { ascending: false })
        .limit(20);
      if (error) throw error;

      const enriched = (events ?? []).map((e: any) => ({
        ...e,
        alert_name: alertNameById[e.alert_id] ?? null,
      }));

      return json({ success: true, data: enriched, meta: meta(path) });
    }

    // GET /summary
    if (path === "/summary") {
      const [clientsRes, topCampaignsRes, alertsRes] = await Promise.all([
        supabase
          .from("clients")
          .select("id, name, status, meta_sync_status, city")
          .eq("status", "active"),
        supabase
          .from("campaigns")
          .select("id, name, spend, ctr, impressions, clicks, client_id")
          .eq("status", "ACTIVE")
          .order("spend", { ascending: false })
          .limit(5),
        supabase
          .from("alert_events")
          .select("id", { count: "exact", head: true })
          .in("status", ["open", "acknowledged"]),
      ]);

      return json({
        success: true,
        data: {
          active_clients: (clientsRes.data ?? []).length,
          clients: clientsRes.data ?? [],
          top_campaigns_by_spend: topCampaignsRes.data ?? [],
          open_alerts_count: alertsRes.count ?? 0,
        },
        meta: meta("/summary"),
      });
    }

    return json({ success: false, error: "Endpoint não encontrado" }, 404);
  } catch (err) {
    console.error("manus-gateway error:", err);
    const message = err instanceof Error ? err.message : "Erro interno";
    return json({ success: false, error: message }, 500);
  }
});
