// Camada de provedor de WhatsApp.
//
// O sistema nasceu preso na Evolution API: nove functions montavam a URL e o
// header `apikey` na mao. Trocar de provedor exigia reescrever as nove. Aqui as
// operacoes viram um contrato unico (sendText, sendDocument, listGroups,
// getStatus, adminAction) e cada provedor traduz para a sua API.
//
// A escolha do provedor e as credenciais da Uazapi vivem em `app_config`, que
// nao tem grant para anon nem authenticated — o token nunca chega no browser.
// A Evolution continua lendo os secrets de ambiente que ja estao no dashboard,
// entao nada quebra enquanto o provedor ativo for ela.

export type WhatsappProvider = "evolution" | "uazapi";

export interface WhatsappConfig {
  provider: WhatsappProvider;
  baseUrl: string;
  /** Uazapi: token da instancia. Evolution: valor do header `apikey`. */
  token: string;
  /** Só a Evolution usa: a instancia faz parte da URL. */
  instance: string;
  /** Uazapi: necessario para criar instancia; opcional no resto. */
  adminToken: string | null;
}

export interface SendResult {
  messageId: string | null;
}

export interface WhatsappGroup {
  id: string;
  subject: string;
  size: number;
  pictureUrl: string | null;
}

export interface WhatsappStatus {
  instance: string;
  /** Vocabulario da Evolution (open/connecting/close), normalizado. */
  state: "open" | "connecting" | "close" | "unknown";
  connected: boolean;
  socketAlive: boolean;
  staleState: boolean;
  message: string;
  ownerJid: string | null;
  profileName: string | null;
}

export type AdminAction = "restart" | "logout" | "connect";

export interface AdminResult {
  action: AdminAction;
  instance: string;
  httpStatus: number;
  ok: boolean;
  response: unknown;
  /** Uazapi devolve o QR no proprio /instance/connect. */
  qrcode: string | null;
  paircode: string | null;
}

const CONFIG_KEYS = [
  "whatsapp_provider",
  "uazapi_base_url",
  "uazapi_token",
  "uazapi_admin_token",
] as const;

function trimSlash(url: string): string {
  return url.replace(/\/$/, "");
}

/**
 * Le as chaves de WhatsApp do app_config com a service role.
 * Falha de leitura nao derruba o envio: cai para o ambiente (Evolution).
 */
async function readAppConfig(): Promise<Record<string, string>> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const svcKey = Deno.env.get("SVC_ROLE_KEY");
  if (!supabaseUrl || !svcKey) return {};

  const inList = CONFIG_KEYS.map(k => `"${k}"`).join(",");
  try {
    const rows = await fetch(
      `${supabaseUrl}/rest/v1/app_config?key=in.(${inList})&select=key,value`,
      { headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` } }
    ).then(r => (r.ok ? r.json() : null));

    if (!Array.isArray(rows)) return {};
    const out: Record<string, string> = {};
    for (const row of rows) {
      if (row?.key && typeof row.value === "string") out[row.key] = row.value;
    }
    return out;
  } catch {
    return {};
  }
}

export async function loadWhatsappConfig(): Promise<WhatsappConfig> {
  const cfg = await readAppConfig();

  // Sem chave gravada o provedor continua sendo a Evolution: instalar esta
  // versao nao muda o comportamento de quem ja estava rodando.
  const provider: WhatsappProvider = cfg.whatsapp_provider === "uazapi" ? "uazapi" : "evolution";

  if (provider === "uazapi") {
    const baseUrl = cfg.uazapi_base_url || Deno.env.get("UAZAPI_BASE_URL") || "";
    const token = cfg.uazapi_token || Deno.env.get("UAZAPI_TOKEN") || "";
    if (!baseUrl || !token) {
      throw new Error(
        "Uazapi selecionada mas sem URL ou token. Cadastre em Configurações → WhatsApp."
      );
    }
    return {
      provider,
      baseUrl: trimSlash(baseUrl),
      token,
      instance: "uazapi",
      adminToken: cfg.uazapi_admin_token || Deno.env.get("UAZAPI_ADMIN_TOKEN") || null,
    };
  }

  const baseUrl = Deno.env.get("EVOLUTION_API_URL") ?? "";
  const instance = Deno.env.get("EVOLUTION_INSTANCE") ?? "";
  const token = Deno.env.get("EVOLUTION_API_KEY") ?? "";
  if (!baseUrl || !instance || !token) {
    throw new Error("EVOLUTION_API_URL / EVOLUTION_INSTANCE / EVOLUTION_API_KEY não configurados");
  }
  return { provider, baseUrl: trimSlash(baseUrl), token, instance, adminToken: null };
}

function authHeaders(cfg: WhatsappConfig): Record<string, string> {
  return cfg.provider === "uazapi"
    ? { token: cfg.token, "Content-Type": "application/json" }
    : { apikey: cfg.token, "Content-Type": "application/json" };
}

/** Nome do provedor para mensagens de erro legiveis na UI. */
function label(cfg: WhatsappConfig): string {
  return cfg.provider === "uazapi" ? "Uazapi" : "Evolution API";
}

interface RawResponse {
  ok: boolean;
  status: number;
  parsed: any;
  raw: string;
}

async function call(
  cfg: WhatsappConfig,
  path: string,
  init: RequestInit = {}
): Promise<RawResponse> {
  const res = await fetch(`${cfg.baseUrl}/${path.replace(/^\//, "")}`, {
    ...init,
    headers: { ...authHeaders(cfg), ...(init.headers ?? {}) },
  });
  const raw = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(raw); } catch { /* resposta não-JSON */ }
  return { ok: res.ok, status: res.status, parsed, raw };
}

/** O erro util da Evolution vem embrulhado em `response.message`; o da Uazapi em `error`. */
function errorOf(r: RawResponse, cfg: WhatsappConfig): string {
  const detail =
    r.parsed?.response?.message ??
    r.parsed?.message ??
    r.parsed?.error ??
    r.raw.slice(0, 300);
  const text = typeof detail === "string" ? detail : JSON.stringify(detail);
  return `${label(cfg)} respondeu ${r.status}: ${text}`;
}

export async function sendText(
  cfg: WhatsappConfig,
  to: string,
  text: string
): Promise<SendResult> {
  const r = cfg.provider === "uazapi"
    ? await call(cfg, "send/text", {
        method: "POST",
        body: JSON.stringify({ number: to, text }),
      })
    : await call(cfg, `message/sendText/${cfg.instance}`, {
        method: "POST",
        body: JSON.stringify({ number: to, text }),
      });

  if (!r.ok) throw new Error(errorOf(r, cfg));

  const messageId = cfg.provider === "uazapi"
    ? r.parsed?.messageid ?? r.parsed?.id ?? r.parsed?.key?.id ?? null
    : r.parsed?.key?.id ?? null;

  return { messageId };
}

export async function sendDocument(
  cfg: WhatsappConfig,
  args: { to: string; base64: string; fileName: string; caption?: string; mimetype?: string }
): Promise<SendResult> {
  const { to, base64, fileName, caption = "", mimetype = "application/pdf" } = args;

  const r = cfg.provider === "uazapi"
    ? await call(cfg, "send/media", {
        method: "POST",
        body: JSON.stringify({
          number: to,
          type: "document",
          file: base64,
          docName: fileName,
          mimetype,
          text: caption,
        }),
      })
    : await call(cfg, `message/sendMedia/${cfg.instance}`, {
        method: "POST",
        body: JSON.stringify({
          number: to,
          mediatype: "document",
          mimetype,
          fileName,
          caption,
          media: base64,
        }),
      });

  if (!r.ok) throw new Error(errorOf(r, cfg));

  const messageId = cfg.provider === "uazapi"
    ? r.parsed?.messageid ?? r.parsed?.id ?? null
    : r.parsed?.key?.id ?? null;

  return { messageId };
}

export async function listGroups(cfg: WhatsappConfig): Promise<WhatsappGroup[]> {
  const r = cfg.provider === "uazapi"
    ? await call(cfg, "group/list?noparticipants=true", { method: "GET" })
    : await call(cfg, `group/fetchAllGroups/${cfg.instance}?getParticipants=false`, { method: "GET" });

  if (!r.ok) throw new Error(errorOf(r, cfg));

  // Os dois provedores as vezes respondem 200 com objeto de erro no lugar da lista
  const list = Array.isArray(r.parsed) ? r.parsed : r.parsed?.groups;
  if (!Array.isArray(list)) {
    throw new Error(`${label(cfg)} respondeu 200 mas sem lista de grupos: ${r.raw.slice(0, 400)}`);
  }

  return list.map((g: any) => ({
    id: g.id ?? g.JID ?? g.jid ?? "",
    subject: g.subject ?? g.Name ?? g.name ?? "(sem nome)",
    size: g.size ?? g.participantsCount ?? g.GroupParticipants?.length ?? 0,
    pictureUrl: g.pictureUrl ?? g.imgUrl ?? null,
  }));
}

// A Evolution mantem `state: "open"` mesmo depois do socket do Baileys morrer —
// o Manager mostra "Connected" enquanto todo envio falha com "Connection
// Closed". So uma operacao que realmente use o socket revela isso.
async function probeEvolutionSocket(
  cfg: WhatsappConfig,
  ownerJid: string | null
): Promise<{ alive: boolean; error: string | null }> {
  const number = (ownerJid ?? "").split("@")[0];
  if (!number) return { alive: true, error: null };

  try {
    const r = await call(cfg, `chat/whatsappNumbers/${cfg.instance}`, {
      method: "POST",
      body: JSON.stringify({ numbers: [number] }),
    });
    if (r.ok) return { alive: true, error: null };
    return { alive: false, error: errorOf(r, cfg) };
  } catch (err) {
    return { alive: false, error: (err as Error).message };
  }
}

function describeEvolution(state: WhatsappStatus["state"]): string {
  switch (state) {
    case "open":
      return "Instância conectada ao WhatsApp";
    case "connecting":
      return "Instância reconectando — aguarde alguns segundos";
    case "close":
      return "Sessão do WhatsApp caiu. Leia o QR Code novamente para reconectar";
    default:
      return "Estado desconhecido — verifique a instância no Manager da Evolution";
  }
}

async function uazapiStatus(cfg: WhatsappConfig): Promise<WhatsappStatus> {
  const r = await call(cfg, "instance/status", { method: "GET" });
  if (!r.ok) throw new Error(errorOf(r, cfg));

  const inst = r.parsed?.instance ?? {};
  const status = r.parsed?.status ?? {};
  const connected = status.connected === true && status.loggedIn === true;

  // A Uazapi expoe connected/loggedIn direto do whatsmeow: quando ela diz que
  // esta logada, esta — nao existe o falso "open" da Evolution, entao aqui o
  // probe extra nao e necessario.
  const state: WhatsappStatus["state"] = connected
    ? "open"
    : status.connected === true
      ? "connecting"
      : "close";

  const jidUser = status.jid?.user ?? null;

  return {
    instance: inst.name ?? inst.id ?? "uazapi",
    state,
    connected,
    socketAlive: connected,
    staleState: false,
    message: connected
      ? "Instância conectada ao WhatsApp"
      : status.connected === true
        ? "Conectando — leia o QR Code para autenticar"
        : "Desconectada. Gere um QR Code para conectar",
    ownerJid: jidUser ? `${jidUser}@s.whatsapp.net` : null,
    profileName: inst.profileName ?? inst.name ?? null,
  };
}

async function evolutionStatus(cfg: WhatsappConfig): Promise<WhatsappStatus> {
  const r = await call(cfg, `instance/connectionState/${cfg.instance}`, { method: "GET" });
  if (!r.ok) throw new Error(errorOf(r, cfg));

  const state: WhatsappStatus["state"] = r.parsed?.instance?.state ?? r.parsed?.state ?? "unknown";

  // Dados do numero conectado — melhor esforco, nao bloqueia o status
  let ownerJid: string | null = null;
  let profileName: string | null = null;
  try {
    const info = await call(
      cfg,
      `instance/fetchInstances?instanceName=${encodeURIComponent(cfg.instance)}`,
      { method: "GET" }
    );
    if (info.ok) {
      const entry = Array.isArray(info.parsed) ? info.parsed[0] : info.parsed;
      const inst = entry?.instance ?? entry;
      ownerJid = inst?.ownerJid ?? inst?.owner ?? null;
      profileName = inst?.profileName ?? null;
    }
  } catch { /* informativo apenas */ }

  const probe = state === "open"
    ? await probeEvolutionSocket(cfg, ownerJid)
    : { alive: false, error: null };

  const staleState = state === "open" && !probe.alive;

  return {
    instance: cfg.instance,
    state,
    connected: state === "open" && probe.alive,
    socketAlive: probe.alive,
    staleState,
    message: staleState
      ? `A Evolution reporta "open" mas o socket não responde (${probe.error ?? "erro desconhecido"}). Clique em Reiniciar; se persistir, refaça a leitura do QR Code`
      : describeEvolution(state),
    ownerJid,
    profileName,
  };
}

export function getStatus(cfg: WhatsappConfig): Promise<WhatsappStatus> {
  return cfg.provider === "uazapi" ? uazapiStatus(cfg) : evolutionStatus(cfg);
}

const EVOLUTION_ACTIONS: Record<AdminAction, { method: string; path: string }> = {
  // POST, não PUT: a Evolution v2 trocou o verbo e o v1 responde 404 aqui
  restart: { method: "POST", path: "instance/restart" },
  logout: { method: "DELETE", path: "instance/logout" },
  connect: { method: "GET", path: "instance/connect" },
};

const UAZAPI_ACTIONS: Record<AdminAction, { method: string; path: string }> = {
  restart: { method: "POST", path: "instance/reset" },
  logout: { method: "POST", path: "instance/disconnect" },
  connect: { method: "POST", path: "instance/connect" },
};

// A Evolution ora devolve o QR na raiz, ora aninhado em `qrcode`; a Uazapi
// devolve dentro de `instance`. Em todos os casos o base64 as vezes ja vem com
// o prefixo data: e as vezes nao.
function extractQr(parsed: any): { qrcode: string | null; paircode: string | null } {
  const node = parsed?.instance ?? parsed;
  const rawQr =
    node?.qrcode ??
    node?.qrCode ??
    node?.base64 ??
    parsed?.qrcode?.base64 ??
    parsed?.base64 ??
    null;

  const qrcode = typeof rawQr === "string" && rawQr.length > 0
    ? (rawQr.startsWith("data:") ? rawQr : `data:image/png;base64,${rawQr}`)
    : null;

  const paircode = node?.paircode ?? node?.pairingCode ?? parsed?.pairingCode ?? null;

  return { qrcode, paircode: typeof paircode === "string" && paircode ? paircode : null };
}

export async function adminAction(
  cfg: WhatsappConfig,
  action: AdminAction
): Promise<AdminResult> {
  const table = cfg.provider === "uazapi" ? UAZAPI_ACTIONS : EVOLUTION_ACTIONS;
  const { method, path } = table[action];

  const url = cfg.provider === "uazapi" ? path : `${path}/${cfg.instance}`;
  const init: RequestInit = { method };
  // A Uazapi exige corpo JSON no connect; sem ele responde 400.
  if (cfg.provider === "uazapi" && method === "POST") init.body = JSON.stringify({});

  const r = await call(cfg, url, init);
  const { qrcode, paircode } = extractQr(r.parsed);

  return {
    action,
    instance: cfg.instance,
    httpStatus: r.status,
    ok: r.ok,
    response: r.parsed ?? r.raw.slice(0, 1000),
    qrcode,
    paircode,
  };
}
