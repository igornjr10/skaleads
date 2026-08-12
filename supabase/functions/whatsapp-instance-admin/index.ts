import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, hasAnyRole, isServiceRole, jsonResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Quando a instância trava, o Manager da Evolution manda os comandos e nada
// acontece. Chamar os mesmos endpoints direto contorna a UI.
const ACTIONS = {
  // POST, não PUT: a Evolution v2 trocou o verbo e o v1 responde 404 aqui
  restart: { method: "POST", path: "instance/restart" },
  logout: { method: "DELETE", path: "instance/logout" },
  connect: { method: "GET", path: "instance/connect" },
} as const;

type Action = keyof typeof ACTIONS;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // restart/logout derrubam a sessao da instancia inteira: so o dono da plataforma.
  if (!isServiceRole(req)) {
    const user = await getUser(req);
    if (!user) return jsonResponse(corsHeaders, { error: "Não autenticado" }, 401);
    if (!(await hasAnyRole(user.id, ["owner"]))) {
      return jsonResponse(corsHeaders, { error: "Sem permissão para esta operação" }, 403);
    }
  }


  try {
    const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL");
    const evolutionInstance = Deno.env.get("EVOLUTION_INSTANCE");
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");

    if (!evolutionApiUrl || !evolutionInstance || !evolutionApiKey) {
      throw new Error("EVOLUTION_API_URL / EVOLUTION_INSTANCE / EVOLUTION_API_KEY não configurados");
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action as Action | undefined;

    // Sem default proposital — logout derruba a sessão da instância inteira
    if (!action || !(action in ACTIONS)) {
      throw new Error(`Informe "action" com um destes valores: ${Object.keys(ACTIONS).join(", ")}`);
    }

    const { method, path } = ACTIONS[action];
    const baseUrl = evolutionApiUrl.replace(/\/$/, "");

    const response = await fetch(`${baseUrl}/${path}/${evolutionInstance}`, {
      method,
      headers: { apikey: evolutionApiKey, "Content-Type": "application/json" },
    });

    const raw = await response.text();
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { /* resposta não-JSON */ }

    return new Response(
      JSON.stringify({
        success: response.ok,
        action,
        instance: evolutionInstance,
        httpStatus: response.status,
        response: parsed ?? raw.slice(0, 1000),
      }),
      {
        status: response.ok ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
