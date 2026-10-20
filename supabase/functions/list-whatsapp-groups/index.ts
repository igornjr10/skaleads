import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, listGroups, remetente } from "../_shared/whatsapp.ts";
import { guard } from "../_shared/auth.ts";

// Grupos do WhatsApp de quem pergunta: e desse numero que sai o que for
// configurado com o grupo (alerta, relatorio, agendamento).

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const acesso = await guard(req, corsHeaders);
  if (!acesso.ok) return acesso.response;

  try {
    if (!acesso.user) throw new Error("Listar grupos precisa de uma pessoa logada");
    const groups = await listGroups(await remetente({ userId: acesso.user.id }));
    return new Response(
      JSON.stringify({ success: true, groups }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
