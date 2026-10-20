import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  configureWebhook,
  corsHeaders,
  garantirInstancia,
  getWebhook,
  instanceConnect,
  instanceDisconnect,
  instanciaDoUsuario,
  instanciaPorId,
  registrarEstado,
  removerInstancia,
  SemInstancia,
  type Instancia,
} from "../_shared/whatsapp.ts";
import { companyIdsOf, guard, hasAnyRole, isUuid, jsonResponse } from "../_shared/auth.ts";

// Cada pessoa conecta o proprio WhatsApp. Sem `instancia_id` a acao e sobre o
// numero de quem chama; com ele, so o ADM da mesma empresa age sobre o numero
// de outra pessoa, e nunca para conectar: o QR tem de ser lido no celular dela.
//
// A uazapi nao tem restart: connect e a unica primitiva de religar, e devolve o
// QR quando a sessao precisa ser pareada de novo. "restart" continua como apelido.

const webhookUrl = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/wa-webhook`;

const SO_DO_DONO = new Set(["connect", "restart"]);
const ACOES = new Set(["connect", "restart", "logout", "disconnect", "webhook", "webhook_status", "remover"]);

function json(body: unknown, status = 200) {
  return jsonResponse(corsHeaders, body, status);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const acesso = await guard(req, corsHeaders);
  if (!acesso.ok) return acesso.response;
  const user = acesso.user;
  if (!user) return json({ error: "Conectar WhatsApp precisa de uma pessoa logada" }, 400);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    // Sem default proposital: disconnect derruba a sessao do numero.
    if (!ACOES.has(action)) {
      return json({ error: `Informe "action" com um destes valores: ${[...ACOES].join(", ")}` }, 400);
    }

    const empresas = await companyIdsOf(user.id);
    let inst: Instancia | null;

    if (body?.instancia_id && body.instancia_id !== "proprio") {
      if (!isUuid(body.instancia_id)) return json({ error: "instancia_id inválido" }, 400);
      inst = await instanciaPorId(body.instancia_id);
      const ehDono = inst?.user_id === user.id;
      if (!inst || (!ehDono && !(empresas.includes(inst.company_id) && await hasAnyRole(user.id, ["owner", "admin"])))) {
        return json({ error: "Número não encontrado" }, 404);
      }
      if (!ehDono && SO_DO_DONO.has(action)) {
        return json({ error: "Só a própria pessoa conecta o número dela (o QR é lido no celular dela)" }, 403);
      }
    } else if (SO_DO_DONO.has(action)) {
      if (!empresas.length) return json({ error: "Seu usuário não está em nenhuma empresa" }, 400);
      const garantida = await garantirInstancia(user.id, empresas[0], user.email?.split("@")[0] ?? "usuario");
      inst = garantida.inst;
      // Instancia nova sem webhook conecta mas nao recebe nada na caixa.
      if (garantida.criada) await configureWebhook(inst, webhookUrl());
    } else {
      inst = await instanciaDoUsuario(user.id);
      if (!inst) throw new SemInstancia();
    }

    let result: any;
    if (SO_DO_DONO.has(action)) result = await instanceConnect(inst);
    else if (action === "logout" || action === "disconnect") {
      result = await instanceDisconnect(inst);
      await registrarEstado(inst, { conectado: false });
    } else if (action === "webhook") result = await configureWebhook(inst, webhookUrl());
    else if (action === "webhook_status") result = await getWebhook(inst);
    else {
      await removerInstancia(inst);
      result = { removida: true };
    }

    // A tela le `response.qrcode.base64` / `.pairingCode`, formato herdado da
    // Evolution. A uazapi devolve as duas coisas soltas dentro de `instance`.
    const dados = result?.instance ?? result;
    const response = {
      ...result,
      qrcode: { base64: dados?.qrcode || null, pairingCode: dados?.paircode || null },
    };

    return json({ success: true, action, instancia_id: inst.id, response });
  } catch (err) {
    const status = err instanceof SemInstancia ? 404 : 500;
    return json({ error: (err as Error).message }, status);
  }
});
