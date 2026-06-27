import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  const n = parseInt((period ?? "30").replace("d", ""));
  return isNaN(n) ? 30 : n;
}

function sinceDate(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().split("T")[0];
}

async function dbGet(baseUrl: string, serviceKey: string, table: string, qs: Record<string, string>): Promise<any[]> {
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  Object.entries(qs).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: {
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Accept": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DB error on ${table}: ${body}`);
  }
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("MANUS_API_KEY");
  if (!expectedKey || apiKey !== expectedKey) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SVC_ROLE_KEY")!;

  const url = new URL(req.url);
  const path = url.pathname.replace(/.*\/manus-gateway/, "") || "/";
  const params = url.searchParams;
  const generatedAt = new Date().toISOString();
  const meta = (endpoint: string, extra?: Record<string, unknown>) => ({ generated_at: generatedAt, endpoint, ...extra });

  try {
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

    if (path === "/clients") {
      const data = await dbGet(baseUrl, serviceKey, "clients", {
        select: "id,name,status,meta_sync_status,meta_last_sync_at,city,state",
        order: "name.asc",
      });
      return json({ success: true, data, meta: meta("/clients") });
    }

    const campaignsMatch = path.match(/^\/clients\/([^/]+)\/campaigns$/);
    if (campaignsMatch) {
      const clientId = campaignsMatch[1];
      const validSorts = ["spend", "impressions", "clicks", "ctr", "cpc", "cpm", "conversions"];
      const sortBy = validSorts.includes(params.get("sort_by") ?? "") ? params.get("sort_by")! : "spend";
      const statusFilter = params.get("status");

      const qs: Record<string, string> = {
        select: "id,name,status,objective,spend,impressions,clicks,ctr,cpc,cpm,conversions,updated_at",
        "client_id": `eq.${clientId}`,
        order: `${sortBy}.desc`,
      };
      if (statusFilter) qs["status"] = `eq.${statusFilter.toUpperCase()}`;

      const data = await dbGet(baseUrl, serviceKey, "campaigns", qs);
      return json({ success: true, data, meta: meta(path, { filters: { status: statusFilter, sort_by: sortBy } }) });
    }

    const metricsMatch = path.match(/^\/clients\/([^/]+)\/metrics$/);
    if (metricsMatch) {
      const clientId = metricsMatch[1];
      const days = parsePeriodDays(params.get("period"));
      const since = sinceDate(days);

      const data = await dbGet(baseUrl, serviceKey, "campaign_daily_metrics", {
        select: "date,spend,impressions,clicks",
        "client_id": `eq.${clientId}`,
        date: `gte.${since}`,
        order: "date.asc",
      });

      const totals = data.reduce(
        (acc, r) => ({
          spend: acc.spend + (r.spend ?? 0),
          impressions: acc.impressions + (r.impressions ?? 0),
          clicks: acc.clicks + (r.clicks ?? 0),
        }),
        { spend: 0, impressions: 0, clicks: 0 }
      );
      const ctr = totals.impressions > 0 ? +((totals.clicks / totals.impressions) * 100).toFixed(2) : 0;
      const cpc = totals.clicks > 0 ? +(totals.spend / totals.clicks).toFixed(2) : 0;

      return json({
        success: true,
        data: { period: `${days}d`, since, totals: { ...totals, ctr, cpc }, daily: data },
        meta: meta(path),
      });
    }

    const auditMatch = path.match(/^\/clients\/([^/]+)\/audit$/);
    if (auditMatch) {
      const clientId = auditMatch[1];
      const rows = await dbGet(baseUrl, serviceKey, "audit_runs", {
        select: "id,score,category_scores,results,created_at",
        "client_id": `eq.${clientId}`,
        order: "created_at.desc",
        limit: "1",
      });
      if (!rows.length) return json({ success: true, data: null, meta: meta(path) });

      const audit = rows[0];
      const w: Record<string, number> = { critical: 3, warning: 2, info: 1 };
      const topIssues = ((audit.results ?? []) as any[])
        .filter((r) => r.status === "fail" || r.status === "warn")
        .sort((a, b) => (w[b.severity] ?? 0) - (w[a.severity] ?? 0))
        .slice(0, 5)
        .map(({ id, name, status, severity, message, recommendation }) => ({ id, name, status, severity, message, recommendation }));

      return json({
        success: true,
        data: { score: audit.score, category_scores: audit.category_scores, top_issues: topIssues, run_at: audit.created_at },
        meta: meta(path),
      });
    }

    const alertsMatch = path.match(/^\/clients\/([^/]+)\/alerts$/);
    if (alertsMatch) {
      const clientId = alertsMatch[1];
      const alertRows = await dbGet(baseUrl, serviceKey, "alerts", {
        select: "id,name",
        "client_id": `eq.${clientId}`,
      });
      if (!alertRows.length) return json({ success: true, data: [], meta: meta(path) });

      const alertIds = alertRows.map((a: any) => a.id).join(",");
      const alertNameById = Object.fromEntries(alertRows.map((a: any) => [a.id, a.name]));

      const events = await dbGet(baseUrl, serviceKey, "alert_events", {
        select: "id,alert_id,triggered_at,status,entity_type,entity_name,metric_value",
        "alert_id": `in.(${alertIds})`,
        status: "in.(open,acknowledged)",
        order: "triggered_at.desc",
        limit: "20",
      });

      return json({
        success: true,
        data: events.map((e: any) => ({ ...e, alert_name: alertNameById[e.alert_id] ?? null })),
        meta: meta(path),
      });
    }

    if (path === "/summary") {
      const [clients, topCampaigns] = await Promise.all([
        dbGet(baseUrl, serviceKey, "clients", { select: "id,name,status,meta_sync_status,city", status: "eq.active" }),
        dbGet(baseUrl, serviceKey, "campaigns", { select: "id,name,spend,ctr,impressions,clicks,client_id", status: "eq.ACTIVE", order: "spend.desc", limit: "5" }),
      ]);

      return json({
        success: true,
        data: { active_clients: clients.length, clients, top_campaigns_by_spend: topCampaigns },
        meta: meta("/summary"),
      });
    }

    return json({ success: false, error: "Endpoint não encontrado" }, 404);
  } catch (err) {
    console.error("manus-gateway error:", err);
    const message = (err as any)?.message ?? String(err);
    return json({ success: false, error: message }, 500);
  }
});
