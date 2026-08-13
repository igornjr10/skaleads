import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, hasAnyRole, isServiceRole, jsonResponse } from "../_shared/auth.ts";
import { getStatus, loadWhatsappConfig } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// O token da Uazapi entra por aqui e nunca mais sai: o GET devolve so os quatro
// ultimos digitos, o suficiente para a tela confirmar qual credencial esta ativa
// sem reexpor o segredo a cada carregamento da pagina.
const WRITABLE_KEYS = ["whatsapp_provider", "uazapi_base_url", "uazapi_token", "uazapi_admin_token"] as const;
const SECRET_KEYS = new Set(["uazapi_token", "uazapi_admin_token"]);

type ConfigKey = typeof WRITABLE_KEYS[number];

function db(path: string, init: RequestInit = {}) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
  if (!supabaseUrl || !svcKey) throw new Error("SUPABASE_URL / SVC_ROLE_KEY não configurados");
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function mask(value: string): string {
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

async function readConfig(): Promise<Record<string, string>> {
  const inList = WRITABLE_KEYS.map(k => `"${k}"`).join(",");
  const rows = await db(`app_config?key=in.(${inList})&select=key,value`).then(r => r.json());
  const out: Record<string, string> = {};
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (row?.key && typeof row.value === "string") out[row.key] = row.value;
    }
  }
  return out;
}

async function writeConfig(key: ConfigKey, value: string) {
  const res = await db("app_config?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Falha ao gravar ${key}: ${(await res.text()).slice(0, 300)}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Credenciais da plataforma inteira: so o dono mexe.
  if (!isServiceRole(req)) {
    const user = await getUser(req);
    if (!user) return jsonResponse(corsHeaders, { error: "Não autenticado" }, 401);
    if (!(await hasAnyRole(user.id, ["owner"]))) {
      return jsonResponse(corsHeaders, { error: "Sem permissão para esta operação" }, 403);
    }
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body?.action ?? "get";

    if (action === "get") {
      const cfg = await readConfig();
      const evolutionReady = Boolean(
        Deno.env.get("EVOLUTION_API_URL") &&
        Deno.env.get("EVOLUTION_INSTANCE") &&
        Deno.env.get("EVOLUTION_API_KEY")
      );

      return jsonResponse(corsHeaders, {
        success: true,
        provider: cfg.whatsapp_provider === "uazapi" ? "uazapi" : "evolution",
        evolution: { configured: evolutionReady, instance: Deno.env.get("EVOLUTION_INSTANCE") ?? null },
        uazapi: {
          baseUrl: cfg.uazapi_base_url ?? "",
          tokenMask: cfg.uazapi_token ? mask(cfg.uazapi_token) : null,
          adminTokenMask: cfg.uazapi_admin_token ? mask(cfg.uazapi_admin_token) : null,
          configured: Boolean(cfg.uazapi_base_url && cfg.uazapi_token),
        },
      });
    }

    if (action === "save") {
      const updates: Array<[ConfigKey, string]> = [];

      if (typeof body.provider === "string") {
        if (body.provider !== "evolution" && body.provider !== "uazapi") {
          throw new Error('provider deve ser "evolution" ou "uazapi"');
        }
        updates.push(["whatsapp_provider", body.provider]);
      }

      if (typeof body.baseUrl === "string" && body.baseUrl.trim()) {
        const url = body.baseUrl.trim().replace(/\/$/, "");
        if (!/^https?:\/\//i.test(url)) throw new Error("A URL da Uazapi precisa começar com https://");
        updates.push(["uazapi_base_url", url]);
      }

      // Campo em branco = "manter o que ja esta gravado": a tela mostra so a
      // mascara, entao um save sem redigitar o token nao pode apaga-lo.
      if (typeof body.token === "string" && body.token.trim()) {
        updates.push(["uazapi_token", body.token.trim()]);
      }
      if (typeof body.adminToken === "string" && body.adminToken.trim()) {
        updates.push(["uazapi_admin_token", body.adminToken.trim()]);
      }

      if (updates.length === 0) throw new Error("Nada para salvar");

      // Trocar o provedor ativo para uma Uazapi sem credencial derrubaria todos
      // os envios em silencio — barra antes de gravar.
      const target = updates.find(([k]) => k === "whatsapp_provider")?.[1];
      if (target === "uazapi") {
        const current = await readConfig();
        const baseUrl = updates.find(([k]) => k === "uazapi_base_url")?.[1] ?? current.uazapi_base_url;
        const token = updates.find(([k]) => k === "uazapi_token")?.[1] ?? current.uazapi_token;
        if (!baseUrl || !token) {
          throw new Error("Cadastre a URL e o token da Uazapi antes de ativá-la");
        }
      }

      for (const [key, value] of updates) await writeConfig(key, value);

      return jsonResponse(corsHeaders, {
        success: true,
        saved: updates.map(([k]) => (SECRET_KEYS.has(k) ? `${k} (oculto)` : k)),
      });
    }

    // Testa a credencial ativa batendo no provedor de verdade — a tela usa isso
    // para nao deixar o usuario descobrir que errou o token so no primeiro envio.
    if (action === "test") {
      const cfg = await loadWhatsappConfig();
      const status = await getStatus(cfg);
      return jsonResponse(corsHeaders, { success: true, provider: cfg.provider, status });
    }

    throw new Error('action inválida: use "get", "save" ou "test"');
  } catch (err) {
    return jsonResponse(corsHeaders, { error: (err as Error).message }, 500);
  }
});
