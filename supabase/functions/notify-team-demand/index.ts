// Avisa a pessoa etiquetada numa demanda do time: email (Resend), WhatsApp
// (provedor configurado) e sino do app quando o membro tem usuario vinculado.
//
// Roda com service_role para ler o membro (email/WhatsApp) e gravar o
// resultado, entao a posse e conferida aqui: a demanda precisa ser do mesmo
// time de quem chamou.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, isUuid, jsonResponse } from "../_shared/auth.ts";
import { sendText } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Member {
  id: string;
  nome: string;
  funcao: string;
  email: string | null;
  whatsapp: string | null;
  user_id: string | null;
}

interface Demand {
  id: string;
  team_id: string;
  titulo: string;
  descricao: string | null;
  tipo: "semanal" | "diaria";
  prioridade: "baixa" | "normal" | "alta" | "urgente";
  status: string;
  prazo: string | null;
  member: Member | null;
  client: { name: string } | null;
}

interface ChannelResult {
  sent: boolean;
  skipped?: string;
  error?: string;
}

const PRIORIDADE = {
  baixa: { label: "Baixa", emoji: "🟢", cor: "#10b981" },
  normal: { label: "Normal", emoji: "🔵", cor: "#3b82f6" },
  alta: { label: "Alta", emoji: "🟠", cor: "#f59e0b" },
  urgente: { label: "Urgente", emoji: "🔴", cor: "#ef4444" },
} as const;

function svcHeaders(svcKey: string) {
  return { apikey: svcKey, Authorization: `Bearer ${svcKey}`, "Content-Type": "application/json" };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Numero brasileiro digitado sem DDI (11 digitos) vira 55 + numero.
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function describePrazo(prazo: string | null): { texto: string; dias: number | null } {
  if (!prazo) return { texto: "sem prazo definido", dias: null };
  const [y, m, d] = prazo.split("-").map(Number);
  const formatado = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;

  const hojeSp = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const hoje = Date.UTC(hojeSp.getFullYear(), hojeSp.getMonth(), hojeSp.getDate());
  const alvo = Date.UTC(y, m - 1, d);
  const dias = Math.round((alvo - hoje) / 86_400_000);

  if (dias < 0) return { texto: `${formatado} (atrasada há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"})`, dias };
  if (dias === 0) return { texto: `${formatado} (vence hoje)`, dias };
  if (dias === 1) return { texto: `${formatado} (vence amanhã)`, dias };
  return { texto: `${formatado} (faltam ${dias} dias)`, dias };
}

function buildWhatsApp(demand: Demand, member: Member, siteUrl: string): string {
  const p = PRIORIDADE[demand.prioridade] ?? PRIORIDADE.normal;
  const prazo = describePrazo(demand.prazo);
  return [
    `${p.emoji} *Nova demanda para você, ${member.nome.split(" ")[0]}*`,
    "",
    `📌 *${demand.titulo}*`,
    demand.client ? `🏢 Cliente: ${demand.client.name}` : null,
    `📅 Tipo: ${demand.tipo === "diaria" ? "demanda do dia" : "demanda da semana"}`,
    `⚡ Prioridade: *${p.label}*`,
    `⏳ Prazo: *${prazo.texto}*`,
    demand.descricao ? `\n${demand.descricao}` : null,
    "",
    `🔗 ${siteUrl}/time`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function buildEmailHtml(demand: Demand, member: Member, siteUrl: string): string {
  const p = PRIORIDADE[demand.prioridade] ?? PRIORIDADE.normal;
  const prazo = describePrazo(demand.prazo);
  const linha = (rotulo: string, valor: string, destaque = false) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #1f2937;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;width:120px;">${rotulo}</td>
      <td style="padding:10px 0;border-bottom:1px solid #1f2937;font-size:15px;color:${destaque ? "#fff" : "#e5e7eb"};font-weight:${destaque ? 700 : 500};">${valor}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Nova demanda: ${escapeHtml(demand.titulo)}</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#111111;border:1px solid #1f2937;border-radius:16px;overflow:hidden;">
    <div style="padding:28px 32px;background:linear-gradient(135deg,#052e16,#111111);border-bottom:1px solid #1f2937;">
      <div style="font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#34d399;margin-bottom:10px;">Scale Ads · Gestão de time</div>
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;line-height:1.3;">Nova demanda para você, ${escapeHtml(member.nome.split(" ")[0])}</h1>
      <p style="margin:8px 0 0;color:#9ca3af;font-size:14px;">Alguém do time marcou o seu nome nesta demanda.</p>
    </div>

    <div style="padding:24px 32px;">
      <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:${p.cor}22;border:1px solid ${p.cor}66;color:${p.cor};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px;">
        ${p.emoji} Prioridade ${p.label}
      </div>

      <h2 style="margin:0 0 16px;color:#fff;font-size:18px;font-weight:700;">${escapeHtml(demand.titulo)}</h2>

      <table style="width:100%;border-collapse:collapse;">
        ${demand.client ? linha("Cliente", escapeHtml(demand.client.name)) : ""}
        ${linha("Tipo", demand.tipo === "diaria" ? "Demanda do dia" : "Demanda da semana")}
        ${linha("Prazo", escapeHtml(prazo.texto), true)}
      </table>

      ${demand.descricao ? `<p style="margin:20px 0 0;padding:16px;background:#0a0a0a;border-radius:12px;color:#d1d5db;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(demand.descricao)}</p>` : ""}

      <a href="${siteUrl}/time" style="display:inline-block;margin-top:24px;background:#10b981;color:#052e16;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:700;">
        Abrir minhas demandas →
      </a>
    </div>

    <div style="padding:16px 32px;border-top:1px solid #1f2937;">
      <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">Você recebe este email porque está cadastrado no time no Scale Ads.</p>
    </div>
  </div>
</body>
</html>`;
}

async function sendEmail(demand: Demand, member: Member, siteUrl: string): Promise<ChannelResult> {
  if (!member.email) return { sent: false, skipped: "Membro sem email" };
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY não configurado" };

  const p = PRIORIDADE[demand.prioridade] ?? PRIORIDADE.normal;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Scale Ads <alertas@marketproads.com.br>",
      to: [member.email],
      subject: `${p.emoji} [${p.label}] ${demand.titulo}${demand.prazo ? ` · até ${describePrazo(demand.prazo).texto.split(" ")[0]}` : ""}`,
      html: buildEmailHtml(demand, member, siteUrl),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { sent: false, error: body?.message || `Resend respondeu ${res.status}` };
  return { sent: true };
}

async function sendWhatsapp(demand: Demand, member: Member, siteUrl: string): Promise<ChannelResult> {
  if (!member.whatsapp) return { sent: false, skipped: "Membro sem WhatsApp" };
  try {
    await sendText(normalizePhone(member.whatsapp), buildWhatsApp(demand, member, siteUrl));
    return { sent: true };
  } catch (err) {
    return { sent: false, error: (err as Error).message };
  }
}

async function notifyInApp(
  supabaseUrl: string,
  svcKey: string,
  demand: Demand,
  member: Member
): Promise<ChannelResult> {
  if (!member.user_id) return { sent: false, skipped: "Membro sem usuário vinculado" };
  const p = PRIORIDADE[demand.prioridade] ?? PRIORIDADE.normal;
  const res = await fetch(`${supabaseUrl}/rest/v1/notifications`, {
    method: "POST",
    headers: { ...svcHeaders(svcKey), Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: member.user_id,
      type: "demand",
      title: `${p.emoji} Nova demanda: ${demand.titulo}`,
      body: `Prioridade ${p.label.toLowerCase()} · prazo ${describePrazo(demand.prazo).texto}`,
    }),
  });
  if (!res.ok) return { sent: false, error: `notifications respondeu ${res.status}` };
  return { sent: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const user = await getUser(req);
  if (!user) return jsonResponse(corsHeaders, { error: "Não autenticado" }, 401);

  try {
    const { demand_id } = await req.json().catch(() => ({}));
    if (!isUuid(demand_id)) return jsonResponse(corsHeaders, { error: "demand_id inválido" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
    if (!supabaseUrl || !svcKey) throw new Error("SUPABASE_URL / SVC_ROLE_KEY não configurados");
    const headers = svcHeaders(svcKey);

    const [profile] = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=team_id`,
      { headers }
    ).then((r) => r.json()).catch(() => []);

    const [demand]: Demand[] = await fetch(
      `${supabaseUrl}/rest/v1/team_demands?id=eq.${demand_id}` +
        `&select=id,team_id,titulo,descricao,tipo,prioridade,status,prazo,` +
        `member:team_members(id,nome,funcao,email,whatsapp,user_id),client:clients(name)`,
      { headers }
    ).then((r) => r.json()).catch(() => []);

    if (!demand || !profile?.team_id || demand.team_id !== profile.team_id) {
      return jsonResponse(corsHeaders, { error: "Demanda não encontrada" }, 404);
    }
    if (!demand.member) {
      return jsonResponse(corsHeaders, { error: "Demanda sem responsável etiquetado" }, 400);
    }

    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://ad-campaign-hub-one.vercel.app";
    const member = demand.member;

    const [email, whatsapp, app] = await Promise.all([
      sendEmail(demand, member, siteUrl),
      sendWhatsapp(demand, member, siteUrl),
      notifyInApp(supabaseUrl, svcKey, demand, member),
    ]);

    const result = { email, whatsapp, app, at: new Date().toISOString() };

    await fetch(`${supabaseUrl}/rest/v1/team_demands?id=eq.${demand.id}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ notified_at: result.at, notificacao: result }),
    }).catch(() => {});

    return jsonResponse(corsHeaders, { success: email.sent || whatsapp.sent || app.sent, ...result });
  } catch (err) {
    return jsonResponse(corsHeaders, { error: (err as Error).message }, 500);
  }
});
