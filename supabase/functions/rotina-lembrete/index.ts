import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, remetente, sendText } from "../_shared/whatsapp.ts";
import { guard, isUuid, jsonResponse } from "../_shared/auth.ts";
import { numeroParaEnvio } from "../_shared/wa-crm.ts";

// Lembrete de uma demanda da Rotina no WhatsApp do responsavel. Dois caminhos:
// - manual: alguem clica no WhatsApp do card. A rotina e lida com o JWT de quem
//   clicou (a RLS decide se ela e da empresa dele).
// - automatico: o pg_cron chama a cada 5 min com x-cron-secret e o banco diz,
//   por `rotinas_para_lembrar()`, quais demandas ja deram a hora do lembrete.
// Nos dois, o numero do responsavel, que o browser nao ve, sai pela service role.

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

const COLUNAS_ROTINA = "id,titulo,descricao,assigned_to,created_by,company_id,prioridade,horario_limite,client:clients(name)";

interface RotinaLida {
  id: string;
  titulo: string;
  descricao: string | null;
  assigned_to: string | null;
  created_by: string | null;
  company_id: string;
  prioridade: string;
  horario_limite: string | null;
  client: { name: string } | null;
}

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

/** Monta e manda o lembrete. `remetenteId` nulo = automatico. */
async function lembrar(
  rotina: RotinaLida,
  dataRef: string,
  execucao: { status?: string; mover_para?: string | null } | undefined,
  remetenteId: string | null,
) {
  if (!rotina.assigned_to) throw new Error("A demanda não tem responsável");

  const [vinculo] = await comoServico<Array<{ whatsapp: string | null }>>(
    `user_companies?user_id=eq.${rotina.assigned_to}&company_id=eq.${rotina.company_id}&select=whatsapp`
  );
  const numero = numeroParaEnvio(vinculo?.whatsapp);
  if (!numero) throw new Error("O responsável não tem WhatsApp cadastrado. Cadastre em Configurações > Equipe.");

  const ids = [rotina.assigned_to, remetenteId].filter(Boolean).join(",");
  const perfis = await comoServico<Array<{ id: string; full_name: string | null; email: string | null }>>(
    `profiles?id=in.(${ids})&select=id,full_name,email`
  );
  const nomeDe = (id: string) => {
    const p = (perfis ?? []).find((x) => x.id === id);
    return p?.full_name || p?.email || "";
  };
  const responsavel = nomeDe(rotina.assigned_to).split(" ")[0] || "tudo bem";
  const assinatura = !remetenteId
    ? "Lembrete automático"
    : remetenteId === rotina.assigned_to
    ? null
    : `Enviado por ${nomeDe(remetenteId)}`;

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
    assinatura ? `\n${assinatura}` : null,
  ]
    .filter((linha) => linha !== null)
    .join("\n");

  // Manual sai de quem clicou; automatico, de quem criou a demanda.
  const inst = await remetente({ userId: remetenteId ?? rotina.created_by, companyId: rotina.company_id });
  await sendText(inst, numero, texto);
  return nomeDe(rotina.assigned_to);
}

async function carimbar(rotinaId: string, dataRef: string, campo: "lembrete_wa_at" | "lembrete_auto_at") {
  const quando = new Date().toISOString();
  await comoServico(`rotina_execucoes?on_conflict=rotina_id,data_ref`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ rotina_id: rotinaId, data_ref: dataRef, [campo]: quando }),
  });
  return quando;
}

async function rodarAutomatico() {
  const pendentes = await comoServico<Array<{ rotina_id: string; data_ref: string }>>("rpc/rotinas_para_lembrar", {
    method: "POST",
    body: "{}",
  });
  const resultado = { enviados: 0, falhas: [] as string[] };

  for (const item of pendentes ?? []) {
    try {
      const [rotina] = await comoServico<RotinaLida[]>(`rotinas?id=eq.${item.rotina_id}&select=${COLUNAS_ROTINA}`);
      if (!rotina) continue;
      const [execucao] = await comoServico<Array<{ status: string; mover_para: string | null }>>(
        `rotina_execucoes?rotina_id=eq.${item.rotina_id}&data_ref=eq.${item.data_ref}&select=status,mover_para`
      );
      await lembrar(rotina, item.data_ref, execucao, null);
      resultado.enviados += 1;
    } catch (err) {
      resultado.falhas.push(`${item.rotina_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Carimba mesmo na falha (sem WhatsApp cadastrado, por exemplo): sem isso o
    // cron tentaria de novo a cada 5 minutos o dia inteiro.
    await carimbar(item.rotina_id, item.data_ref, "lembrete_auto_at").catch(() => null);
  }
  return resultado;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const segredoCron = req.headers.get("x-cron-secret");
  if (segredoCron) {
    const esperado = Deno.env.get("CRON_SECRET");
    if (!esperado || segredoCron !== esperado) return json({ error: "Unauthorized" }, 401);
    try {
      return json({ ok: true, ...(await rodarAutomatico()) });
    } catch (err) {
      return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }

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

    const [rotina] = await comoUsuario<RotinaLida[]>(req, `rotinas?id=eq.${rotinaId}&select=${COLUNAS_ROTINA}`);
    if (!rotina) return json({ error: "Demanda não encontrada" }, 404);
    if (!rotina.assigned_to) return json({ error: "A demanda não tem responsável" }, 400);

    const [execucao] = await comoUsuario<Array<{ status: string; mover_para: string | null }>>(
      req,
      `rotina_execucoes?rotina_id=eq.${rotinaId}&data_ref=eq.${dataRef}&select=status,mover_para`
    );

    const responsavel = await lembrar(rotina, dataRef, execucao, user.id);
    const enviadoEm = await carimbar(rotinaId, dataRef, "lembrete_wa_at").catch(() => new Date().toISOString());

    return json({ success: true, enviado_em: enviadoEm, responsavel });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Erro ao enviar o lembrete";
    const doUsuario = /responsável|WhatsApp cadastrado|WhatsApp conectado/.test(mensagem);
    return json({ error: mensagem }, doUsuario ? 400 : 500);
  }
});
