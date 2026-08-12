import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_BASE = "https://graph.facebook.com/v21.0";

// So caminho de recurso: sem esquema, sem host, sem query. O token e a query
// string sao montados aqui, nunca vem do browser.
const PATH_RE = /^[A-Za-z0-9_.\-/]{1,200}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Viewer e observador: le o que ja foi sincronizado, nao dispara chamada nova
// na conta de anuncio do cliente.
const ALLOWED_ROLES = ["owner", "admin", "analyst"];

const MAX_PAGES = 50;

interface ProxyRequest {
  clientId?: string;
  rawToken?: string;
  path?: string;
  params?: Record<string, string>;
  mode?: "object" | "list";
}

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

    // 1. Quem esta chamando. O gateway ja exige JWT, mas a anon key tambem passa
    // por ele — o que barra chamada sem usuario de verdade e o sub do token.
    const authHeader = req.headers.get("Authorization") ?? "";
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authHeader },
    });
    const user = await userRes.json().catch(() => null);
    if (!userRes.ok || !user?.id) return json({ error: "Não autenticado" }, 401);

    const roles: Array<{ role: string }> = await fetch(
      `${supabaseUrl}/rest/v1/user_roles?user_id=eq.${user.id}&select=role`,
      { headers: svcHeaders }
    ).then(r => r.json()).catch(() => []);

    const allowed = Array.isArray(roles) && roles.some(r => ALLOWED_ROLES.includes(r.role));
    if (!allowed) return json({ error: "Seu perfil não tem permissão para consultar a Meta" }, 403);

    // 2. O que esta sendo pedido.
    const body: ProxyRequest = await req.json().catch(() => ({}));
    const { clientId, rawToken, path, params = {}, mode = "object" } = body;

    if (!path || !PATH_RE.test(path)) return json({ error: "Path inválido" }, 400);
    if (clientId && !UUID_RE.test(clientId)) return json({ error: "clientId inválido" }, 400);

    // 3. Token: do cofre pelo clientId, ou o que o operador acabou de digitar no
    // formulario de conexao (cliente ainda nao salvo).
    let token = typeof rawToken === "string" ? rawToken.trim() : "";

    // PostgREST responde objeto de erro (nao array) quando a tabela ou coluna
    // nao existe — desestruturar direto quebraria com 500 em vez de 409.
    const firstRow = async (path: string): Promise<{ meta_access_token?: string | null } | null> => {
      const body = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: svcHeaders })
        .then(r => r.json())
        .catch(() => null);
      return Array.isArray(body) ? body[0] ?? null : null;
    };

    if (!token) {
      if (!clientId) return json({ error: "Informe clientId ou rawToken" }, 400);

      const secret = await firstRow(`client_secrets?client_id=eq.${clientId}&select=meta_access_token&limit=1`);
      token = secret?.meta_access_token?.trim() ?? "";

      // Fallback enquanto a migration do cofre nao rodou em todos os ambientes.
      if (!token) {
        const client = await firstRow(`clients?id=eq.${clientId}&select=meta_access_token&limit=1`);
        token = client?.meta_access_token?.trim() ?? "";
      }
    }

    if (!token) return json({ error: "Cliente sem token da Meta configurado" }, 409);

    // 4. Chamada. Params do caller nunca podem sobrescrever o token.
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "access_token" || value == null) continue;
      query.set(key, String(value));
    }
    query.set("access_token", token);

    if (mode === "object") {
      const res = await fetch(`${META_BASE}/${path}?${query}`);
      const data = await res.json();
      if (data?.error) return json({ error: data.error.message, metaError: data.error }, 502);
      return json(data);
    }

    // mode "list": a paginacao acontece aqui porque o paging.next da Meta traz o
    // token embutido na URL — devolver isso pro browser recriaria o vazamento.
    const items: unknown[] = [];
    let url: string | undefined = `${META_BASE}/${path}?${query}`;
    let pages = 0;

    while (url && pages < MAX_PAGES) {
      const res = await fetch(url);
      const page = await res.json();
      if (page?.error) return json({ error: page.error.message, metaError: page.error }, 502);
      items.push(...(page.data ?? []));
      url = page.paging?.next;
      pages++;
    }

    return json({ data: items, truncated: pages >= MAX_PAGES && Boolean(url) });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
