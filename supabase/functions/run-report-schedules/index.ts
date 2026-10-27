import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, remetente, sendText } from "../_shared/whatsapp.ts";
import { guard, jsonResponse } from "../_shared/auth.ts";
import { momentoEmSaoPaulo, periodoPadraoDaFrequencia, venceNestaHora } from "./agendamento.ts";
import { hojeEmSaoPaulo, normalizarPeriodo, periodoDoModelo, resolverPeriodo, type PeriodoSpec } from "./periodo.ts";
import {
  METRICAS,
  linhasDeMetricas,
  metricasDoModelo,
  normalizarMetricas,
  type MetricaRelatorio,
} from "./metricas.ts";

// Dois modos por agendamento:
// - 'atualizado' (padrao dos novos): monta o relatorio com os dados do periodo
//   no momento do envio, grava em `reports` (historico com schedule_id) e manda
//   no WhatsApp o resumo com as metricas escolhidas + o link do relatorio, onde
//   o cliente tambem baixa o PDF. O PDF rico e montado no navegador
//   (ReportPdfTemplate), por isso o servidor manda link e nao anexo.
// - 'ultimo_pdf' (linhas antigas, modo null): reenvia o ultimo PDF gerado a mao.

interface ReportSchedule {
  id: string;
  tenant_id: string;
  client_id: string;
  cron: string;
  last_run_at: string | null;
  is_active: boolean;
  modo?: string | null;
  periodo?: unknown;
  metricas?: unknown;
  mensagem?: string | null;
  nome?: string | null;
  /** Quem criou o agendamento: o relatorio sai do WhatsApp dele. Sem criador, do numero padrao. */
  created_by?: string | null;
}

interface Cliente {
  id: string;
  name: string;
  logo_url: string | null;
  meta_ad_account_id: string | null;
  report_template: unknown;
  company_id: string | null;
  whatsapp_number: string | null;
  whatsapp_group_jid: string | null;
}

interface Resultado {
  scheduleId: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

const METRICAS_AUTOMATICAS_PADRAO: MetricaRelatorio[] = ["spend", "impressions", "clicks", "ctr", "results", "costPerResult"];

function env() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
  if (!supabaseUrl || !svcKey) throw new Error("SUPABASE_URL / SVC_ROLE_KEY não configurados");
  return { supabaseUrl, svcKey };
}

function headers(svcKey: string, extra: Record<string, string> = {}) {
  return { apikey: svcKey, Authorization: `Bearer ${svcKey}`, "Content-Type": "application/json", ...extra };
}

async function dbGet<T = unknown>(path: string): Promise<T> {
  const { supabaseUrl, svcKey } = env();
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: headers(svcKey) });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Erro ao ler ${path.split("?")[0]}: ${body?.message ?? res.status}`);
  return body as T;
}

async function dbPatch(path: string, body: object) {
  const { supabaseUrl, svcKey } = env();
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: "PATCH",
    headers: headers(svcKey, { Prefer: "return=minimal" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Erro ao atualizar ${path.split("?")[0]}: ${await res.text()}`);
}

async function dbInsert<T = unknown>(table: string, body: object): Promise<T> {
  const { supabaseUrl, svcKey } = env();
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: headers(svcKey, { Prefer: "return=representation" }),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Erro ao gravar em ${table}: ${json?.message ?? res.status}`);
  return (Array.isArray(json) ? json[0] : json) as T;
}

function siteUrl() {
  return (Deno.env.get("PUBLIC_SITE_URL") || "https://ad-campaign-hub-one.vercel.app").replace(/\/$/, "");
}

/** Falha tambem entra no historico, para o gestor ver na tela por que nao foi. */
async function registrarFalha(s: ReportSchedule, nome: string, periodo: object, erro: string) {
  await dbInsert("reports", {
    tenant_id: s.tenant_id,
    client_id: s.client_id,
    name: nome,
    period: periodo,
    status: "error",
    schedule_id: s.id,
    erro_envio: erro.slice(0, 500),
  }).catch((e) => console.error("Falha ao registrar erro no historico:", e));
}

async function enviarUltimoPdf(s: ReportSchedule): Promise<Resultado> {
  const [report] = await dbGet<Array<{ id: string; name: string; period: { label?: string } | null; data: unknown; pdf_base64: string }>>(
    `reports?client_id=eq.${s.client_id}&status=eq.ready&pdf_base64=not.is.null&select=id,name,period,data,pdf_base64&order=created_at.desc&limit=1`
  );

  if (!report) {
    await registrarFalha(s, "Reenvio do último relatório", {}, "Nenhum relatório pronto gerado ainda para reenviar");
    return { scheduleId: s.id, ok: false, skipped: true, error: "Nenhum relatório pronto gerado ainda" };
  }

  const [client] = await dbGet<Array<{ name: string }>>(`clients?id=eq.${s.client_id}&select=name`);
  const periodLabel = report.period?.label ?? "";
  const caption = `📊 *Relatório de Performance*\n👤 *${client?.name ?? ""}*\n📅 _${periodLabel}_`;

  const { supabaseUrl, svcKey } = env();
  const response = await fetch(`${supabaseUrl}/functions/v1/send-report-whatsapp`, {
    method: "POST",
    headers: headers(svcKey),
    body: JSON.stringify({
      client_id: s.client_id,
      file_name: `${report.name}.pdf`,
      media_base64: report.pdf_base64,
      caption,
      remetente_id: s.created_by ?? null,
      ...(s.mensagem?.trim() ? { text: s.mensagem.trim() } : {}),
    }),
  });
  const result = await response.json().catch(() => ({}));
  const erro = !response.ok || result.error ? String(result.error ?? "Erro desconhecido") : null;

  // Historico: copia os dados (sem o PDF, que ja esta na linha original).
  await dbInsert("reports", {
    tenant_id: s.tenant_id,
    client_id: s.client_id,
    name: report.name,
    period: report.period ?? {},
    data: report.data ?? {},
    status: erro ? "error" : "ready",
    schedule_id: s.id,
    sent_at: erro ? null : new Date().toISOString(),
    erro_envio: erro,
    share_token: erro ? null : crypto.randomUUID(),
  }).catch((e) => console.error("Falha ao registrar historico:", e));

  return erro ? { scheduleId: s.id, ok: false, error: erro } : { scheduleId: s.id, ok: true };
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

async function enviarAtualizado(s: ReportSchedule, hoje: string): Promise<Resultado> {
  const [cliente] = await dbGet<Cliente[]>(
    `clients?id=eq.${s.client_id}&select=id,name,logo_url,meta_ad_account_id,report_template,company_id,whatsapp_number,whatsapp_group_jid&limit=1`
  );
  if (!cliente) throw new Error("Cliente não encontrado");

  const spec: PeriodoSpec =
    normalizarPeriodo(s.periodo) ?? periodoDoModelo(cliente.report_template) ?? periodoPadraoDaFrequencia(s.cron);
  const periodo = resolverPeriodo(spec, hoje);
  const nome = `${cliente.name} - ${periodo.label}`;

  const escolhidas = normalizarMetricas(s.metricas);
  const base = escolhidas.length ? escolhidas : metricasDoModelo(cliente.report_template) ?? METRICAS_AUTOMATICAS_PADRAO;
  // Alcance, frequencia e vendas so existem na consulta ao vivo da Meta; aqui
  // sairiam zerados e diriam ao cliente que nao houve resultado.
  const doBanco = new Set(METRICAS.filter((m) => m.noBanco).map((m) => m.key));
  const metricas = base.filter((k) => doBanco.has(k));
  const metricasFinais = metricas.length ? metricas : METRICAS_AUTOMATICAS_PADRAO;

  const destino = cliente.whatsapp_group_jid || cliente.whatsapp_number;
  if (!destino) {
    const erro = "Cliente sem número ou grupo de WhatsApp cadastrado";
    await registrarFalha(s, nome, periodo, erro);
    return { scheduleId: s.id, ok: false, error: erro };
  }

  const diarias = await dbGet<Array<Record<string, unknown>>>(
    `campaign_daily_metrics?client_id=eq.${s.client_id}&date=gte.${periodo.start}&date=lte.${periodo.end}` +
      `&select=spend,impressions,clicks,messages,calls,directions,leads,profile_visits`
  );
  if (!Array.isArray(diarias) || diarias.length === 0) {
    // Dia sem linha nao e dia com zero: mandar R$ 0,00 afirma que nao houve
    // investimento quando quem parou foi o sync.
    const erro = "Sem métricas sincronizadas no período. Sincronize a conta do cliente.";
    await registrarFalha(s, nome, periodo, erro);
    return { scheduleId: s.id, ok: false, error: erro };
  }

  const t = diarias.reduce<Record<string, number>>(
    (acc, l) => {
      for (const k of Object.keys(acc)) acc[k] += n(l[k]);
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, messages: 0, calls: 0, directions: 0, leads: 0, profile_visits: 0 }
  );

  const summary = {
    spend: t.spend,
    impressions: t.impressions,
    clicks: t.clicks,
    ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
    cpc: t.clicks > 0 ? t.spend / t.clicks : 0,
    cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0,
    messagesStarted: t.messages,
    phoneCalls: t.calls,
    directions: t.directions,
    leads: t.leads,
    instagramProfileVisits: t.profile_visits,
    revenue: 0,
    roas: 0,
    conversions: 0,
  };

  const [campanhas, anuncios, empresas] = await Promise.all([
    dbGet<Array<Record<string, unknown>>>(
      `campaigns?client_id=eq.${s.client_id}&select=name,status,spend,impressions,clicks,ctr,conversions&order=spend.desc.nullslast&limit=5`
    ).catch(() => []),
    dbGet<Array<Record<string, unknown>>>(
      `ads?select=name,status,spend,impressions,clicks,thumbnail_url,image_url,creative_type,ad_sets!inner(campaigns!inner(client_id))` +
        `&ad_sets.campaigns.client_id=eq.${s.client_id}&impressions=gt.0&order=spend.desc.nullslast&limit=60`
    ).catch(() => []),
    cliente.company_id
      ? dbGet<Array<{ name: string; nome_exibicao: string | null; cor_primaria: string | null }>>(
          `companies?id=eq.${cliente.company_id}&select=name,nome_exibicao,cor_primaria&limit=1`
        ).catch(() => [])
      : Promise.resolve([]),
  ]);
  const empresa = empresas[0];

  const topAds = anuncios
    .map((ad) => {
      const impressions = n(ad.impressions);
      const clicks = n(ad.clicks);
      const spend = n(ad.spend);
      return {
        name: (ad.name as string) ?? "(sem nome)",
        status: (ad.status as string) ?? "",
        spend,
        impressions,
        clicks,
        previewUrl: (ad.thumbnail_url as string) || (ad.image_url as string) || null,
        creativeType: (ad.creative_type as string) ?? "image",
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      };
    })
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, 6);

  const agora = new Date();
  const data = {
    generatedAt: agora.toISOString(),
    client: {
      name: cliente.name,
      logoUrl: cliente.logo_url,
      adAccountLabel: cliente.meta_ad_account_id ? `CA - ${cliente.meta_ad_account_id}` : undefined,
    },
    period: periodo,
    summary,
    topCampaigns: campanhas.map((c) => ({
      name: (c.name as string) ?? "",
      status: (c.status as string) ?? "",
      spend: n(c.spend),
      impressions: n(c.impressions),
      clicks: n(c.clicks),
      ctr: n(c.ctr),
      revenue: 0,
      roas: 0,
      conversions: n(c.conversions),
    })),
    topAds,
    metricPreferences: metricasFinais,
    branding: {
      primaryColor: empresa?.cor_primaria || "#2563eb",
      agencyName: empresa?.nome_exibicao?.trim() || empresa?.name || "Midsam Business",
    },
    ...(s.mensagem?.trim() ? { analysis: { notes: s.mensagem.trim() } } : {}),
  };

  const shareToken = crypto.randomUUID();
  const linha = await dbInsert<{ id: string }>("reports", {
    tenant_id: s.tenant_id,
    client_id: s.client_id,
    name: nome,
    period: periodo,
    data,
    status: "generating",
    schedule_id: s.id,
    share_token: shareToken,
  });

  const linhas = linhasDeMetricas(summary, metricasFinais).map((l) => `• ${l.label}: *${l.valor}*`);
  const texto = [
    "📊 *Relatório de Performance*",
    `👤 *${cliente.name}*`,
    `📅 _${periodo.label}_`,
    ...(s.mensagem?.trim() ? ["", s.mensagem.trim()] : []),
    "",
    ...linhas,
    "",
    `🔗 Relatório completo (com PDF para baixar): ${siteUrl()}/share/reports/${shareToken}`,
  ].join("\n");

  try {
    const inst = await remetente({ userId: s.created_by ?? null, companyId: cliente.company_id, destino });
    await sendText(inst, destino, texto);
  } catch (err) {
    const erro = (err as Error).message || "Falha no envio pelo WhatsApp";
    await dbPatch(`reports?id=eq.${linha.id}`, { status: "error", erro_envio: erro.slice(0, 500) }).catch(() => {});
    return { scheduleId: s.id, ok: false, error: erro };
  }

  await dbPatch(`reports?id=eq.${linha.id}`, { status: "ready", sent_at: new Date().toISOString() });
  return { scheduleId: s.id, ok: true };
}

function processar(s: ReportSchedule, hoje: string) {
  return s.modo === "atualizado" ? enviarAtualizado(s, hoje) : enviarUltimoPdf(s);
}

// Colunas novas podem nao existir ainda (migration 20261012150000 pendente):
// cai para a selecao antiga e tudo segue no modo de reenvio do ultimo PDF.
async function lerAgendamentos(filtro: string): Promise<ReportSchedule[]> {
  const novas = "id,tenant_id,client_id,cron,last_run_at,is_active,modo,periodo,metricas,mensagem,nome,created_by";
  try {
    return await dbGet<ReportSchedule[]>(`report_schedules?${filtro}&select=${novas}`);
  } catch {
    return await dbGet<ReportSchedule[]>(`report_schedules?${filtro}&select=id,tenant_id,client_id,cron,last_run_at,is_active`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await req.json().catch(() => ({})) as { schedule_id?: string };

  // "Enviar agora" da tela de agendamentos: usuario logado, dono do cliente.
  if (body.schedule_id) {
    try {
      const [s] = await lerAgendamentos(`id=eq.${encodeURIComponent(body.schedule_id)}&limit=1`);
      if (!s) return jsonResponse(corsHeaders, { error: "Agendamento não encontrado" }, 404);
      const acesso = await guard(req, corsHeaders, { clientId: s.client_id });
      if (!acesso.ok) return acesso.response;
      const r = await processar(s, hojeEmSaoPaulo());
      return jsonResponse(corsHeaders, r.ok ? { success: true } : { error: r.error ?? "Falha no envio" }, r.ok ? 200 : 422);
    } catch (err) {
      return jsonResponse(corsHeaders, { error: (err as Error).message }, 500);
    }
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return jsonResponse(corsHeaders, { error: "Unauthorized" }, 401);
  }

  const startedAt = new Date().toISOString();
  let runSuccess = true;
  let runSummary: Record<string, unknown> = {};
  let runError: string | null = null;

  try {
    const agora = new Date();
    const momento = momentoEmSaoPaulo(agora);
    const hoje = hojeEmSaoPaulo(agora);
    const schedules = await lerAgendamentos("is_active=eq.true");

    let sentCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const results: Resultado[] = [];

    for (const schedule of schedules) {
      try {
        if (schedule.last_run_at && hojeEmSaoPaulo(new Date(schedule.last_run_at)) === hoje) continue;
        if (!venceNestaHora(schedule.cron, momento)) continue;

        // Marca antes de enviar: se o envio demorar e o job rodar de novo, o
        // cliente nao recebe duas vezes no mesmo dia.
        await dbPatch(`report_schedules?id=eq.${schedule.id}`, { last_run_at: new Date().toISOString() });
        const r = await processar(schedule, hoje);
        results.push(r);
        if (r.ok) sentCount++;
        else if (r.skipped) skippedCount++;
        else errorCount++;
      } catch (err) {
        errorCount++;
        results.push({ scheduleId: schedule.id, ok: false, error: (err as Error).message });
      }
    }

    runSummary = { checked: schedules.length, sent: sentCount, failed: errorCount, skipped: skippedCount };
    return jsonResponse(corsHeaders, { success: true, ...runSummary, results });
  } catch (err) {
    runSuccess = false;
    runError = (err as Error).message;
    return jsonResponse(corsHeaders, { error: runError }, 500);
  } finally {
    const { supabaseUrl, svcKey } = (() => {
      try {
        return env();
      } catch {
        return { supabaseUrl: "", svcKey: "" };
      }
    })();
    if (supabaseUrl) {
      fetch(`${supabaseUrl}/rest/v1/automation_runs`, {
        method: "POST",
        headers: headers(svcKey, { Prefer: "return=minimal" }),
        body: JSON.stringify({
          job_name: "run-report-schedules",
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          success: runSuccess,
          summary: runSummary,
          error: runError,
        }),
      }).catch(() => {});
    }
  }
});
