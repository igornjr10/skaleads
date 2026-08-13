import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, hasAnyRole, isServiceRole, jsonResponse } from "../_shared/auth.ts";
import { listGroups, loadWhatsappConfig } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Lista os grupos da instancia compartilhada: fora do alcance de viewer.
  if (!isServiceRole(req)) {
    const user = await getUser(req);
    if (!user) return jsonResponse(corsHeaders, { error: "Não autenticado" }, 401);
    if (!(await hasAnyRole(user.id, ["owner", "admin"]))) {
      return jsonResponse(corsHeaders, { error: "Sem permissão para esta operação" }, 403);
    }
  }


  try {
    const cfg = await loadWhatsappConfig();
    const groups = await listGroups(cfg);

    return jsonResponse(corsHeaders, { success: true, provider: cfg.provider, groups });
  } catch (err) {
    return jsonResponse(corsHeaders, { error: (err as Error).message }, 500);
  }
});
