import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guard, isUuid, jsonResponse } from "../_shared/auth.ts";

// Guarda os tokens da Meta no cofre (client_secrets). O browser envia o token
// uma vez, ao conectar, e nunca mais consegue le-lo.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Conectar conta de anuncio e gestao de cliente: a mesma regra de quem altera clients.
const PAPEIS = ["owner", "admin"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { clientId, token, pageToken, clear } = await req.json().catch(() => ({}));
    if (!isUuid(clientId)) return jsonResponse(cors, { error: "clientId inválido" }, 400);

    const acesso = await guard(req, cors, { clientId, roles: PAPEIS });
    if (!acesso.ok) return acesso.response;

    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SVC_ROLE_KEY")!;
    const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

    if (clear) {
      await fetch(`${url}/rest/v1/client_secrets?client_id=eq.${clientId}`, { method: "DELETE", headers });
    } else {
      const conta = typeof token === "string" ? token.trim() : "";
      const pagina = typeof pageToken === "string" ? pageToken.trim() : "";
      if (!conta && !pagina) return jsonResponse(cors, { error: "Token não informado" }, 400);

      // So grava o que veio: reconectar sem Pagina nao pode apagar o token da Pagina.
      const linha: Record<string, string> = { client_id: clientId, updated_at: new Date().toISOString() };
      if (conta) linha.meta_access_token = conta;
      if (pagina) linha.meta_page_access_token = pagina;

      const res = await fetch(`${url}/rest/v1/client_secrets`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(linha),
      });
      if (!res.ok) throw new Error(`Falha ao guardar o token (${res.status})`);
    }

    const cofre = await fetch(`${url}/rest/v1/client_secrets?client_id=eq.${clientId}&select=meta_access_token`, { headers })
      .then(r => r.json()).catch(() => []);
    const configurado = Array.isArray(cofre) && !!cofre[0]?.meta_access_token;

    await fetch(`${url}/rest/v1/clients?id=eq.${clientId}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ meta_token_configured: configurado }),
    });

    return jsonResponse(cors, { ok: true, configured: configurado });
  } catch (err) {
    return jsonResponse(cors, { error: (err as Error).message }, 500);
  }
});
