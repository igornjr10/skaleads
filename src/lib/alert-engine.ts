import { supabase } from "@/integrations/supabase/client";
import { subDays, format } from "date-fns";

// ── DSL types ─────────────────────────────────────────────────────────────────

export type MetricKey = "spend" | "cpa" | "ctr" | "cpm" | "frequency" | "roas" | "status" | "budget";
export type Comparator = "gt" | "gte" | "lt" | "lte" | "eq" | "change_pct";
export type Period = "1d" | "3d" | "7d" | "14d" | "30d";
export type EntityType = "CLIENT" | "CAMPAIGN";

export interface AlertCondition {
  metric: MetricKey;
  comparator: Comparator;
  value: number | string;
  period: Period;
  entityType: EntityType;
}

export interface AlertRule {
  conditions: AlertCondition[];
  logic: "AND" | "OR";
}

export interface AlertChannels {
  dashboard: boolean;
  email: boolean;
  emailRecipients: string[];
  whatsapp: boolean;
  whatsappTarget?: string;
}

export interface StoredAlert {
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

export interface EvaluationResult {
  alertId: string;
  alertName: string;
  fired: boolean;
  entities: FiredEntity[];
}

export interface FiredEntity {
  entityType: EntityType;
  entityId: string;
  entityName: string;
  metricValue: number;
  conditionIndex: number;
}

// ── Metric computation ────────────────────────────────────────────────────────

function periodDays(p: Period): number {
  return parseInt(p);
}

async function getClientDailyTotals(clientId: string, days: number) {
  const since = format(subDays(new Date(), days), "yyyy-MM-dd");
  const { data } = await supabase
    .from("campaign_daily_metrics")
    .select("spend, clicks, impressions")
    .eq("client_id", clientId)
    .gte("date", since);

  return (data || []).reduce(
    (acc: { spend: number; clicks: number; impressions: number }, r: any) => ({
      spend: acc.spend + (r.spend || 0),
      clicks: acc.clicks + (r.clicks || 0),
      impressions: acc.impressions + (r.impressions || 0),
    }),
    { spend: 0, clicks: 0, impressions: 0 }
  );
}

async function getClientMonthToDateSpend(clientId: string): Promise<number> {
  const now = new Date();
  const firstOfMonth = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
  const { data } = await supabase
    .from("campaign_daily_metrics")
    .select("spend")
    .eq("client_id", clientId)
    .gte("date", firstOfMonth);
  return (data || []).reduce((s: number, r: any) => s + (r.spend || 0), 0);
}

async function computeClientMetric(
  clientId: string,
  metric: MetricKey,
  days: number
): Promise<number> {
  if (metric === "status") return 0;

  // Percentual da verba mensal ja consumido no mes atual (ignora `days` — sempre o mes corrente)
  if (metric === "budget") {
    const { data: client } = await supabase
      .from("clients")
      .select("monthly_budget")
      .eq("id", clientId)
      .single();
    const budget = client?.monthly_budget || 0;
    if (!budget) return 0;
    const spent = await getClientMonthToDateSpend(clientId);
    return (spent / budget) * 100;
  }

  if (metric === "frequency") {
    const since = format(subDays(new Date(), days), "yyyy-MM-dd");
    // Get all ads for this client via join
    const { data } = await supabase
      .from("ad_daily_metrics")
      .select("frequency, ad_id, ads!inner(ad_set_id, ad_sets!inner(campaign_id, campaigns!inner(client_id)))")
      .eq("ads.ad_sets.campaigns.client_id", clientId)
      .gte("date", since);

    const rows = (data || []) as any[];
    if (rows.length === 0) return 0;
    return rows.reduce((s: number, r: any) => s + (r.frequency || 0), 0) / rows.length;
  }

  const totals = await getClientDailyTotals(clientId, days);

  if (metric === "spend") return totals.spend;
  if (metric === "ctr") return totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  if (metric === "cpm") return totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;

  if (metric === "cpa" || metric === "roas") {
    const { data } = await supabase
      .from("campaigns")
      .select("spend, conversions")
      .eq("client_id", clientId);
    const rows = (data || []) as any[];
    const totalSpend = rows.reduce((s: number, r: any) => s + (r.spend || 0), 0);
    const totalConversions = rows.reduce((s: number, r: any) => s + (r.conversions || 0), 0);
    if (metric === "cpa") return totalConversions > 0 ? totalSpend / totalConversions : 0;
    // roas requires revenue data which we don't track yet; approximate as 0 when no data
    return 0;
  }

  return 0;
}

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  conversions: number;
  client_id: string;
}

async function getCampaignMetric(campaign: CampaignRow, metric: MetricKey): Promise<number | string> {
  if (metric === "status") return campaign.status;
  if (metric === "spend") return campaign.spend;
  if (metric === "ctr") return campaign.ctr;
  if (metric === "cpm") return campaign.cpm;
  if (metric === "cpa") return campaign.conversions > 0 ? campaign.spend / campaign.conversions : 0;
  if (metric === "roas") return 0;
  if (metric === "frequency") return 0;
  return 0;
}

// ── Condition evaluation ──────────────────────────────────────────────────────

function applyComparator(actual: number | string, comparator: Comparator, threshold: number | string): boolean {
  if (comparator === "eq") return String(actual) === String(threshold);
  const a = typeof actual === "string" ? parseFloat(actual) : actual;
  const t = typeof threshold === "string" ? parseFloat(threshold) : threshold;
  if (isNaN(a) || isNaN(t)) return false;
  switch (comparator) {
    case "gt": return a > t;
    case "gte": return a >= t;
    case "lt": return a < t;
    case "lte": return a <= t;
    default: return false;
  }
}

async function evaluateConditionForClient(
  clientId: string,
  condition: AlertCondition
): Promise<{ passes: boolean; value: number }> {
  const days = periodDays(condition.period);

  if (condition.comparator === "change_pct") {
    const current = await computeClientMetric(clientId, condition.metric, days);
    const previous = await computeClientMetric(clientId, condition.metric, days * 2);
    const delta = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    const threshold = typeof condition.value === "string" ? parseFloat(condition.value) : condition.value;
    // For change_pct, we check if delta is above threshold (positive → increase, negative → decrease)
    const passes = delta < threshold; // e.g. threshold -25 → delta < -25 means dropped 25%+
    return { passes, value: delta };
  }

  const value = await computeClientMetric(clientId, condition.metric, days);
  return {
    passes: applyComparator(value, condition.comparator, condition.value),
    value,
  };
}

async function evaluateConditionForCampaign(
  campaign: CampaignRow,
  condition: AlertCondition
): Promise<{ passes: boolean; value: number | string }> {
  const value = await getCampaignMetric(campaign, condition.metric);
  return {
    passes: applyComparator(value, condition.comparator, condition.value),
    value,
  };
}

// ── Main engine ───────────────────────────────────────────────────────────────

async function getClientIds(alert: StoredAlert): Promise<string[]> {
  if (alert.client_id) return [alert.client_id];
  const { data } = await supabase.from("clients").select("id").eq("status", "active");
  return (data || []).map((c: any) => c.id);
}

export async function evaluateAlert(alert: StoredAlert): Promise<FiredEntity[]> {
  const { conditions, logic } = alert.rule_json;
  if (conditions.length === 0) return [];

  // Check cooldown
  if (alert.last_triggered_at && alert.cooldown_minutes > 0) {
    const lastAt = new Date(alert.last_triggered_at).getTime();
    const cooldownMs = alert.cooldown_minutes * 60 * 1000;
    if (Date.now() - lastAt < cooldownMs) return [];
  }

  const entityType = conditions[0]?.entityType || "CLIENT";
  const fired: FiredEntity[] = [];
  const clientIds = await getClientIds(alert);

  if (entityType === "CLIENT") {
    for (const clientId of clientIds) {
      const results = await Promise.all(
        conditions.map(c => evaluateConditionForClient(clientId, c))
      );
      const passes = logic === "AND"
        ? results.every(r => r.passes)
        : results.some(r => r.passes);

      if (passes) {
        const { data: client } = await supabase.from("clients").select("name").eq("id", clientId).single();
        fired.push({
          entityType: "CLIENT",
          entityId: clientId,
          entityName: client?.name || clientId,
          metricValue: typeof results[0]?.value === "number" ? results[0].value : 0,
          conditionIndex: 0,
        });
      }
    }
  } else {
    // CAMPAIGN level
    for (const clientId of clientIds) {
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id, name, status, spend, impressions, clicks, ctr, cpm, cpc, conversions, client_id")
        .eq("client_id", clientId);

      for (const campaign of (campaigns || []) as CampaignRow[]) {
        const results = await Promise.all(
          conditions.map(c => evaluateConditionForCampaign(campaign, c))
        );
        const passes = logic === "AND"
          ? results.every(r => r.passes)
          : results.some(r => r.passes);

        if (passes) {
          fired.push({
            entityType: "CAMPAIGN",
            entityId: campaign.id,
            entityName: campaign.name,
            metricValue: typeof results[0]?.value === "number" ? results[0].value : 0,
            conditionIndex: 0,
          });
        }
      }
    }
  }

  return fired;
}

export async function runAllAlerts(
  specificClientId?: string,
  onProgress?: (msg: string) => void
): Promise<{ fired: number; checked: number }> {
  const { data: alerts } = await supabase
    .from("alerts")
    .select("id, name, description, client_id, rule_json, channels, cooldown_minutes, last_triggered_at, is_active")
    .eq("is_active", true);

  const activeAlerts = (alerts || []).filter((a: any) =>
    !specificClientId || !a.client_id || a.client_id === specificClientId
  ) as StoredAlert[];

  let fired = 0;

  for (const alert of activeAlerts) {
    onProgress?.(`Verificando: ${alert.name}...`);
    try {
      const firedEntities = await evaluateAlert(alert);

      if (firedEntities.length > 0) {
        fired += firedEntities.length;
        const now = new Date().toISOString();

        // Create alert events
        for (const entity of firedEntities) {
          await supabase.from("alert_events").insert({
            alert_id: alert.id,
            triggered_at: now,
            metric_value: entity.metricValue,
            entity_type: entity.entityType,
            entity_id: entity.entityId,
            entity_name: entity.entityName,
            rule_snapshot: alert.rule_json as any,
            status: "open",
          });
        }

        // Update last_triggered_at
        await supabase.from("alerts").update({ last_triggered_at: now }).eq("id", alert.id);

        const channels = alert.channels as AlertChannels;

        // Dashboard notification
        if (channels.dashboard) {
          const { data: session } = await supabase.auth.getSession();
          const userId = session.session?.user.id;
          if (userId) {
            const entityList = firedEntities.map(e => e.entityName).join(", ");
            await supabase.from("notifications").insert({
              user_id: userId,
              type: "alert",
              title: `⚠️ ${alert.name}`,
              body: `Condição disparada para: ${entityList}`,
            });
          }
        }

        // Email notification
        if (channels.email && channels.emailRecipients?.length > 0) {
          try {
            await supabase.functions.invoke("send-alert-email", {
              body: {
                alertName: alert.name,
                alertDescription: alert.description,
                entities: firedEntities,
                ruleSnapshot: alert.rule_json,
                recipients: channels.emailRecipients,
              },
            });
          } catch {
            // Email failures are non-blocking
          }
        }

        // WhatsApp notification
        if (channels.whatsapp) {
          try {
            await supabase.functions.invoke("send-whatsapp-alert", {
              body: {
                alertName: alert.name,
                alertDescription: alert.description,
                entities: firedEntities,
                ruleSnapshot: alert.rule_json,
                target: channels.whatsappTarget || null,
              },
            });
          } catch {
            // WhatsApp failures are non-blocking
          }
        }
      }
    } catch {
      // Individual alert failures are non-blocking
    }
  }

  return { fired, checked: activeAlerts.length };
}

// ── Test evaluation (doesn't persist) ────────────────────────────────────────
export async function testAlert(rule: AlertRule, clientId?: string): Promise<FiredEntity[]> {
  const fakeAlert: StoredAlert = {
    id: "test",
    name: "test",
    description: null,
    client_id: clientId || null,
    rule_json: rule,
    channels: { dashboard: false, email: false, emailRecipients: [] },
    cooldown_minutes: 0,
    last_triggered_at: null,
    is_active: true,
  };
  return evaluateAlert(fakeAlert);
}

// ── Human-readable rule description ──────────────────────────────────────────
const METRIC_LABELS: Record<MetricKey, string> = {
  spend: "Investimento",
  cpa: "CPA",
  ctr: "CTR",
  cpm: "CPM",
  frequency: "Frequência",
  roas: "ROAS",
  status: "Status",
  budget: "Verba mensal consumida",
};

const COMPARATOR_LABELS: Record<Comparator, string> = {
  gt: "maior que",
  gte: "maior ou igual a",
  lt: "menor que",
  lte: "menor ou igual a",
  eq: "igual a",
  change_pct: "variação de",
};

const PERIOD_LABELS: Record<Period, string> = {
  "1d": "1 dia",
  "3d": "3 dias",
  "7d": "7 dias",
  "14d": "14 dias",
  "30d": "30 dias",
};

export function ruleToHuman(rule: AlertRule): string {
  if (!rule?.conditions?.length) return "Sem condições";
  return rule.conditions
    .map(c => {
      const suffix = c.comparator === "change_pct" || c.metric === "budget" ? "%" : "";
      const period = c.metric === "budget" ? "mês atual" : (PERIOD_LABELS[c.period] || c.period);
      return `${METRIC_LABELS[c.metric]} ${COMPARATOR_LABELS[c.comparator]} ${c.value}${suffix} (${period})`;
    })
    .join(` ${rule.logic} `);
}
