import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, ownsClient, jsonResponse } from "../_shared/auth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// A Groq desliga modelo com data marcada (o llama-3.3-70b-versatile morreu em
// 16/08/2026). Como secret, trocar o modelo nao exige redeploy da function.
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b";

interface Message {
  role: "user" | "assistant";
  content: string;
}

async function dbGet(baseUrl: string, serviceKey: string, dbAuthHeader: string, table: string, qs: Record<string, string>): Promise<any[]> {
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  Object.entries(qs).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: {
      "apikey": serviceKey,
      "Authorization": dbAuthHeader,
      "Accept": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DB error on ${table}: ${body}`);
  }
  return res.json();
}

async function fetchContext(baseUrl: string, serviceKey: string, dbAuthHeader: string, clientId?: string): Promise<string> {
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  if (clientId) {
    const [clientRows, campaigns, metrics, auditRows] = await Promise.all([
      dbGet(baseUrl, serviceKey, dbAuthHeader, "clients", {
        select: "name,status,meta_sync_status,city,state",
        id: `eq.${clientId}`,
        limit: "1",
      }),
      dbGet(baseUrl, serviceKey, dbAuthHeader, "campaigns", {
        select: "name,status,objective,spend,impressions,clicks,ctr,cpc,conversions",
        "client_id": `eq.${clientId}`,
        order: "spend.desc",
        limit: "15",
      }),
      dbGet(baseUrl, serviceKey, dbAuthHeader, "campaign_daily_metrics", {
        select: "date,spend,impressions,clicks",
        "client_id": `eq.${clientId}`,
        date: `gte.${since30d}`,
        order: "date.desc",
        limit: "30",
      }),
      dbGet(baseUrl, serviceKey, dbAuthHeader, "audit_runs", {
        select: "score,category_scores,results,created_at",
        "client_id": `eq.${clientId}`,
        order: "created_at.desc",
        limit: "1",
      }),
    ]);

    const client = clientRows[0] ?? null;
    const audit = auditRows[0] ?? null;

    const totals = metrics.reduce(
      (acc: any, r: any) => ({
        spend: acc.spend + (r.spend ?? 0),
        clicks: acc.clicks + (r.clicks ?? 0),
        impressions: acc.impressions + (r.impressions ?? 0),
      }),
      { spend: 0, clicks: 0, impressions: 0 }
    );
    const ctr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : "0";

    const w: Record<string, number> = { critical: 3, warning: 2, info: 1 };
    const topIssues = audit
      ? ((audit.results ?? []) as any[])
          .filter((r: any) => r.status === "fail" || r.status === "warn")
          .sort((a: any, b: any) => (w[b.severity] ?? 0) - (w[a.severity] ?? 0))
          .slice(0, 3)
          .map((r: any) => `  - [${r.severity}] ${r.name}: ${r.message}`)
          .join("\n")
      : "  Nenhuma auditoria disponível";

    return `=== CONTEXTO DO CLIENTE ===
Nome: ${client?.name ?? "N/A"} | Status: ${client?.status ?? "N/A"} | Cidade: ${client?.city ?? "N/A"} | Meta: ${client?.meta_sync_status ?? "N/A"}

=== CAMPANHAS (ordenadas por gasto) ===
${campaigns.map((c: any) =>
  `${c.name} [${c.status}] | Objetivo: ${c.objective} | Gasto: R$${(c.spend ?? 0).toFixed(2)} | CTR: ${(c.ctr ?? 0).toFixed(2)}% | CPC: R$${(c.cpc ?? 0).toFixed(2)} | Conversões: ${c.conversions ?? 0}`
).join("\n") || "  Sem campanhas"}

=== MÉTRICAS ÚLTIMOS 30 DIAS ===
Gasto total: R$${totals.spend.toFixed(2)} | Cliques: ${totals.clicks} | Impressões: ${totals.impressions} | CTR médio: ${ctr}%

=== AUDITORIA ===
Score: ${audit?.score ?? "N/A"}/100
Principais problemas:
${topIssues}`;
  }

  // Visão geral — todos os clientes
  const [clients, campaigns] = await Promise.all([
    dbGet(baseUrl, serviceKey, dbAuthHeader, "clients", {
      select: "id,name,status,meta_sync_status,city",
      order: "name.asc",
    }),
    dbGet(baseUrl, serviceKey, dbAuthHeader, "campaigns", {
      select: "name,status,spend,ctr,client_id",
      order: "spend.desc",
      limit: "10",
    }),
  ]);

  return `=== VISÃO GERAL ===
Total de clientes: ${clients.length}

=== CLIENTES ===
${clients.map((c: any) => `${c.name} [${c.status}] | Meta: ${c.meta_sync_status} | Cidade: ${c.city ?? "N/A"}`).join("\n") || "  Nenhum cliente"}

=== TOP CAMPANHAS ATIVAS (por gasto) ===
${campaigns.map((c: any) => `${c.name} | Gasto: R$${(c.spend ?? 0).toFixed(2)} | CTR: ${(c.ctr ?? 0).toFixed(2)}%`).join("\n") || "  Nenhuma campanha ativa"}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SVC_ROLE_KEY")!;
  // Sempre usar service role para queries de contexto — ignora RLS
  const dbAuthHeader = `Bearer ${serviceKey}`;

  try {
    const { messages, clientId } = await req.json() as {
      messages: Message[];
      clientId?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error("messages é obrigatório");
    }

    const user = await getUser(req);
    if (!user) return jsonResponse(cors, { error: "Não autenticado" }, 401);
    // tenantId vinha do corpo — bastava trocar o valor para furar o rate limit.
    const tenantId = user.id;

    // O contexto e lido com service role, que ignora RLS: sem esta checagem,
    // passar o clientId de outra carteira traria as campanhas dela para o chat.
    if (clientId && !(await ownsClient(user.id, clientId))) {
      return jsonResponse(cors, { error: "Cliente não encontrado na sua carteira" }, 404);
    }

    const context = await fetchContext(baseUrl, serviceKey, dbAuthHeader, clientId);

    const systemPrompt = `Você é um assistente especialista em gestão de tráfego pago e campanhas Meta Ads. Seu nome é Assistente IA do Scale Ads.

Você tem acesso aos dados reais das campanhas do sistema. Responda sempre em português brasileiro, de forma clara e acionável.

Seja direto, use dados concretos quando disponíveis, e sugira ações práticas.

DADOS ATUAIS DO SISTEMA:
${context}

Instruções:
- Use os dados acima para responder perguntas sobre desempenho, campanhas e clientes
- Se o usuário perguntar sobre algo que não está nos dados, diga que não tem essa informação no momento
- Formate respostas longas com markdown (negrito, listas, etc.)
- Seja proativo: se identificar algo importante nos dados, mencione mesmo sem ser perguntado`;

    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) throw new Error("GROQ_API_KEY não configurado");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 2048,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Groq API error: ${err.error?.message ?? response.statusText}`);
    }

    const data = await response.json();
    const reply = data.choices[0].message.content as string;
    const tokens = {
      input: data.usage?.prompt_tokens ?? 0,
      output: data.usage?.completion_tokens ?? 0,
    };

    return new Response(
      JSON.stringify({ success: true, reply, tokens, cost_usd: "0.000000" }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("chat-assistant error:", err);
    const message = (err as any)?.message ?? String(err);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
