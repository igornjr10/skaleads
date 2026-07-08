import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
    const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL")!;
    const evolutionInstance = Deno.env.get("EVOLUTION_INSTANCE")!;
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY")!;

    if (!supabaseUrl || !svcKey || !evolutionApiUrl || !evolutionInstance || !evolutionApiKey) {
      throw new Error("Variáveis de ambiente não configuradas");
    }

    const [client] = await dbGet(
      supabaseUrl, svcKey,
      `clients?id=eq.${client_id}&select=id,name,whatsapp_number,whatsapp_group_jid&limit=1`
    );

    if (!client) throw new Error("Cliente não encontrado");
    const target = client.whatsapp_group_jid || client.whatsapp_number;
    if (!target) throw new Error("Cliente sem número ou grupo de WhatsApp cadastrado");

    const response = await fetch(`${evolutionApiUrl.replace(/\/$/, "")}/message/sendMedia/${evolutionInstance}`, {
      method: "POST",
      headers: {
        apikey: evolutionApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        number: target,
        mediatype: "document",
        mimetype: "application/pdf",
        fileName: file_name,
        caption: caption ?? "",
        media: media_base64,
      }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.message || result.error || "Evolution API error");

    return new Response(
      JSON.stringify({ success: true, message_id: result.key?.id ?? null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
