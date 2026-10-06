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

export class SemInstancia extends Error {
  constructor() {
    super("Nenhuma instancia do WhatsApp criada ainda. Clique em Gerar QR Code para criar e conectar");
  }
}

function baseUrl() {
  const url = Deno.env.get("UAZAPI_URL");
  if (!url) throw new Error("UAZAPI_URL nao configurado");
  return url.replace(/\/$/, "");
}

function banco() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SVC_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SVC_ROLE_KEY nao configurados");
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" } };
}

async function tokenSalvo(): Promise<string | null> {
  const { url, headers } = banco();
  const res = await fetch(`${url}/rest/v1/wa_instancia?select=token&limit=1`, { headers });
  if (!res.ok) throw new Error(`Nao consegui ler wa_instancia (${res.status})`);
  const rows = await res.json();
  return rows?.[0]?.token ?? null;
}

// A instancia criada pelo app (wa_instancia) vale mais que o UAZAPI_TOKEN:
// o secret sobra como caminho para quem ainda cola o token a mao.
export async function tokenDaInstancia(): Promise<string | null> {
  return (await tokenSalvo()) ?? Deno.env.get("UAZAPI_TOKEN")?.trim() ?? null;
}

export async function whatsappConfig() {
  const token = await tokenDaInstancia();
  if (!token) throw new SemInstancia();
  return { baseUrl: baseUrl(), token };
}

export async function whatsappConfigurado(): Promise<boolean> {
  if (!Deno.env.get("UAZAPI_URL")) return false;
  return !!(await tokenDaInstancia().catch(() => null));
}

/** Cria a instancia com o admintoken na primeira conexao. Devolve true se criou agora. */
// So olha wa_instancia: um UAZAPI_TOKEN de servidor antigo nao pode impedir a criacao.
export async function garantirInstancia(): Promise<boolean> {
  if (await tokenSalvo()) return false;

  const admin = Deno.env.get("UAZAPI_ADMIN_TOKEN")?.trim();
  if (!admin) throw new Error("UAZAPI_ADMIN_TOKEN nao configurado");
  const nome = Deno.env.get("UAZAPI_INSTANCIA")?.trim() || "midsam";

  const res = await fetch(`${baseUrl()}/instance/create`, {
    method: "POST",
    headers: { admintoken: admin, "Content-Type": "application/json" },
    body: JSON.stringify({ name: nome }),
  });
  const raw = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(raw); } catch { /* resposta nao-JSON */ }
  if (!res.ok) {
    throw new Error(`uazapi recusou criar a instancia (${res.status}): ${parsed?.message ?? parsed?.error ?? raw.slice(0, 300)}`);
  }
  const token = parsed?.token ?? parsed?.instance?.token;
  if (!token) throw new Error(`uazapi criou a instancia mas nao devolveu token: ${raw.slice(0, 300)}`);

  const { url, headers } = banco();
  const salvo = await fetch(`${url}/rest/v1/wa_instancia`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: true, nome, token }),
  });
  if (!salvo.ok) throw new Error(`Instancia criada na uazapi, mas nao consegui salvar o token (${salvo.status})`);
  return true;
}

async function call(path: string, init: RequestInit = {}): Promise<any> {
  const { baseUrl, token } = await whatsappConfig();

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

/**
 * Numeros que devem receber a mensagem. Vazio significa "nao ha para quem enviar".
 * "Todos os gestores" e da empresa do alerta: sem empresa nao ha para quem enviar,
 * senao o gestor de uma agencia recebe o alerta do cliente de outra.
 */
export async function resolveTargets(
  target: string | null | undefined,
  companyId?: string | null
): Promise<string[]> {
  if (target !== ALL_MANAGERS) return target ? [target] : [];
  if (!companyId) return [];

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SVC_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SVC_ROLE_KEY nao configurados");

  const res = await fetch(
    `${url}/rest/v1/managers?is_active=eq.true&whatsapp_number=not.is.null&company_id=eq.${companyId}&select=whatsapp_number`,
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

// /group/list e paginado: so a primeira pagina cortava a lista de quem tem
// muitos grupos. O teto de paginas protege contra hasMore que nunca desliga.
const GRUPOS_POR_PAGINA = 100;
const MAX_PAGINAS = 50;

export async function listGroups(): Promise<WhatsappGroup[]> {
  const porId = new Map<string, WhatsappGroup>();
  let offset = 0;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const result = await call("/group/list", {
      method: "POST",
      body: JSON.stringify({ limit: GRUPOS_POR_PAGINA, offset, noParticipants: true }),
    });
    const list = Array.isArray(result) ? result : result?.groups;
    if (!Array.isArray(list)) {
      throw new Error(`uazapi respondeu 200 mas sem lista de grupos: ${JSON.stringify(result).slice(0, 400)}`);
    }

    // Grupo novo chegando no meio da paginacao desloca a lista e repete item.
    for (const g of list) {
      const id = g.id ?? g.JID ?? g.jid;
      if (!id || porId.has(id)) continue;
      porId.set(id, {
        id,
        subject: g.subject ?? g.name ?? g.Name ?? "(sem nome)",
        size: g.size ?? g.participantsCount ?? 0,
        pictureUrl: g.pictureUrl ?? g.profilePicUrl ?? null,
      });
    }

    const paginacao = Array.isArray(result) ? null : result?.pagination;
    if (!paginacao?.hasMore || list.length === 0) break;
    offset = paginacao.nextOffset ?? offset + list.length;
  }

  return [...porId.values()];
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

/**
 * Liga o webhook da instancia no modo simples (um so, cria ou atualiza).
 * wasSentByApi fica de fora: o que o sistema envia ja e gravado por quem
 * enviou, e voltaria duplicado. Grupo tambem: a caixa e de conversa com lead.
 */
export function configureWebhook(url: string) {
  return call("/webhook", {
    method: "POST",
    body: JSON.stringify({
      url,
      enabled: true,
      events: ["messages", "messages_update"],
      excludeMessages: ["wasSentByApi", "isGroupYes"],
    }),
  });
}

export function getWebhook() {
  return call("/webhook");
}
