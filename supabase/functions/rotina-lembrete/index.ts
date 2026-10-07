import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, sendText } from "../_shared/whatsapp.ts";
import { guard, isUuid, jsonResponse } from "../_shared/auth.ts";
import { numeroParaEnvio } from "../_shared/wa-crm.ts";

// Lembrete de uma demanda da Rotina no WhatsApp do responsavel.
// A rotina e lida com o JWT de quem clicou (a RLS decide se ela e da empresa
// dele); so o numero do responsavel, que o browser nao ve, sai pela service role.

const PRIORIDADE: Record<string, { emoji: string; label: string }> = {
  urgente: { emoji: "🔴", label: "Urgente" },
  moderada: { emoji: "🟡", label: "Moderada" },
  leve: { emoji: "🟢", label: "Leve" },
};

const STATUS: Record<string, string> = {
  pendente: "Pendente",
  andamento: "Em andamento",
  concluida: "Concluída",
};

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function json(body: unknown, status = 200) {
  return jsonResponse(corsHeaders, body, status);
}

function banco() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SVC_ROLE_KEY")!;
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" } };
}

async function comoUsuario<T>(req: Request, path: string): Promise<T> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: anon, Authorization: req.headers.get("Authorization") ?? "" },
  });
  if (!res.ok) throw new Error(`${path.split("?")[0]}: HTTP ${res.status}`);
  return res.json();
}

async function comoServico<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, headers } = banco();
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${path.split("?")[0]}: HTTP ${res.status}`);
  const texto = await res.text();
  return (texto ? JSON.parse(texto) : null) as T;
}

function dataBr(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dia}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const acesso = await guard(req, corsHeaders);
  if (!acesso.ok) return acesso.response;
  const user = acesso.user;
  if (!user) return json({ error: "Lembrete precisa de uma pessoa logada" }, 400);

  try {
    const body = await req.json().catch(() => ({}));
    const rotinaId = body.rotina_id;
    const dataRef = String(body.data_ref ?? "");
    if (!isUuid(rotinaId)) return json({ error: "rotina_id inválido" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRef)) return json({ error: "data_ref inválida" }, 400);

    const [rotina] = await comoUsuario<any[]>(
      req,
      `rotinas?id=eq.${rotinaId}&select=id,titulo,descricao,assigned_to,company_id,prioridade,horario_limite,client:clients(name)`
    );
    if (!rotina) return json({ error: "Demanda não encontrada" }, 404);
    if (!rotina.assigned_to) return json({ error: "A demanda não tem responsável" }, 400);

    const [execucao] = await comoUsuario<any[]>(
      req,
      `rotina_execucoes?rotina_id=eq.${rotinaId}&data_ref=eq.${dataRef}&select=status,mover_para`
    );

    const [vinculo] = await comoServico<any[]>(
      `user_companies?user_id=eq.${rotina.assigned_to}&company_id=eq.${rotina.company_id}&select=whatsapp`
    );
    const numero = numeroParaEnvio(vinculo?.whatsapp);
    if (!numero) {
      return json({ error: "O responsável não tem WhatsApp cadastrado. Cadastre em Configurações > Equipe." }, 400);
    }

    const perfis = await comoServico<any[]>(
      `profiles?id=in.(${rotina.assigned_to},${user.id})&select=id,full_name,email`
    );
    const nomeDe = (id: string) => {
      const p = (perfis ?? []).find((x) => x.id === id);
      return p?.full_name || p?.email || "";
    };
    const responsavel = nomeDe(rotina.assigned_to).split(" ")[0] || "tudo bem";
    const remetente = user.id === rotina.assigned_to ? "" : nomeDe(user.id);

    const p = PRIORIDADE[rotina.prioridade] ?? PRIORIDADE.moderada;
    const quando = dataBr(execucao?.mover_para ?? dataRef);
    const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") || "https://ad-campaign-hub-one.vercel.app").replace(/\/$/, "");

    const texto = [
      `🔔 *Lembrete de rotina, ${responsavel}*`,
      "",
      `${p.emoji} *${rotina.titulo}*`,
      `📅 ${quando}${rotina.horario_limite ? ` · até ${String(rotina.horario_limite).slice(0, 5)}` : ""}`,
      `⚡ Prioridade: *${p.label}*`,
      `📌 Status: ${STATUS[execucao?.status ?? "pendente"] ?? "Pendente"}`,
      rotina.client?.name ? `🏢 Cliente: ${rotina.client.name}` : null,
      rotina.descricao ? `\n${rotina.descricao}` : null,
      "",
      `🔗 ${siteUrl}/rotina`,
      remetente ? `\nEnviado por ${remetente}` : null,
    ]
      .filter((linha) => linha !== null)
      .join("\n");

    await sendText(numero, texto);

    const enviadoEm = new Date().toISOString();
    await comoServico(`rotina_execucoes?on_conflict=rotina_id,data_ref`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ rotina_id: rotinaId, data_ref: dataRef, lembrete_wa_at: enviadoEm }),
    }).catch(() => null);

    return json({ success: true, enviado_em: enviadoEm, responsavel: nomeDe(rotina.assigned_to) });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro ao enviar o lembrete" }, 500);
  }
});
