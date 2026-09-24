import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, instanceStatus } from "../_shared/whatsapp.ts";

// A tela fala o vocabulario do Baileys (open/connecting/close), herdado da
// Evolution. A uazapi diz connected/connecting/disconnected. Traduzir aqui sai
// mais barato que mexer no contrato da tela.
type ConnectionState = "open" | "connecting" | "close" | "unknown";

function toState(status: string | undefined): ConnectionState {
  switch (status) {
    case "connected": return "open";
    case "connecting": return "connecting";
    case "disconnected": return "close";
    default: return "unknown";
  }
}

function describe(state: ConnectionState, reason: string | null): string {
  switch (state) {
    case "open":
      return "Instancia conectada ao WhatsApp";
    case "connecting":
      return "Instancia reconectando — aguarde alguns segundos";
    case "close":
      return reason
        ? `Sessao do WhatsApp caiu (${reason}). Gere o QR Code novamente para reconectar`
        : "Sessao do WhatsApp caiu. Gere o QR Code novamente para reconectar";
    default:
      return "Estado desconhecido — verifique a instancia no painel da uazapi";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const result = await instanceStatus();
    const inst = result?.instance ?? result;
    const state = toState(inst?.status);
    const reason = inst?.lastDisconnectReason || null;

    return new Response(
      JSON.stringify({
        success: true,
        instance: inst?.name ?? "",
        state,
        // A uazapi rastreia a propria sessao e nao mente sobre o estado como a
        // Evolution mentia, entao o probe de socket saiu. Os campos ficam para
        // a tela continuar funcionando sem mudanca.
        socketAlive: state === "open",
        staleState: false,
        connected: state === "open",
        message: describe(state, reason),
        ownerJid: inst?.owner || null,
        profileName: inst?.profileName || null,
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
