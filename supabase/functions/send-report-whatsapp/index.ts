import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, sendDocument, sendText } from "../_shared/whatsapp.ts";

interface RequestPayload {
  client_id: string;
  file_name: string;
  media_base64: string;
  caption?: string;
  /** Resumo enviado como mensagem propria, ANTES do PDF. */
  text?: string;
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
    const { client_id, file_name, media_base64, caption, text }: RequestPayload = await req.json();

    if (!client_id || !file_name || !media_base64) {
      throw new Error("client_id, file_name e media_base64 são obrigatórios");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svcKey = Deno.env.get("SVC_ROLE_KEY")!;

    if (!supabaseUrl || !svcKey) {
      throw new Error("Variáveis de ambiente não configuradas");
    }

    const [client] = await dbGet(
      supabaseUrl, svcKey,
      `clients?id=eq.${client_id}&select=id,name,whatsapp_number,whatsapp_group_jid&limit=1`
    );

    if (!client) throw new Error("Cliente não encontrado");
    const target = client.whatsapp_group_jid || client.whatsapp_number;
    if (!target) throw new Error("Cliente sem número ou grupo de WhatsApp cadastrado");

    // O resumo vai como mensagem separada e ANTES do anexo, nao como legenda:
    // no WhatsApp a legenda de documento fica escondida atras do nome do
    // arquivo, e o cliente teria que abrir o PDF para ver qualquer numero.
    let textoEnviado = false;
    if (text?.trim()) {
      await sendText(target, text.trim());
      textoEnviado = true;
    }

    const result = await sendDocument(target, {
      base64: media_base64,
      fileName: file_name,
      caption: caption ?? "",
    });

    return new Response(
      JSON.stringify({
        success: true,
        text_sent: textoEnviado,
        message_id: result?.messageid ?? result?.id ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
