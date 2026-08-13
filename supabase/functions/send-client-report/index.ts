import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, ownsClient, isServiceRole, jsonResponse } from "../_shared/auth.ts";
import { loadWhatsappConfig, sendDocument, sendText } from "../_shared/whatsapp.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  targets?: string[];
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

const METRIC_LABEL_PLAIN: Record<MetricKey, string> = {
  spend: "Investimento",
  impressions: "Impressões",
  clicks: "Cliques",
  ctr: "CTR",
  cpc: "CPC",
  cpm: "CPM",
  cpa: "CPA",
  roas: "ROAS",
  conversions: "Conversões",
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

async function buildReportPdf(params: {
  clientName: string;
  periodLabel: string;
  metrics: { label: string; value: string }[];
  campaigns: { name: string; spend: string; ctr: string }[];
  auditScore: number | null;
  generatedAt: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = 780;
  const brand = rgb(0.07, 0.80, 0.57);
  const dark = rgb(0.15, 0.15, 0.15);
  const gray = rgb(0.45, 0.45, 0.45);

  const draw = (text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const size = opts.size ?? 11;
    const safeText = Array.from(text).filter(ch => (ch.codePointAt(0) ?? 0) <= 0xff).join("");
    page.drawText(safeText, { x: margin, y, size, font: opts.bold ? bold : font, color: opts.color ?? dark });
    y -= size + 8;
  };

  draw("Relatório de Performance", { size: 20, bold: true, color: brand });
  draw(params.clientName, { size: 14, bold: true });
  draw(params.periodLabel, { size: 10, color: gray });
  y -= 10;

  draw("Resumo do período", { size: 13, bold: true });
  for (const m of params.metrics) draw(`${m.label}: ${m.value}`, { size: 11 });

  if (params.campaigns.length > 0) {
    y -= 6;
    draw("Campanhas ativas (top 5)", { size: 13, bold: true });
    for (const c of params.campaigns) draw(`- ${c.name} - ${c.spend} | CTR ${c.ctr}`, { size: 10 });
  }

  if (params.auditScore !== null) {
    y -= 6;
    draw(`Auditoria da conta: ${params.auditScore}/100`, { size: 12, bold: true });
  }

  y -= 20;
  draw(`Gerado em ${params.generatedAt}`, { size: 9, color: gray });
  draw("Enviado por Scale Ads", { size: 9, color: gray });

  return doc.save();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { client_id, template: templateOverride, save_template, targets: targetsOverride }: RequestPayload = await req.json();

    // service_role ignora RLS: a carteira do usuario e checada aqui.
    if (!isServiceRole(req)) {
      const user = await getUser(req);
      if (!user) return jsonResponse(corsHeaders, { error: "Não autenticado" }, 401);
      if (!(await ownsClient(user.id, client_id))) {
        return jsonResponse(corsHeaders, { error: "Cliente não encontrado na sua carteira" }, 404);
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svcKey = Deno.env.get("SVC_ROLE_KEY")!;

    if (!supabaseUrl || !svcKey) {
      throw new Error("Variáveis de ambiente não configuradas");
    }

    const cfg = await loadWhatsappConfig();

    // ── 1. Buscar cliente ─────────────────────────────────────────────────────
    const [client] = await dbGet(
      supabaseUrl, svcKey,
      `clients?id=eq.${client_id}&select=id,name,whatsapp_number,whatsapp_group_jid,report_template&limit=1`
    );

    if (!client) throw new Error("Cliente não encontrado");
    const defaultTarget = client.whatsapp_group_jid || client.whatsapp_number;
    const targets = (targetsOverride && targetsOverride.length > 0) ? targetsOverride : (defaultTarget ? [defaultTarget] : []);
    if (targets.length === 0) throw new Error("Cliente sem número ou grupo de WhatsApp cadastrado");

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

    lines.push("");
    lines.push("_Enviado por Scale Ads_");

    const message = lines.join("\n");

    // ── 8. Enviar mensagem de texto pelo provedor ativo (para cada destino) ───
    let lastMessageId: string | null = null;
    const textErrors: string[] = [];
    for (const target of targets) {
      try {
        const { messageId } = await sendText(cfg, target, message);
        lastMessageId = messageId ?? lastMessageId;
      } catch (err) {
        textErrors.push(`${target}: ${(err as Error).message}`);
      }
    }
    if (textErrors.length === targets.length) throw new Error(textErrors.join("; "));

    // ── 9. Gerar e enviar o PDF do relatório (para cada destino) ───────────────
    let pdfSent = false;
    let pdfError: string | null = null;
    try {
      const pdfBytes = await buildReportPdf({
        clientName: client.name,
        periodLabel: PERIOD_LABEL[tpl.period],
        metrics: tpl.metrics.map(m => ({ label: METRIC_LABEL_PLAIN[m], value: metricValues[m] })),
        campaigns: campaigns.map(c => ({
          name: c.name,
          spend: fmtBRL(c.spend ?? 0),
          ctr: fmtPct(c.ctr ?? 0),
        })),
        auditScore: tpl.include_audit ? auditScore : null,
        generatedAt: now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      });

      const safeName = client.name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/(^-+|-+$)/g, "") || "cliente";
      const fileName = `relatorio-${safeName}.pdf`;
      const mediaBase64 = base64Encode(new Uint8Array(pdfBytes).buffer);

      for (const target of targets) {
        await sendDocument(cfg, { to: target, base64: mediaBase64, fileName });
        pdfSent = true;
      }
    } catch (err) {
      pdfError = (err as Error).message;
    }

    // ── 10. Salvar template se solicitado ──────────────────────────────────────
    if (save_template) {
      await dbPatch(supabaseUrl, svcKey, `clients?id=eq.${client_id}`, { report_template: tpl });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_id: lastMessageId,
        preview: message,
        pdf_sent: pdfSent,
        pdf_error: pdfError,
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
