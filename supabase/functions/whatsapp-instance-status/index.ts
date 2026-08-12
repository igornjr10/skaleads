import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, hasAnyRole, isServiceRole, jsonResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Baileys expõe o estado do socket como open/connecting/close.
// "close" significa sessão derrubada — os envios falham com "Connection Closed".
type ConnectionState = "open" | "connecting" | "close" | "unknown";

function describe(state: ConnectionState): string {
  switch (state) {
    case "open":
      return "Instância conectada ao WhatsApp";
    case "connecting":
      return "Instância reconectando — aguarde alguns segundos";
    case "close":
      return "Sessão do WhatsApp caiu. Leia o QR Code novamente no Manager da Evolution para reconectar";
    default:
      return "Estado desconhecido — verifique a instância no Manager da Evolution";
  }
}

// O campo `state` da Evolution fica preso em "open" mesmo depois do socket do
// Baileys morrer — o Manager mostra "Connected" enquanto todo envio falha com
// "Connection Closed". Só uma operação que realmente use o socket revela isso.
async function probeSocket(
  baseUrl: string,
  instance: string,
  apiKey: string,
  ownerJid: string | null
): Promise<{ alive: boolean; error: string | null }> {
  const number = (ownerJid ?? "").split("@")[0];
  if (!number) return { alive: true, error: null };

  try {
    const res = await fetch(`${baseUrl}/chat/whatsappNumbers/${instance}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ numbers: [number] }),
    });

    if (res.ok) return { alive: true, error: null };

    const raw = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { /* resposta não-JSON */ }
    const detail = parsed?.response?.message ?? parsed?.message ?? parsed?.error ?? raw.slice(0, 200);
    const text = typeof detail === "string" ? detail : JSON.stringify(detail);

    return { alive: false, error: text };
  } catch (err) {
    return { alive: false, error: (err as Error).message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Expoe o estado da instancia compartilhada: fora do alcance de viewer.
  if (!isServiceRole(req)) {
    const user = await getUser(req);
    if (!user) return jsonResponse(corsHeaders, { error: "Não autenticado" }, 401);
    if (!(await hasAnyRole(user.id, ["owner", "admin"]))) {
      return jsonResponse(corsHeaders, { error: "Sem permissão para esta operação" }, 403);
    }
  }


  try {
    const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL");
    const evolutionInstance = Deno.env.get("EVOLUTION_INSTANCE");
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");

    if (!evolutionApiUrl || !evolutionInstance || !evolutionApiKey) {
      throw new Error("EVOLUTION_API_URL / EVOLUTION_INSTANCE / EVOLUTION_API_KEY não configurados");
    }

    const baseUrl = evolutionApiUrl.replace(/\/$/, "");

    const response = await fetch(`${baseUrl}/instance/connectionState/${evolutionInstance}`, {
      headers: { apikey: evolutionApiKey },
    });

    const raw = await response.text();
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { /* resposta não-JSON */ }

    if (!response.ok) {
      const detail = parsed?.response?.message ?? parsed?.message ?? parsed?.error ?? raw.slice(0, 300);
      throw new Error(
        `Evolution API respondeu ${response.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`
      );
    }

    const state: ConnectionState = parsed?.instance?.state ?? parsed?.state ?? "unknown";

    // Dados do número conectado — melhor esforço, não bloqueia o status
    let ownerJid: string | null = null;
    let profileName: string | null = null;
    try {
      const infoRes = await fetch(
        `${baseUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(evolutionInstance)}`,
        { headers: { apikey: evolutionApiKey } }
      );
      if (infoRes.ok) {
        const info = await infoRes.json();
        const entry = Array.isArray(info) ? info[0] : info;
        const inst = entry?.instance ?? entry;
        ownerJid = inst?.ownerJid ?? inst?.owner ?? null;
        profileName = inst?.profileName ?? null;
      }
    } catch { /* informativo apenas */ }

    const probe = state === "open"
      ? await probeSocket(baseUrl, evolutionInstance, evolutionApiKey, ownerJid)
      : { alive: false, error: null };

    const staleState = state === "open" && !probe.alive;

    return new Response(
      JSON.stringify({
        success: true,
        instance: evolutionInstance,
        state,
        socketAlive: probe.alive,
        staleState,
        connected: state === "open" && probe.alive,
        message: staleState
          ? `A Evolution reporta "open" mas o socket não responde (${probe.error ?? "erro desconhecido"}). Clique em RESTART no Manager da Evolution; se persistir, refaça a leitura do QR Code`
          : describe(state),
        ownerJid,
        profileName,
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
