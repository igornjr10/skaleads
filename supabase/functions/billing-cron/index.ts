import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { remetente, sendText, type Instancia } from "../_shared/whatsapp.ts";
import { getUser, hasAnyRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface Lembrete {
  invoice_id: string;
  client_name: string;
  destino: string | null;
  offset_dias: number;
  mensagem: string;
}

// Roda uma vez por dia pelo pg_cron. Faz tres coisas, nesta ordem:
//   1. gera a fatura do mes para quem tem mensalidade habilitada
//   2. marca como vencida o que passou da data
//   3. dispara os lembretes que vencem hoje pela regua do time
//
// A idempotencia mora no banco: invoices tem unique (client_id, competencia) e
// invoice_reminders tem unique (invoice_id, offset_dias). Rodar duas vezes no
// mesmo dia nao duplica fatura nem manda a mesma cobranca de novo.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // Dois caminhos de entrada: o cron com o segredo, ou um owner/admin clicando
  // em "Rodar agora" na tela — util para conferir a regua sem esperar um dia.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const doCron = Boolean(cronSecret) && req.headers.get("x-cron-secret") === cronSecret;

  if (!doCron) {
    const user = await getUser(req);
    if (!user) return json({ error: "Não autenticado" }, 401);
    if (!(await hasAnyRole(user.id, ["owner", "admin"]))) {
      return json({ error: "Sem permissão para disparar cobranças" }, 403);
    }
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
    if (!supabaseUrl || !svcKey) throw new Error("SUPABASE_URL / SVC_ROLE_KEY não configurados");

    const headers = {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      "Content-Type": "application/json",
    };

    const rpc = (nome: string) =>
      fetch(`${supabaseUrl}/rest/v1/rpc/${nome}`, { method: "POST", headers, body: "{}" }).then(r => r.json());

    // 1 e 2
    const housekeeping = await rpc("billing_housekeeping");
    const resumo = Array.isArray(housekeeping) ? housekeeping[0] : housekeeping;

    // 3
    const lembretes: Lembrete[] = await rpc("billing_due_reminders");
    if (!Array.isArray(lembretes)) {
      throw new Error(`billing_due_reminders devolveu ${JSON.stringify(lembretes).slice(0, 200)}`);
    }

    // Cobranca nao tem criador: sai do numero padrao da empresa do cliente.
    const empresaDaFatura = new Map<string, string>();
    if (lembretes.length) {
      const ids = [...new Set(lembretes.map(l => l.invoice_id))].join(",");
      const faturas = await fetch(
        `${supabaseUrl}/rest/v1/invoices?id=in.(${ids})&select=id,client:clients(company_id)`,
        { headers }
      ).then(r => r.json()).catch(() => []);
      for (const f of Array.isArray(faturas) ? faturas : []) if (f.client?.company_id) empresaDaFatura.set(f.id, f.client.company_id);
    }
    const numeros = new Map<string, Promise<Instancia>>();
    const numeroDa = (invoiceId: string) => {
      const empresa = empresaDaFatura.get(invoiceId) ?? "";
      if (!numeros.has(empresa)) numeros.set(empresa, remetente({ companyId: empresa || null }));
      return numeros.get(empresa)!;
    };

    let enviados = 0;
    let falhas = 0;
    const detalhes: Array<{ cliente: string; offset: number; ok: boolean; erro?: string }> = [];


    for (const item of lembretes) {
      if (!item.destino) {
        falhas++;
        detalhes.push({ cliente: item.client_name, offset: item.offset_dias, ok: false, erro: "sem destino de WhatsApp" });
        // Registra a tentativa para nao ficar reprocessando todo dia.
        await fetch(`${supabaseUrl}/rest/v1/invoice_reminders`, {
          method: "POST",
          headers: { ...headers, Prefer: "return=minimal" },
          body: JSON.stringify({
            invoice_id: item.invoice_id,
            offset_dias: item.offset_dias,
            destino: null,
            sucesso: false,
            erro: "sem destino de WhatsApp",
          }),
        }).catch(() => {});
        continue;
      }

      let sucesso = true;
      let erro: string | null = null;

      try {
        await sendText(await numeroDa(item.invoice_id), item.destino, item.mensagem);
        enviados++;
      } catch (err) {
        sucesso = false;
        erro = (err as Error).message;
        falhas++;
      }

      detalhes.push({ cliente: item.client_name, offset: item.offset_dias, ok: sucesso, erro: erro ?? undefined });

      await fetch(`${supabaseUrl}/rest/v1/invoice_reminders`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          invoice_id: item.invoice_id,
          offset_dias: item.offset_dias,
          destino: item.destino,
          sucesso,
          erro,
        }),
      }).catch(() => {});
    }

    return json({
      success: true,
      faturas_geradas: resumo?.geradas ?? 0,
      marcadas_vencidas: resumo?.vencidas ?? 0,
      lembretes_previstos: lembretes.length,
      enviados,
      falhas,
      detalhes,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
