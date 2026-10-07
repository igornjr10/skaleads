import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, downloadMedia } from "../_shared/whatsapp.ts";
import { guard, isUuid, jsonResponse } from "../_shared/auth.ts";

// Audio, imagem, video e documento da caixa de conversas. A mensagem e lida
// com o JWT de quem pede: se a RLS nao deixa ver a conversa, nao ha midia.
// Nada e guardado: a URL da uazapi vale 2 dias e a tela pede de novo.

function json(body: unknown, status = 200) {
  return jsonResponse(corsHeaders, body, status);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const acesso = await guard(req, corsHeaders);
  if (!acesso.ok) return acesso.response;

  try {
    const { id } = await req.json().catch(() => ({}));
    if (!isUuid(id)) return json({ error: "id inválido" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const res = await fetch(`${url}/rest/v1/wa_mensagens?id=eq.${id}&select=messageid`, {
      headers: { apikey: anon, Authorization: req.headers.get("Authorization") ?? "" },
    });
    const [mensagem] = res.ok ? await res.json() : [];
    if (!mensagem) return json({ error: "Mensagem não encontrada" }, 404);
    if (!mensagem.messageid) return json({ error: "Mensagem sem arquivo" }, 404);

    return json(await downloadMedia(mensagem.messageid));
  } catch (err) {
    return json({ error: (err as Error).message }, 502);
  }
});
