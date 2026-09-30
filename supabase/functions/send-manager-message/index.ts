import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, sendText } from "../_shared/whatsapp.ts";
import { getUser, isServiceRole } from "../_shared/auth.ts";

interface RequestPayload {
  targets: string[];
  text: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // A versao no ar ja exigia sessao, mas essa checagem nunca existiu no repo:
    // sem ela, deployar daqui abriria o disparo de WhatsApp para qualquer um
    // com a anon key, que e publica e vai no bundle do frontend.
    if (!isServiceRole(req) && !(await getUser(req))) throw new Error("Nao autenticado");

    const { targets, text }: RequestPayload = await req.json();
    if (!targets || targets.length === 0) throw new Error("Selecione ao menos um destino");
    if (!text || !text.trim()) throw new Error("Mensagem vazia");

    const errors: string[] = [];
    let sentCount = 0;

    for (const target of targets) {
      try {
        await sendText(target, text);
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
    const message = (err as Error).message;
    return new Response(JSON.stringify({ error: message }), {
      status: message === "Nao autenticado" ? 401 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
