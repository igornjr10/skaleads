import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { configureWebhook, corsHeaders, garantirInstancia, getWebhook, instanceConnect, instanceDisconnect } from "../_shared/whatsapp.ts";
import { guard } from "../_shared/auth.ts";

// A uazapi nao tem restart: connect e a unica primitiva de religar, e devolve o
// QR quando a sessao precisa ser pareada de novo. "restart" continua aqui como
// apelido para nao quebrar a tela de Configuracoes.
const ligarWebhook = () => configureWebhook(`${Deno.env.get("SUPABASE_URL")}/functions/v1/wa-webhook`);

// Primeira conexao cria a instancia com o admintoken e ja liga a caixa de
// conversas — sem isso a instancia nova conecta mas nao recebe nada.
async function conectar() {
  if (await garantirInstancia()) await ligarWebhook();
  return instanceConnect();
}

const ACTIONS = {
  restart: conectar,
  connect: conectar,
  logout: instanceDisconnect,
  disconnect: instanceDisconnect,
  // Liga a caixa de conversas: a uazapi passa a mandar cada mensagem para wa-webhook.
  webhook: ligarWebhook,
  webhook_status: getWebhook,
} as const;

type Action = keyof typeof ACTIONS;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const acesso = await guard(req, corsHeaders, { roles: ["owner", "admin"] });
  if (!acesso.ok) return acesso.response;

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action as Action | undefined;

    // Sem default proposital — disconnect derruba a sessao da instancia inteira
    if (!action || !(action in ACTIONS)) {
      throw new Error(`Informe "action" com um destes valores: ${Object.keys(ACTIONS).join(", ")}`);
    }

    const result = await ACTIONS[action]();

    // A tela le `response.qrcode.base64` / `.pairingCode`, formato herdado da
    // Evolution. A uazapi devolve as duas coisas soltas dentro de `instance`,
    // entao a normalizacao fica aqui e o frontend nao precisa saber do provedor.
    const inst = result?.instance ?? result;
    const response = {
      ...result,
      qrcode: { base64: inst?.qrcode || null, pairingCode: inst?.paircode || null },
    };

    return new Response(
      JSON.stringify({ success: true, action, response }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
