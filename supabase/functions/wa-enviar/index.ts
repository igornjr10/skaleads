import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, sendText } from "../_shared/whatsapp.ts";
import { guard, hasAnyRole, jsonResponse } from "../_shared/auth.ts";
import { chaveTelefone, inserir, numeroParaEnvio } from "../_shared/wa-crm.ts";

// Resposta manual de dentro do sistema (caixa de conversas e aba do lead).
// A leitura do lead e da conversa usa o JWT de quem envia: a RLS decide se a
// pessoa pode falar com aquele contato, sem uma segunda regra aqui.

const LIMITE_TEXTO = 4000;

function json(body: unknown, status = 200) {
  return jsonResponse(corsHeaders, body, status);
}

async function comoUsuario<T>(req: Request, path: string): Promise<T> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: anon, Authorization: req.headers.get("Authorization") ?? "" },
  });
  if (!res.ok) throw new Error(`${path.split("?")[0]}: HTTP ${res.status}`);
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const acesso = await guard(req, corsHeaders);
  if (!acesso.ok) return acesso.response;
  const user = acesso.user;
  if (!user) return json({ error: "Envio manual precisa de uma pessoa logada" }, 400);

  try {
    const body = await req.json().catch(() => ({}));
    const texto = String(body.texto ?? "").trim();
    if (!texto) return json({ error: "Mensagem vazia" }, 400);
    if (texto.length > LIMITE_TEXTO) return json({ error: `Mensagem acima de ${LIMITE_TEXTO} caracteres` }, 400);

    let lead: any = null;
    let chave: string | null = null;
    let companyId: string | null = null;

    if (body.lead_id) {
      [lead] = await comoUsuario<any[]>(
        req,
        `crm_leads?id=eq.${encodeURIComponent(body.lead_id)}&select=id,company_id,whatsapp,telefone,wa_chave`
      );
      if (!lead) return json({ error: "Lead não encontrado" }, 404);
      chave = lead.wa_chave;
      companyId = lead.company_id;
      if (!chave) return json({ error: "O lead não tem WhatsApp cadastrado" }, 400);
    } else {
      chave = chaveTelefone(body.chave);
      if (!chave) return json({ error: "Informe o lead ou a conversa" }, 400);
      if (!(await hasAnyRole(user.id, ["owner", "admin", "sdr", "closer", "social_seller"]))) {
        return json({ error: "Só o time comercial responde conversas sem lead" }, 403);
      }
    }

    // O numero que o proprio WhatsApp usou por ultimo e o mais confiavel: o
    // cadastro pode ter o 9 a mais ou a menos que a conta de verdade.
    const [ultima] = await comoUsuario<any[]>(
      req,
      `wa_mensagens?chave=eq.${chave}&telefone=not.is.null&select=telefone,company_id,lead_id&order=enviada_em.desc&limit=1`
    );
    if (!lead && !ultima) return json({ error: "Conversa não encontrada" }, 404);
    companyId = companyId ?? ultima.company_id;
    const numero = numeroParaEnvio(ultima?.telefone ?? lead?.whatsapp ?? lead?.telefone);
    if (!numero) return json({ error: "Número inválido" }, 400);

    const enviado = await sendText(numero, texto);
    const leadId = lead?.id ?? ultima?.lead_id ?? null;

    const [mensagem] = await inserir<any[]>("wa_mensagens", {
      company_id: companyId,
      lead_id: leadId,
      chave,
      telefone: numero,
      messageid: enviado?.messageid ?? enviado?.id ?? null,
      direcao: "saida",
      tipo: "text",
      texto,
      origem: "manual",
      status: enviado?.status ?? "enviada",
      autor_id: user.id,
    });

    if (leadId) {
      await inserir("crm_atividades", {
        lead_id: leadId,
        autor_id: user.id,
        tipo: "mensagem",
        canal: "whatsapp",
        descricao: texto.length > 200 ? `${texto.slice(0, 200)}…` : texto,
      }, false);
    }

    return json({ mensagem });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
