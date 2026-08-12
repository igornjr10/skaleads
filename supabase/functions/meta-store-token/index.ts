import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Conectar uma conta de anuncio e gestao de cliente, nao consulta.
const ALLOWED_ROLES = ["owner", "admin"];

// Guarda o token da Meta no cofre (client_secrets), que nao tem grant para
// authenticated. O browser envia o token uma vez e nunca mais consegue le-lo.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    if (!supabaseUrl || !svcKey) throw new Error("SUPABASE_URL / SVC_ROLE_KEY não configurados");

    const svcHeaders = {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      "Content-Type": "application/json",
    };

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: req.headers.get("Authorization") ?? "" },
    });
    const user = await userRes.json().catch(() => null);
    if (!userRes.ok || !user?.id) return json({ error: "Não autenticado" }, 401);

    const roles: Array<{ role: string }> = await fetch(
      `${supabaseUrl}/rest/v1/user_roles?user_id=eq.${user.id}&select=role`,
      { headers: svcHeaders }
    ).then(r => r.json()).catch(() => []);

    if (!Array.isArray(roles) || !roles.some(r => ALLOWED_ROLES.includes(r.role))) {
      return json({ error: "Apenas admin ou owner pode conectar uma conta Meta" }, 403);
    }

    const { clientId, token, clear } = await req.json().catch(() => ({}));
    if (!clientId || !UUID_RE.test(clientId)) return json({ error: "clientId inválido" }, 400);

    if (clear) {
      await fetch(`${supabaseUrl}/rest/v1/client_secrets?client_id=eq.${clientId}`, {
        method: "DELETE",
        headers: svcHeaders,
      });
    } else {
      const trimmed = typeof token === "string" ? token.trim() : "";
      if (!trimmed) return json({ error: "Token não informado" }, 400);

      const res = await fetch(`${supabaseUrl}/rest/v1/client_secrets`, {
        method: "POST",
        headers: { ...svcHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          client_id: clientId,
          meta_access_token: trimmed,
          updated_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`Falha ao guardar o token (${res.status})`);
    }

    await fetch(`${supabaseUrl}/rest/v1/clients?id=eq.${clientId}`, {
      method: "PATCH",
      headers: { ...svcHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({ meta_token_configured: !clear }),
    });

    return json({ ok: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
