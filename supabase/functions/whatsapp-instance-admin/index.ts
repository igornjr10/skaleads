import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, instanceConnect, instanceDisconnect } from "../_shared/whatsapp.ts";

// A uazapi nao tem restart: connect e a unica primitiva de religar, e devolve o
// QR quando a sessao precisa ser pareada de novo. "restart" continua aqui como
// apelido para nao quebrar a tela de Configuracoes.
const ACTIONS = {
  restart: instanceConnect,
  connect: instanceConnect,
  logout: instanceDisconnect,
  disconnect: instanceDisconnect,
} as const;

type Action = keyof typeof ACTIONS;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
