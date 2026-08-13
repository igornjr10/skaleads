import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, hasAnyRole, isServiceRole, jsonResponse } from "../_shared/auth.ts";
import { loadWhatsappConfig, sendText } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestPayload {
  targets: string[];
  text: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Dispara WhatsApp para os gestores: fora do alcance de viewer.
  if (!isServiceRole(req)) {
    const user = await getUser(req);
    if (!user) return jsonResponse(corsHeaders, { error: "Não autenticado" }, 401);
    if (!(await hasAnyRole(user.id, ["owner", "admin"]))) {
      return jsonResponse(corsHeaders, { error: "Sem permissão para esta operação" }, 403);
    }
  }


  try {
    const { targets, text }: RequestPayload = await req.json();

    if (!targets || targets.length === 0) throw new Error("Selecione ao menos um destino");
    if (!text || !text.trim()) throw new Error("Mensagem vazia");

    const cfg = await loadWhatsappConfig();

    const errors: string[] = [];
    let sentCount = 0;

    for (const target of targets) {
      try {
        await sendText(cfg, target, text);
        sentCount++;
      } catch (err) {
        errors.push(`${target}: ${(err as Error).message}`);
      }
    }

    if (sentCount === 0) throw new Error(errors.join("; "));

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, total: targets.length, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
