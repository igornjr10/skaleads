import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  instanceStatus,
  instanciaDoUsuario,
  instanciaPorId,
  registrarEstado,
  SemInstancia,
} from "../_shared/whatsapp.ts";
import { companyIdsOf, guard, hasAnyRole, isUuid, jsonResponse } from "../_shared/auth.ts";

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
      return "WhatsApp conectado";
    case "connecting":
      return "Reconectando — aguarde alguns segundos";
    case "close":
      return reason
        ? `Sessão do WhatsApp caiu (${reason}). Gere o QR Code novamente para reconectar`
        : "Sessão do WhatsApp caiu. Gere o QR Code novamente para reconectar";
    default:
      return "Estado desconhecido — verifique a instância no painel da uazapi";
  }
}

function json(body: unknown, status = 200) {
  return jsonResponse(corsHeaders, body, status);
}

const desconectado = (message: string, instanciaId: string | null = null) => ({
  success: true, instance: "", instancia_id: instanciaId, state: "close", socketAlive: false, staleState: false,
  connected: false, message, ownerJid: null, profileName: null,
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const acesso = await guard(req, corsHeaders);
  if (!acesso.ok) return acesso.response;
  const user = acesso.user;
  if (!user) return json({ error: "Status do WhatsApp precisa de uma pessoa logada" }, 400);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    let inst;
    if (body?.instancia_id) {
      if (!isUuid(body.instancia_id)) return json({ error: "instancia_id inválido" }, 400);
      inst = await instanciaPorId(body.instancia_id);
      const pode = inst && (inst.user_id === user.id
        || ((await companyIdsOf(user.id)).includes(inst.company_id) && await hasAnyRole(user.id, ["owner", "admin"])));
      if (!pode) return json({ error: "Número não encontrado" }, 404);
    } else {
      inst = await instanciaDoUsuario(user.id);
    }
    // Ainda sem instancia nao e erro: a tela mostra "desconectado" e o botao de QR cria.
    if (!inst) return json(desconectado(new SemInstancia().message));

    const result = await instanceStatus(inst!);
    const dados = result?.instance ?? result;
    const state = toState(dados?.status);
    const reason = dados?.lastDisconnectReason || null;
    const ownerJid: string | null = dados?.owner || null;
    const profileName: string | null = dados?.profileName || null;

    await registrarEstado(inst!, {
      conectado: state === "open",
      ...(state === "open" ? { numero: ownerJid?.split("@")[0] ?? null, perfil_nome: profileName } : {}),
    });

    return json({
      success: true,
      instance: dados?.name ?? inst!.nome,
      instancia_id: inst!.id,
      state,
      socketAlive: state === "open",
      staleState: false,
      connected: state === "open",
      message: describe(state, reason),
      ownerJid,
      profileName,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
