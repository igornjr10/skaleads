// Provedor de WhatsApp: uazapi (substituiu a Evolution em 16/09/2026).
//
// Diferenca estrutural que motivou este modulo: na Evolution a instancia ia no
// path e a chave no header `apikey`; na uazapi a instancia E o token, some da
// URL, e o header chama `token`. Antes disso a URL do provedor estava repetida
// em nove functions.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function whatsappConfig() {
  const baseUrl = Deno.env.get("UAZAPI_URL");
  const token = Deno.env.get("UAZAPI_TOKEN");
  if (!baseUrl || !token) throw new Error("UAZAPI_URL / UAZAPI_TOKEN nao configurados");
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

async function call(path: string, init: RequestInit = {}): Promise<any> {
  const { baseUrl, token } = whatsappConfig();

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { token, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

  const raw = await response.text();
  let parsed: any = null;
  try { parsed = JSON.parse(raw); } catch { /* resposta nao-JSON */ }

  if (!response.ok) {
    // uazapi erra como {error:true, message:"..."}; 503 = sessao caida
    const detail = parsed?.message ?? parsed?.error ?? raw.slice(0, 300);
    throw new Error(
      `uazapi respondeu ${response.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`
    );
  }

  return parsed ?? raw;
}

// Destino especial de alerta: "todos os gestores ativos".
//
// `channels.whatsappTarget` e um campo de texto so, e virar array obrigaria a
// migrar o formato de channels em todo alerta ja salvo. Guardar um sentinela e
// resolver na hora do envio custa uma consulta e nao mexe no que existe.
//
// O mesmo literal vive em `src/lib/alert-engine.ts` (ALL_MANAGERS_TARGET):
// Deno nao importa de `src/`, entao os dois precisam andar juntos.
export const ALL_MANAGERS = "all_managers";

/** Numeros que devem receber a mensagem. Vazio significa "nao ha para quem enviar". */
export async function resolveTargets(target: string | null | undefined): Promise<string[]> {
  if (target !== ALL_MANAGERS) return target ? [target] : [];

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SVC_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SVC_ROLE_KEY nao configurados");

  const res = await fetch(
    `${url}/rest/v1/managers?is_active=eq.true&whatsapp_number=not.is.null&select=whatsapp_number`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) throw new Error(`Nao consegui ler os gestores (${res.status})`);

  const rows = await res.json();
  // Dedup: dois gestores cadastrados com o mesmo numero receberiam duas vezes.
  return [...new Set((rows ?? []).map((r: any) => r.whatsapp_number).filter(Boolean) as string[])];
}

export function sendText(number: string, text: string) {
  return call("/send/text", { method: "POST", body: JSON.stringify({ number, text }) });
}

export function sendDocument(
  number: string,
  opts: { base64: string; fileName: string; caption?: string; mimetype?: string }
) {
  const mime = opts.mimetype ?? "application/pdf";
  // A Evolution recebia base64 cru no campo `media`; a uazapi quer data URI em
  // `file`. Se o servidor recusar, o plano B e subir o PDF no Storage e mandar
  // a URL publica aqui — o campo aceita os dois.
  const file = opts.base64.startsWith("data:") ? opts.base64 : `data:${mime};base64,${opts.base64}`;
  return call("/send/media", {
    method: "POST",
    body: JSON.stringify({ number, type: "document", file, docName: opts.fileName, text: opts.caption ?? "" }),
  });
}

export interface WhatsappGroup {
  id: string;
  subject: string;
  size: number;
  pictureUrl: string | null;
}

export async function listGroups(): Promise<WhatsappGroup[]> {
  const result = await call("/group/list", { method: "POST", body: JSON.stringify({}) });
  const list = Array.isArray(result) ? result : result?.groups;
  if (!Array.isArray(list)) {
    throw new Error(`uazapi respondeu 200 mas sem lista de grupos: ${JSON.stringify(result).slice(0, 400)}`);
  }
  return list.map((g: any) => ({
    id: g.id ?? g.JID ?? g.jid,
    subject: g.subject ?? g.name ?? g.Name ?? "(sem nome)",
    size: g.size ?? g.participantsCount ?? 0,
    pictureUrl: g.pictureUrl ?? g.profilePicUrl ?? null,
  }));
}

export function instanceStatus() {
  return call("/instance/status");
}

// A uazapi nao tem restart — connect reconecta e, se precisar, devolve QR novo.
export function instanceConnect() {
  return call("/instance/connect", { method: "POST", body: JSON.stringify({}) });
}

export function instanceDisconnect() {
  return call("/instance/disconnect", { method: "POST", body: JSON.stringify({}) });
}
