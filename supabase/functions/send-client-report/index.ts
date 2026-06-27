import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DATAFY_BASE_URL = "https://cloud.datafyapi.com.br";

type Period = "1d" | "7d" | "14d" | "30d";
type MetricKey = "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "cpm" | "cpa" | "roas" | "conversions";

interface ReportTemplate {
  period: Period;
  metrics: MetricKey[];
  include_campaigns: boolean;
  include_audit: boolean;
  intro: string;
}

interface RequestPayload {
  client_id: string;
  template?: Partial<ReportTemplate>;
  save_template?: boolean;
}

const PERIOD_DAYS: Record<Period, number> = { "1d": 1, "7d": 7, "14d": 14, "30d": 30 };
const PERIOD_LABEL: Record<Period, string> = {
  "1d": "hoje",
  "7d": "últimos 7 dias",
  "14d": "últimos 14 dias",
  "30d": "últimos 30 dias",
};

const METRIC_LABEL: Record<MetricKey, string> = {
  spend: "💰 Investimento",
  impressions: "👁️ Impressões",
  clicks: "🖱️ Cliques",
  ctr: "📈 CTR",
  cpc: "💵 CPC",
  cpm: "📊 CPM",
  cpa: "🎯 CPA",
  roas: "📉 ROAS",
  conversions: "✅ Conversões",
};

function fmtBRL(v: number) {
  return `R$ ${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}
function fmtPct(v: number) { return `${v.toFixed(2).replace(".", ",")}%`; }
function fmtNum(v: number) {
  return v.toLocaleString("pt-BR");
}

function dbGet(supabaseUrl: string, svcKey: string, path: string) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      "Content-Type": "application/json",
    },
  }).then(r => r.json());
}

function dbPatch(supabaseUrl: string, svcKey: string, path: string, body: object) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { client_id, template: templateOverride, save_template }: RequestPayload = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
    const datafyKey = Deno.env.get("DATAFY_API_KEY")!;

    if (!supabaseUrl || !svcKey || !datafyKey) {
      throw new Error("Variáveis de ambiente não configuradas");
    }

    // ── 1. Buscar cliente ─────────────────────────────────────────────────────
    const [client] = await dbGet(
      supabaseUrl, svcKey,
      `clients?id=eq.${client_id}&select=id,name,whatsapp_number,report_template&limit=1`
    );

    if (!client) throw new Error("Cliente não encontrado");
    if (!client.whatsapp_number) throw new Error("Cliente sem número de WhatsApp cadastrado");

    const savedTemplate: ReportTemplate = client.report_template ?? {};
    const tpl: ReportTemplate = {
      period: templateOverride?.period ?? savedTemplate.period ?? "7d",
      metrics: templateOverride?.metrics ?? savedTemplate.metrics ?? ["spend", "impressions", "clicks", "ctr", "cpc"],
      include_campaigns: templateOverride?.include_campaigns ?? savedTemplate.include_campaigns ?? true,
      include_audit: templateOverride?.include_audit ?? savedTemplate.include_audit ?? false,
      intro: templateOverride?.intro ?? savedTemplate.intro ?? "",
    };

    // ── 2. Período de datas ───────────────────────────────────────────────────
    const now = new Date();
    const days = PERIOD_DAYS[tpl.period];
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - days + 1);
    const fromStr = dateFrom.toISOString().split("T")[0];
    const toStr = now.toISOString().split("T")[0];

    // ── 3. Buscar métricas diárias do período ─────────────────────────────────
    const dailyMetrics: { spend: number; impressions: number; clicks: number }[] = await dbGet(
      supabaseUrl, svcKey,
      `campaign_daily_metrics?client_id=eq.${client_id}&date=gte.${fromStr}&date=lte.${toStr}&select=spend,impressions,clicks`
    );

    const totals = dailyMetrics.reduce(
      (acc, row) => ({
        spend: acc.spend + (row.spend ?? 0),
        impressions: acc.impressions + (row.impressions ?? 0),
        clicks: acc.clicks + (row.clicks ?? 0),
      }),
      { spend: 0, impressions: 0, clicks: 0 }
    );

    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
    const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;

    // ── 4. Buscar campanhas ativas ─────────────────────────────────────────────
    let campaigns: { name: string; status: string; spend: number; clicks: number; impressions: number; ctr: number; cpc: number; conversions: number }[] = [];
    if (tpl.include_campaigns) {
      campaigns = await dbGet(
        supabaseUrl, svcKey,
        `campaigns?client_id=eq.${client_id}&status=eq.ACTIVE&select=name,status,spend,clicks,impressions,ctr,cpc,conversions&order=spend.desc&limit=5`
      );
    }

    // ── 5. Buscar última auditoria ─────────────────────────────────────────────
    let auditScore: number | null = null;
    if (tpl.include_audit) {
      const [audit] = await dbGet(
        supabaseUrl, svcKey,
        `audit_runs?client_id=eq.${client_id}&select=score,created_at&order=created_at.desc&limit=1`
      );
      if (audit) auditScore = audit.score;
    }

    // ── 6. Calcular conversões e CPA/ROAS agregados ───────────────────────────
    const totalConversions = campaigns.reduce((s, c) => s + (c.conversions ?? 0), 0);
    const cpa = totalConversions > 0 ? totals.spend / totalConversions : 0;
    const roas = totals.spend > 0 ? (totalConversions * 50) / totals.spend : 0; // estimativa sem receita real

    const metricValues: Record<MetricKey, string> = {
      spend: fmtBRL(totals.spend),
      impressions: fmtNum(totals.impressions),
      clicks: fmtNum(totals.clicks),
      ctr: fmtPct(ctr),
      cpc: fmtBRL(cpc),
      cpm: fmtBRL(cpm),
      cpa: cpa > 0 ? fmtBRL(cpa) : "—",
      roas: roas > 0 ? `${roas.toFixed(2)}x` : "—",
      conversions: fmtNum(totalConversions),
    };

    // ── 7. Montar mensagem ────────────────────────────────────────────────────
    const lines: string[] = [];

    lines.push(`📊 *Relatório de Performance*`);
    lines.push(`👤 *${client.name}*`);
    lines.push(`📅 _Período: ${PERIOD_LABEL[tpl.period]}_`);

    if (tpl.intro?.trim()) {
      lines.push("");
      lines.push(tpl.intro.trim());
    }

    lines.push("");
    lines.push("*📈 Resumo do período:*");
    for (const metric of tpl.metrics) {
      lines.push(`${METRIC_LABEL[metric]}: *${metricValues[metric]}*`);
    }

    if (tpl.include_campaigns && campaigns.length > 0) {
      lines.push("");
      lines.push("*🏃 Campanhas ativas (top 5):*");
      for (const c of campaigns) {
        const campSpend = fmtBRL(c.spend ?? 0);
        const campCtr = fmtPct(c.ctr ?? 0);
        lines.push(`• ${c.name} — ${campSpend} | CTR ${campCtr}`);
      }
    }

    if (tpl.include_audit && auditScore !== null) {
      const emoji = auditScore >= 80 ? "🟢" : auditScore >= 60 ? "🟡" : "🔴";
      lines.push("");
      lines.push(`*🔍 Auditoria da conta:* ${emoji} ${auditScore}/100`);
    }

    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://ad-campaign-hub-one.vercel.app";
    lines.push("");
    lines.push(`🔗 ${siteUrl}/clients/${client_id}/reports`);
    lines.push("_Enviado por MarketProAds_");

    const message = lines.join("\n");

    // ── 8. Enviar via Datafy ──────────────────────────────────────────────────
    const response = await fetch(`${DATAFY_BASE_URL}/messages/send/text`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${datafyKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: client.whatsapp_number, text: message }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.message || result.error || "Datafy API error");

    // ── 9. Salvar template se solicitado ──────────────────────────────────────
    if (save_template) {
      await dbPatch(supabaseUrl, svcKey, `clients?id=eq.${client_id}`, { report_template: tpl });
    }

    return new Response(
      JSON.stringify({ success: true, message_id: result.messages?.[0]?.id, preview: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
