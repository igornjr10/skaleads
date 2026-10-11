import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, sendText } from "../_shared/whatsapp.ts";
import { isServiceRole, jsonResponse } from "../_shared/auth.ts";
import { numeroParaEnvio } from "../_shared/wa-crm.ts";

interface Execucao { id: string; company_id: string; tipo: string; destinatario: string; titulo: string; mensagem: string }

function banco() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SVC_ROLE_KEY")!;
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" } };
}
async function db<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, headers } = banco();
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`Banco: HTTP ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(corsHeaders, { error: "Método não permitido" }, 405);
  try {
    if (!isServiceRole(req)) {
      const secret = req.headers.get("x-cron-secret");
      const rows = secret ? await db<{ value: string }[]>("app_config?key=eq.cron_secret&select=value") : [];
      if (!secret || !rows[0]?.value || secret !== rows[0].value) return jsonResponse(corsHeaders, { error: "Não autorizado" }, 401);
    }
    const lote = await db<Execucao[]>("rpc/reclamar_whatsapp_operacional", { method: "POST", body: "{}" });
    let enviados = 0;
    for (const e of lote) {
      try {
        const [regras, membros] = await Promise.all([
          db<{ ativa: boolean; whatsapp: boolean }[]>(`operacao_regras?company_id=eq.${e.company_id}&tipo=eq.${e.tipo}&select=ativa,whatsapp`),
          db<{ whatsapp: string | null }[]>(`user_companies?company_id=eq.${e.company_id}&user_id=eq.${e.destinatario}&select=whatsapp`),
        ]);
        if (!regras[0]?.ativa || !regras[0]?.whatsapp || !membros.length) {
          await db(`operacao_execucoes?id=eq.${e.id}`, { method: "PATCH", body: JSON.stringify({ whatsapp_status: "cancelado" }) });
          continue;
        }
        const numero = numeroParaEnvio(membros[0].whatsapp);
        if (!numero) throw new Error("Destinatário sem WhatsApp válido em Configurações → Equipe");
        const site = (Deno.env.get("PUBLIC_SITE_URL") || "https://bussiness.midsam.com.br").replace(/\/$/, "");
        await sendText(numero, `${e.titulo}\n\n${e.mensagem}\n\n${site}/agencia`);
        await db(`operacao_execucoes?id=eq.${e.id}`, { method: "PATCH", body: JSON.stringify({ whatsapp_status: "enviado", erro: null }) });
        enviados++;
      } catch (err) {
        await db(`operacao_execucoes?id=eq.${e.id}`, { method: "PATCH", body: JSON.stringify({ whatsapp_status: "erro", erro: err instanceof Error ? err.message : "Falha no envio" }) });
      }
    }
    return jsonResponse(corsHeaders, { total: lote.length, enviados });
  } catch (err) {
    return jsonResponse(corsHeaders, { error: err instanceof Error ? err.message : "Falha no processamento" }, 500);
  }
});
