import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, ownsClient, isServiceRole, jsonResponse } from "../_shared/auth.ts";
import { loadWhatsappConfig, sendDocument } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestPayload {
  client_id: string;
  file_name: string;
  media_base64: string;
  caption?: string;
}

function dbGet(supabaseUrl: string, svcKey: string, path: string) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      "Content-Type": "application/json",
    },
  }).then(r => r.json());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { client_id, file_name, media_base64, caption }: RequestPayload = await req.json();

    if (!client_id || !file_name || !media_base64) {
      throw new Error("client_id, file_name e media_base64 são obrigatórios");
    }

    // service_role ignora RLS: a carteira do usuario e checada aqui. O
    // run-report-schedules chama esta function com a propria service key —
    // nesse caminho nao ha usuario e o agendamento ja definiu o cliente.
    if (!isServiceRole(req)) {
      const user = await getUser(req);
      if (!user) return jsonResponse(corsHeaders, { error: "Não autenticado" }, 401);
      if (!(await ownsClient(user.id, client_id))) {
        return jsonResponse(corsHeaders, { error: "Cliente não encontrado na sua carteira" }, 404);
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svcKey = Deno.env.get("SVC_ROLE_KEY")!;

    if (!supabaseUrl || !svcKey) {
      throw new Error("Variáveis de ambiente não configuradas");
    }

    const cfg = await loadWhatsappConfig();

    const [client] = await dbGet(
      supabaseUrl, svcKey,
      `clients?id=eq.${client_id}&select=id,name,whatsapp_number,whatsapp_group_jid&limit=1`
    );

    if (!client) throw new Error("Cliente não encontrado");
    const target = client.whatsapp_group_jid || client.whatsapp_number;
    if (!target) throw new Error("Cliente sem número ou grupo de WhatsApp cadastrado");

    const { messageId } = await sendDocument(cfg, {
      to: target,
      base64: media_base64,
      fileName: file_name,
      caption: caption ?? "",
    });

    return new Response(
      JSON.stringify({ success: true, message_id: messageId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
