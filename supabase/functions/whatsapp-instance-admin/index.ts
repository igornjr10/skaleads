import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, hasAnyRole, isServiceRole, jsonResponse } from "../_shared/auth.ts";
import { adminAction, loadWhatsappConfig, type AdminAction } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ACTIONS: AdminAction[] = ["restart", "logout", "connect"];

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
    const body = await req.json().catch(() => ({}));
    const action = body?.action as AdminAction | undefined;

    // Sem default proposital — logout derruba a sessão da instância inteira
    if (!action || !ACTIONS.includes(action)) {
      throw new Error(`Informe "action" com um destes valores: ${ACTIONS.join(", ")}`);
    }

    const cfg = await loadWhatsappConfig();
    const result = await adminAction(cfg, action);

    return jsonResponse(
      corsHeaders,
      {
        success: result.ok,
        provider: cfg.provider,
        action: result.action,
        instance: result.instance,
        httpStatus: result.httpStatus,
        qrcode: result.qrcode,
        paircode: result.paircode,
        response: result.response,
      },
      result.ok ? 200 : 502
    );
  } catch (err) {
    return jsonResponse(corsHeaders, { error: (err as Error).message }, 500);
  }
});
