import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, remetente, sendText } from "../_shared/whatsapp.ts";
import { getUser, isServiceRole } from "../_shared/auth.ts";

interface RequestPayload {
  targets: string[];
  text: string;
  /** Chamada interna: em nome de quem sai. Sem ele, o numero padrao da empresa. */
  remetente_id?: string;
  company_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // A versao no ar ja exigia sessao, mas essa checagem nunca existiu no repo:
    // sem ela, deployar daqui abriria o disparo de WhatsApp para qualquer um
    // com a anon key, que e publica e vai no bundle do frontend.
    const interna = isServiceRole(req);
    const user = interna ? null : await getUser(req);
    if (!interna && !user) throw new Error("Nao autenticado");

    const { targets, text, remetente_id, company_id }: RequestPayload = await req.json();
    // Pessoa logada fala sempre do proprio numero; so chamada interna escolhe.
    const inst = user
      ? await remetente({ userId: user.id })
      : await remetente({ userId: remetente_id ?? null, companyId: company_id ?? null });
    if (!targets || targets.length === 0) throw new Error("Selecione ao menos um destino");
    if (!text || !text.trim()) throw new Error("Mensagem vazia");

    const errors: string[] = [];
    let sentCount = 0;

    for (const target of targets) {
      try {
        await sendText(inst, target, text);
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
