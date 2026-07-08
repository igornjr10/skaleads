import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

type MetricKey = "spend" | "cpa" | "ctr" | "cpm" | "frequency" | "roas" | "status";
type Comparator = "gt" | "gte" | "lt" | "lte" | "eq" | "change_pct";
type Period = "1d" | "3d" | "7d" | "14d" | "30d";
type EntityType = "CLIENT" | "CAMPAIGN";

interface AlertCondition {
  metric: MetricKey;
  comparator: Comparator;
  value: number | string;
  period: Period;
  entityType: EntityType;
}

interface AlertRule {
  conditions: AlertCondition[];
  logic: "AND" | "OR";
}

interface AlertChannels {
  dashboard: boolean;
  email: boolean;
  emailRecipients: string[];
  whatsapp: boolean;
  whatsappTarget?: string;
}

interface StoredAlert {
  id: string;
  name: string;
  description: string | null;
  client_id: string | null;
  rule_json: AlertRule;
  channels: AlertChannels;
  cooldown_minutes: number;
  last_triggered_at: string | null;
  is_active: boolean;
}

interface FiredEntity {
  entityType: EntityType;
  entityId: string;
  entityName: string;
  metricValue: number;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

function dbGet(url: string, key: string, path: string) {
  return fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  }).then(r => r.json());
}

function dbInsert(url: string, key: string, table: string, body: object) {
  return fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
}

function dbPatch(url: string, key: string, path: string, body: object) {
  return fetch(`${url}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function isoDateMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function periodDays(p: Period): number {
  return parseInt(p);
}

// ─── Metric computation ───────────────────────────────────────────────────────

async function getClientDailyTotals(url: string, key: string, clientId: string, days: number) {
  const since = isoDateMinus(days);
  const rows = await dbGet(url, key,
    `campaign_daily_metrics?client_id=eq.${clientId}&date=gte.${since}&select=spend,clicks,impressions`
  );
  return (rows || []).reduce(
    (acc: { spend: number; clicks: number; impressions: number }, r: any) => ({
      spend: acc.spend + (r.spend ?? 0),
      clicks: acc.clicks + (r.clicks ?? 0),
      impressions: acc.impressions + (r.impressions ?? 0),
    }),
    { spend: 0, clicks: 0, impressions: 0 }
  );
}

async function computeClientMetric(url: string, key: string, clientId: string, metric: MetricKey, days: number): Promise<number> {
  if (metric === "status") return 0;

  const totals = await getClientDailyTotals(url, key, clientId, days);

  if (metric === "spend") return totals.spend;
  if (metric === "ctr") return totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  if (metric === "cpm") return totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;

  if (metric === "cpa" || metric === "roas") {
    const campaigns = await dbGet(url, key, `campaigns?client_id=eq.${clientId}&select=spend,conversions`);
    const rows = campaigns || [];
    const totalSpend = rows.reduce((s: number, r: any) => s + (r.spend ?? 0), 0);
    const totalConversions = rows.reduce((s: number, r: any) => s + (r.conversions ?? 0), 0);
    if (metric === "cpa") return totalConversions > 0 ? totalSpend / totalConversions : 0;
    return 0;
  }

  if (metric === "frequency") {
    const since = isoDateMinus(days);
    const rows = await dbGet(url, key, `ad_daily_metrics?date=gte.${since}&select=frequency&limit=1000`);
    if (!rows || rows.length === 0) return 0;
    return rows.reduce((s: number, r: any) => s + (r.frequency ?? 0), 0) / rows.length;
  }

  return 0;
}

function applyComparator(actual: number | string, comparator: Comparator, threshold: number | string): boolean {
  if (comparator === "eq") return String(actual) === String(threshold);
  const a = typeof actual === "string" ? parseFloat(actual) : actual;
  const t = typeof threshold === "string" ? parseFloat(threshold) : threshold;
  if (isNaN(a) || isNaN(t)) return false;
  if (comparator === "gt") return a > t;
  if (comparator === "gte") return a >= t;
  if (comparator === "lt") return a < t;
  if (comparator === "lte") return a <= t;
  return false;
}

async function evaluateConditionForClient(
  url: string, key: string, clientId: string, condition: AlertCondition
): Promise<{ passes: boolean; value: number }> {
  const days = periodDays(condition.period);

  if (condition.comparator === "change_pct") {
    const current = await computeClientMetric(url, key, clientId, condition.metric, days);
    const previous = await computeClientMetric(url, key, clientId, condition.metric, days * 2);
    const delta = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    const threshold = typeof condition.value === "string" ? parseFloat(condition.value) : condition.value;
    return { passes: delta < threshold, value: delta };
  }

  const value = await computeClientMetric(url, key, clientId, condition.metric, days);
  return { passes: applyComparator(value, condition.comparator, condition.value), value };
}

async function evaluateConditionForCampaign(
  campaign: any, condition: AlertCondition
): Promise<{ passes: boolean; value: number | string }> {
  let value: number | string = 0;
  if (condition.metric === "status") value = campaign.status ?? "";
  else if (condition.metric === "spend") value = campaign.spend ?? 0;
  else if (condition.metric === "ctr") value = campaign.ctr ?? 0;
  else if (condition.metric === "cpm") value = campaign.cpm ?? 0;
  else if (condition.metric === "cpa") {
    value = (campaign.conversions ?? 0) > 0 ? (campaign.spend ?? 0) / campaign.conversions : 0;
  }
  return { passes: applyComparator(value, condition.comparator, condition.value), value };
}

async function evaluateAlert(url: string, key: string, alert: StoredAlert): Promise<FiredEntity[]> {
  const { conditions, logic } = alert.rule_json;
  if (!conditions || conditions.length === 0) return [];

  if (alert.last_triggered_at && alert.cooldown_minutes > 0) {
    const lastAt = new Date(alert.last_triggered_at).getTime();
    if (Date.now() - lastAt < alert.cooldown_minutes * 60 * 1000) return [];
  }

  const entityType = conditions[0]?.entityType || "CLIENT";
  const fired: FiredEntity[] = [];

  let clientIds: string[];
  if (alert.client_id) {
    clientIds = [alert.client_id];
  } else {
    const clients = await dbGet(url, key, `clients?status=eq.active&select=id`);
    clientIds = (clients || []).map((c: any) => c.id);
  }

  if (entityType === "CLIENT") {
    for (const clientId of clientIds) {
      const results = await Promise.all(
        conditions.map(c => evaluateConditionForClient(url, key, clientId, c))
      );
      const passes = logic === "AND" ? results.every(r => r.passes) : results.some(r => r.passes);

      if (passes) {
        const [client] = await dbGet(url, key, `clients?id=eq.${clientId}&select=name&limit=1`);
        fired.push({
          entityType: "CLIENT",
          entityId: clientId,
          entityName: client?.name || clientId,
          metricValue: typeof results[0]?.value === "number" ? results[0].value : 0,
        });
      }
    }
  } else {
    for (const clientId of clientIds) {
      const campaigns = await dbGet(url, key,
        `campaigns?client_id=eq.${clientId}&select=id,name,status,spend,impressions,clicks,ctr,cpm,cpc,conversions`
      );

      for (const campaign of (campaigns || [])) {
        const results = await Promise.all(
          conditions.map(c => evaluateConditionForCampaign(campaign, c))
        );
        const passes = logic === "AND" ? results.every(r => r.passes) : results.some(r => r.passes);

        if (passes) {
          fired.push({
            entityType: "CAMPAIGN",
            entityId: campaign.id,
            entityName: campaign.name,
            metricValue: typeof results[0]?.value === "number" ? results[0].value : 0,
          });
        }
      }
    }
  }

  return fired;
}

function buildWhatsAppMessage(alert: StoredAlert, entities: FiredEntity[]): string {
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://ad-campaign-hub-one.vercel.app";

  const entityLines = entities
    .map(e => {
      const tipo = e.entityType === "CAMPAIGN" ? "📊 Campanha" : "👤 Cliente";
      return `${tipo}: *${e.entityName}* — ${e.metricValue.toFixed(2)}`;
    })
    .join("\n");

  const conditionLines = alert.rule_json.conditions
    .map(c => `• ${c.metric} ${c.comparator} ${c.value} (${c.period})`)
    .join("\n");

  return [
    `⚠️ *Alerta disparado: ${alert.name}*`,
    alert.description ? `_${alert.description}_` : "",
    "",
    `🕐 ${now}`,
    "",
    "*Entidades afetadas:*",
    entityLines,
    "",
    `*Regra (${alert.rule_json.logic}):*`,
    conditionLines,
    "",
    `🔗 ${siteUrl}/alert-events`,
  ].filter(Boolean).join("\n");
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
      },
    });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
    const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL") ?? "";
    const evolutionInstance = Deno.env.get("EVOLUTION_INSTANCE") ?? "";
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY") ?? "";
    const managerNumber = Deno.env.get("MANAGER_WHATSAPP_NUMBER") ?? "";

    if (!supabaseUrl || !svcKey) throw new Error("SUPABASE_URL / SVC_ROLE_KEY não configurados");

    const alerts: StoredAlert[] = await dbGet(
      supabaseUrl, svcKey,
      `alerts?is_active=eq.true&select=id,name,description,client_id,rule_json,channels,cooldown_minutes,last_triggered_at,is_active`
    );

    let totalFired = 0;
    const totalChecked = (alerts || []).length;
    const fired: { alertName: string; count: number }[] = [];

    for (const alert of (alerts || [])) {
      try {
        const firedEntities = await evaluateAlert(supabaseUrl, svcKey, alert);

        if (firedEntities.length === 0) continue;

        totalFired += firedEntities.length;
        const now = new Date().toISOString();

        for (const entity of firedEntities) {
          await dbInsert(supabaseUrl, svcKey, "alert_events", {
            alert_id: alert.id,
            triggered_at: now,
            metric_value: entity.metricValue,
            entity_type: entity.entityType,
            entity_id: entity.entityId,
            entity_name: entity.entityName,
            rule_snapshot: alert.rule_json,
            status: "open",
          });
        }

        await dbPatch(supabaseUrl, svcKey, `alerts?id=eq.${alert.id}`, { last_triggered_at: now });

        const channels: AlertChannels = alert.channels;

        const whatsappTarget = channels.whatsappTarget || managerNumber;
        if (channels.whatsapp && evolutionApiUrl && evolutionInstance && evolutionApiKey && whatsappTarget) {
          try {
            const message = buildWhatsAppMessage(alert, firedEntities);
            await fetch(`${evolutionApiUrl.replace(/\/$/, "")}/message/sendText/${evolutionInstance}`, {
              method: "POST",
              headers: { apikey: evolutionApiKey, "Content-Type": "application/json" },
              body: JSON.stringify({ number: whatsappTarget, text: message }),
            });
          } catch {
            // non-blocking
          }
        }

        fired.push({ alertName: alert.name, count: firedEntities.length });
      } catch {
        // individual alert failures are non-blocking
      }
    }

    return new Response(
      JSON.stringify({ success: true, checked: totalChecked, fired: totalFired, results: fired }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
