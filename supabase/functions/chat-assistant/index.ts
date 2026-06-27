import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GROQ_MODEL = "llama-3.3-70b-versatile";

interface Message {
  role: "user" | "assistant";
  content: string;
}

async function fetchContext(supabase: any, clientId?: string): Promise<string> {
  if (clientId) {
    const [campaignsRes, metricsRes, auditRes, alertsRes] = await Promise.all([
      supabase
        .from("campaigns")
        .select("name, status, objective, spend, impressions, clicks, ctr, cpc, conversions")
        .eq("client_id", clientId)
        .order("spend", { ascending: false })
        .limit(15),
      supabase
        .from("campaign_daily_metrics")
        .select("date, spend, impressions, clicks, messages, calls, leads, directions")
        .eq("client_id", clientId)
        .gte("date", new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0])
        .order("date", { ascending: false })
        .limit(30),
      supabase
        .from("audit_runs")
        .select("score, category_scores, results, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("clients")
        .select("name, status, meta_sync_status, city, state, primary_goal, business_segment")
        .eq("id", clientId)
        .maybeSingle(),
    ]);

    const client = alertsRes.data;
    const campaigns = campaignsRes.data ?? [];
    const metrics = metricsRes.data ?? [];
    const audit = auditRes.data;

    const totals = metrics.reduce(
      (acc: any, r: any) => ({
        spend: acc.spend + (r.spend ?? 0),
        clicks: acc.clicks + (r.clicks ?? 0),
        impressions: acc.impressions + (r.impressions ?? 0),
        messages: acc.messages + (r.messages ?? 0),
        calls: acc.calls + (r.calls ?? 0),
        leads: acc.leads + (r.leads ?? 0),
      }),
      { spend: 0, clicks: 0, impressions: 0, messages: 0, calls: 0, leads: 0 }
    );

    const topIssues = audit
      ? ((audit.results ?? []) as any[])
          .filter((r: any) => r.status === "fail" || r.status === "warn")
          .sort((a: any, b: any) => {
            const w: Record<string, number> = { critical: 3, warning: 2, info: 1 };
            return (w[b.severity] ?? 0) - (w[a.severity] ?? 0);
          })
          .slice(0, 3)
          .map((r: any) => `  - [${r.severity}] ${r.name}: ${r.message}`)
          .join("\n")
      : "Nenhuma auditoria disponível";

    return `=== CONTEXTO DO CLIENTE ===
Nome: ${client?.name ?? "N/A"} | Status: ${client?.status ?? "N/A"} | Cidade: ${client?.city ?? "N/A"} | Meta: ${client?.meta_sync_status ?? "N/A"}
Objetivo principal: ${client?.primary_goal ?? "N/A"} | Segmento: ${client?.business_segment ?? "N/A"}

=== CAMPANHAS (ordenadas por gasto) ===
${campaigns.map((c: any) =>
  `${c.name} [${c.status}] | Objetivo: ${c.objective} | Gasto: R$${(c.spend ?? 0).toFixed(2)} | CTR: ${(c.ctr ?? 0).toFixed(2)}% | CPC: R$${(c.cpc ?? 0).toFixed(2)} | Conversões: ${c.conversions ?? 0}`
).join("\n") || "Sem campanhas"}

=== MÉTRICAS ÚLTIMOS 30 DIAS ===
Gasto total: R$${totals.spend.toFixed(2)} | Cliques: ${totals.clicks} | Impressões: ${totals.impressions}
CTR médio: ${totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : 0}%
Ações locais: ${totals.messages} mensagens | ${totals.calls} ligações | ${totals.leads} leads

=== AUDITORIA ===
Score: ${audit?.score ?? "N/A"}/100
Principais problemas:
${topIssues}`;
  }

  // No clientId: summary view
  const [clientsRes, campaignsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, status, meta_sync_status, city, primary_goal")
      .order("name"),
    supabase
      .from("campaigns")
      .select("name, status, spend, ctr, client_id")
      .eq("status", "ACTIVE")
      .order("spend", { ascending: false })
      .limit(10),
  ]);

  const clients = clientsRes.data ?? [];
  const campaigns = campaignsRes.data ?? [];

  return `=== VISÃO GERAL ===
Total de clientes: ${clients.length}

=== CLIENTES ===
${clients.map((c: any) => `${c.name} [${c.status}] | Meta: ${c.meta_sync_status} | Cidade: ${c.city ?? "N/A"}`).join("\n") || "Nenhum cliente"}

=== TOP CAMPANHAS ATIVAS (por gasto) ===
${campaigns.map((c: any) => `${c.name} | Gasto: R$${(c.spend ?? 0).toFixed(2)} | CTR: ${(c.ctr ?? 0).toFixed(2)}%`).join("\n") || "Nenhuma campanha ativa"}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { messages, clientId, tenantId } = await req.json() as {
      messages: Message[];
      clientId?: string;
      tenantId: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error("messages é obrigatório");
    }
    if (!tenantId) throw new Error("tenantId é obrigatório");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const context = await fetchContext(supabase, clientId);

    const systemPrompt = `Você é um assistente especialista em gestão de tráfego pago e campanhas Meta Ads. Seu nome é Assistente IA do MarketPro Manager.

Você tem acesso aos dados reais das campanhas do sistema. Responda sempre em português brasileiro, de forma clara e acionável.

Seja direto, use dados concretos quando disponíveis, e sugira ações práticas. Para análises numéricas, mostre os cálculos quando relevante.

DADOS ATUAIS DO SISTEMA:
${context}

Instruções:
- Use os dados acima para responder perguntas sobre desempenho, campanhas e clientes
- Se o usuário perguntar sobre algo que não está nos dados, diga que não tem essa informação no momento
- Formate respostas longas com markdown (negrito, listas, etc.)
- Seja proativo: se identificar algo importante nos dados, mencione mesmo sem ser perguntado`;

    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) throw new Error("GROQ_API_KEY não configurado");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
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
    const message = err instanceof Error ? err.message : "Erro interno";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
