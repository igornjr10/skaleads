// Provedor de WhatsApp: uazapi (substituiu a Evolution em 16/09/2026).
// Desde 20/10/2026 cada usuario tem a propria instancia: toda chamada recebe de qual numero sai.
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
  constructor(message = "Você ainda não conectou seu WhatsApp. Vá em Configurações > WhatsApp e gere o QR Code") {
    super(message);
  }
}

/** Um numero conectado: cada usuario tem o seu (wa_instancias). */
export interface Instancia {
  id: string;
  company_id: string;
  user_id: string;
  nome: string;
  token: string;
  padrao: boolean;
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

const CAMPOS = "id,company_id,user_id,nome,token,padrao";

async function lerInstancias(filtro: string): Promise<Instancia[]> {
  const { url, headers } = banco();
  const res = await fetch(`${url}/rest/v1/wa_instancias?${filtro}&select=${CAMPOS}`, { headers });
  if (!res.ok) throw new Error(`Nao consegui ler wa_instancias (${res.status})`);
  return await res.json();
}

export async function instanciaDoUsuario(userId: string): Promise<Instancia | null> {
  const [inst] = await lerInstancias(`user_id=eq.${userId}&limit=1`);
  return inst ?? null;
}

export async function instanciaPorId(id: string): Promise<Instancia | null> {
  const [inst] = await lerInstancias(`id=eq.${id}&limit=1`);
  return inst ?? null;
}

/** O webhook se identifica pelo token da instancia: e ele que diz de quem e o numero. */
export async function instanciaPorToken(token: string): Promise<Instancia | null> {
  if (!token) return null;
  const [inst] = await lerInstancias(`token=eq.${encodeURIComponent(token)}&limit=1`);
  return inst ?? null;
}

export async function instanciaPadrao(companyId: string): Promise<Instancia | null> {
  const [inst] = await lerInstancias(`company_id=eq.${companyId}&padrao=eq.true&limit=1`);
  return inst ?? null;
}

/**
 * De onde sai um envio. Com pessoa (quem clicou ou quem criou o alerta, a
 * rotina, o agendamento) sai do numero dela, e sem numero conectado falha:
 * mandar de outro numero seria falar em nome de outra pessoa. Sem pessoa
 * (cobranca, aviso de deposito) sai do numero padrao da empresa. Para grupo,
 * quem nao conectou cai no padrao da empresa.
 */
export async function remetente(opts: {
  userId?: string | null;
  companyId?: string | null;
  destino?: string | string[] | null;
}): Promise<Instancia> {
  if (opts.userId) {
    const inst = await instanciaDoUsuario(opts.userId);
    if (inst) return inst;
    // Grupo do cliente era falado pelo numero da agencia antes de cada um ter o seu.
    const destinos = [opts.destino ?? []].flat();
    const padrao = destinos.some(ehGrupo) && opts.companyId ? await instanciaPadrao(opts.companyId) : null;
    if (padrao) return padrao;
    throw new SemInstancia(
      "Quem criou este envio não tem WhatsApp conectado. Conecte em Configurações > WhatsApp"
    );
  }
  const inst = opts.companyId ? await instanciaPadrao(opts.companyId) : null;
  if (!inst) throw new SemInstancia(
    "A empresa não tem número padrão de WhatsApp. O ADM escolhe em Configurações > WhatsApp"
  );
  return inst;
}

export function whatsappConfigurado(): boolean {
  return !!Deno.env.get("UAZAPI_URL");
}

function slug(texto: string) {
  return texto
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 24);
}

/** Cria a instancia da pessoa com o admintoken na primeira conexao. */
export async function garantirInstancia(
  userId: string,
  companyId: string,
  rotulo: string
): Promise<{ inst: Instancia; criada: boolean }> {
  const existente = await instanciaDoUsuario(userId);
  if (existente) return { inst: existente, criada: false };

  const admin = Deno.env.get("UAZAPI_ADMIN_TOKEN")?.trim();
  if (!admin) throw new Error("UAZAPI_ADMIN_TOKEN nao configurado");
  // O nome e unico na uazapi inteira: o pedaco do id evita colisao entre homonimos.
  const nome = `${slug(rotulo) || "usuario"}-${userId.slice(0, 8)}`;

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
  const salvo = await fetch(`${url}/rest/v1/wa_instancias?select=${CAMPOS}`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({ company_id: companyId, user_id: userId, nome, token }),
  });
  if (!salvo.ok) throw new Error(`Instancia criada na uazapi, mas nao consegui salvar o token (${salvo.status})`);
  const [inst] = await salvo.json();
  return { inst, criada: true };
}

/** Espelha o estado da sessao na tabela, para a tela listar os numeros sem chamar a uazapi. */
export async function registrarEstado(
  inst: Instancia,
  estado: { conectado: boolean; numero?: string | null; perfil_nome?: string | null }
) {
  const { url, headers } = banco();
  await fetch(`${url}/rest/v1/wa_instancias?id=eq.${inst.id}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ ...estado, status_em: new Date().toISOString() }),
  }).catch(() => undefined);
}

/** Apaga a instancia na uazapi e no banco: a pessoa troca de numero ou sai da equipe. */
export async function removerInstancia(inst: Instancia) {
  await fetch(`${baseUrl()}/instance`, { method: "DELETE", headers: { token: inst.token } }).catch(() => undefined);
  const { url, headers } = banco();
  const res = await fetch(`${url}/rest/v1/wa_instancias?id=eq.${inst.id}`, { method: "DELETE", headers });
  if (!res.ok) throw new Error(`Nao consegui remover o numero (${res.status})`);
}

async function call(inst: Instancia, path: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { token: inst.token, "Content-Type": "application/json", ...(init.headers ?? {}) },
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

export const ehGrupo = (destino: string) => destino.endsWith("@g.us");

// O grupo foi escolhido na lista de um numero: se o de quem criou nao participa
// dele, a uazapi recusa e o numero padrao da empresa (o antigo da agencia) envia.
async function enviar(inst: Instancia, destino: string, path: string, body: object) {
  const init = { method: "POST", body: JSON.stringify(body) };
  try {
    return await call(inst, path, init);
  } catch (err) {
    if (!ehGrupo(destino) || inst.padrao) throw err;
    const padrao = await instanciaPadrao(inst.company_id);
    if (!padrao || padrao.id === inst.id) throw err;
    return await call(padrao, path, init);
  }
}

export function sendText(inst: Instancia, number: string, text: string) {
  return enviar(inst, number, "/send/text", { number, text });
}

/** URL publica da midia de uma mensagem recebida. A uazapi guarda por 2 dias e gera outra a cada chamada. */
export async function downloadMedia(inst: Instancia, messageid: string): Promise<{ url: string; mimetype: string | null }> {
  const r = await call(inst, "/message/download", {
    method: "POST",
    body: JSON.stringify({ id: messageid, generate_mp3: true }),
  });
  const url = r?.fileURL ?? r?.fileUrl ?? r?.url;
  if (!url) throw new Error("A uazapi nao devolveu o arquivo dessa mensagem");
  return { url, mimetype: r?.mimetype ?? null };
}

export function sendDocument(
  inst: Instancia,
  number: string,
  opts: { base64: string; fileName: string; caption?: string; mimetype?: string }
) {
  const mime = opts.mimetype ?? "application/pdf";
  // A Evolution recebia base64 cru no campo `media`; a uazapi quer data URI em
  // `file`. Se o servidor recusar, o plano B e subir o PDF no Storage e mandar
  // a URL publica aqui — o campo aceita os dois.
  const file = opts.base64.startsWith("data:") ? opts.base64 : `data:${mime};base64,${opts.base64}`;
  return enviar(inst, number, "/send/media", { number, type: "document", file, docName: opts.fileName, text: opts.caption ?? "" });
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

export async function listGroups(inst: Instancia): Promise<WhatsappGroup[]> {
  const porId = new Map<string, WhatsappGroup>();
  let offset = 0;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const result = await call(inst, "/group/list", {
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

export function instanceStatus(inst: Instancia) {
  return call(inst, "/instance/status");
}

// A uazapi nao tem restart — connect reconecta e, se precisar, devolve QR novo.
export function instanceConnect(inst: Instancia) {
  return call(inst, "/instance/connect", { method: "POST", body: JSON.stringify({}) });
}

export function instanceDisconnect(inst: Instancia) {
  return call(inst, "/instance/disconnect", { method: "POST", body: JSON.stringify({}) });
}

/**
 * Liga o webhook da instancia no modo simples (um so, cria ou atualiza).
 * wasSentByApi fica de fora: o que o sistema envia ja e gravado por quem
 * enviou, e voltaria duplicado. Grupo entra: aparece na caixa do Comercial.
 */
export function configureWebhook(inst: Instancia, url: string) {
  return call(inst, "/webhook", {
    method: "POST",
    body: JSON.stringify({
      url,
      enabled: true,
      events: ["messages", "messages_update"],
      excludeMessages: ["wasSentByApi"],
    }),
  });
}

export function getWebhook(inst: Instancia) {
  return call(inst, "/webhook");
}
