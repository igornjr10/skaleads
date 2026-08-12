import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// UUID: e o formato que o gerador de relatorio usa (crypto.randomUUID).
// Validar antes de montar a query impede injecao de filtro no PostgREST.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ReportRow {
  id: string;
  name: string;
  data: unknown;
  period: unknown;
  share_expires_at: string | null;
}

// Este endpoint e publico (o token no link E a autenticacao — sem login).
// A tabela reports nao tem grant para anon de proposito: RLS filtra linha, nao
// o WHERE do cliente, entao expor a tabela deixaria qualquer anonimo listar
// todos os relatorios compartilhados. Aqui o token vira filtro obrigatorio.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { token } = await req.json().catch(() => ({}));
    if (!token || typeof token !== "string" || !UUID_RE.test(token)) {
      return json({ error: "Relatório não encontrado" }, 404);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
    if (!supabaseUrl || !svcKey) throw new Error("SUPABASE_URL / SVC_ROLE_KEY não configurados");

    const authHeaders = {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      "Content-Type": "application/json",
    };

    const rows: ReportRow[] = await fetch(
      `${supabaseUrl}/rest/v1/reports?share_token=eq.${token}&status=eq.ready` +
        `&select=id,name,data,period,share_expires_at&limit=1`,
      { headers: authHeaders, cache: "no-store" }
    ).then(r => r.json());

    const report = Array.isArray(rows) ? rows[0] : undefined;
    if (!report) return json({ error: "Relatório não encontrado" }, 404);

    if (report.share_expires_at && new Date(report.share_expires_at) <= new Date()) {
      return json({ error: "Este link de relatório expirou" }, 410);
    }

    // Atomico e ja ignora link expirado; erro aqui nao pode derrubar a leitura.
    fetch(`${supabaseUrl}/rest/v1/rpc/increment_report_views`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ p_share_token: token }),
    }).catch(() => {});

    return json({
      id: report.id,
      name: report.name,
      data: report.data,
      period: report.period,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
