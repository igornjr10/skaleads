// Auth e posse para Edge Functions.
//
// O gateway do Supabase valida o JWT antes do handler rodar, mas a anon key
// tambem passa por ele — quem barra chamada sem usuario de verdade e o `sub`
// do token. E como estas functions usam service_role, que ignora RLS, a posse
// do cliente precisa ser checada explicitamente aqui.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuthedUser {
  id: string;
  email?: string;
}

function env() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  if (!supabaseUrl || !svcKey) throw new Error("SUPABASE_URL / SVC_ROLE_KEY não configurados");
  return { supabaseUrl, svcKey, anonKey };
}

function svcHeaders(svcKey: string) {
  return {
    apikey: svcKey,
    Authorization: `Bearer ${svcKey}`,
    "Content-Type": "application/json",
  };
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Chamada interna (cron, outra function) usando a service role key.
 * Nesses casos nao existe usuario, e a posse ja foi decidida por quem chamou.
 */
export function isServiceRole(req: Request): boolean {
  const svcKey = Deno.env.get("SVC_ROLE_KEY");
  if (!svcKey) return false;
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  return bearer.length > 0 && bearer === svcKey;
}

/** Usuario do JWT recebido, ou null quando a chamada nao tem sessao real. */
export async function getUser(req: Request): Promise<AuthedUser | null> {
  const { supabaseUrl, anonKey } = env();
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: req.headers.get("Authorization") ?? "" },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id ? { id: user.id, email: user.email } : null;
}

/**
 * O cliente esta na carteira do time desse usuario?
 * A regra vive no banco (user_can_access_client) para nao existir uma segunda
 * versao dela aqui que possa divergir das policies.
 */
export async function ownsClient(userId: string, clientId: unknown): Promise<boolean> {
  if (!isUuid(clientId)) return false;
  const { supabaseUrl, svcKey } = env();
  const result = await fetch(`${supabaseUrl}/rest/v1/rpc/user_can_access_client`, {
    method: "POST",
    headers: svcHeaders(svcKey),
    body: JSON.stringify({ _user_id: userId, _client_id: clientId }),
  }).then(r => r.json()).catch(() => false);
  return result === true;
}

/** O usuario tem algum destes papeis na plataforma? */
export async function hasAnyRole(userId: string, roles: string[]): Promise<boolean> {
  const { supabaseUrl, svcKey } = env();
  const rows = await fetch(
    `${supabaseUrl}/rest/v1/user_roles?user_id=eq.${userId}&select=role`,
    { headers: svcHeaders(svcKey) }
  ).then(r => r.json()).catch(() => null);
  return Array.isArray(rows) && rows.some((r: { role?: string }) => roles.includes(r.role ?? ""));
}

/** Empresas do usuario. */
export async function companyIdsOf(userId: string): Promise<string[]> {
  const { supabaseUrl, svcKey } = env();
  const rows = await fetch(
    `${supabaseUrl}/rest/v1/user_companies?user_id=eq.${userId}&select=company_id`,
    { headers: svcHeaders(svcKey) }
  ).then(r => r.json()).catch(() => null);
  return Array.isArray(rows) ? rows.map((r: { company_id: string }) => r.company_id).filter(Boolean) : [];
}

export interface GuardOptions {
  /** Exige que o cliente esteja numa empresa do usuario. */
  clientId?: unknown;
  /** Exige um destes papeis. */
  roles?: string[];
}

export type GuardResult =
  | { ok: true; user: AuthedUser | null; service: boolean }
  | { ok: false; response: Response };

/**
 * Porta de entrada das functions chamadas pelo app. A anon key e publica (vai
 * no bundle) e passa pelo gateway, entao sem isto qualquer pessoa na internet
 * dispara WhatsApp, e-mail e IA por nossa conta. Chamada interna com a service
 * role passa direto: quem chamou ja decidiu a posse.
 */
export async function guard(
  req: Request,
  cors: Record<string, string>,
  opts: GuardOptions = {}
): Promise<GuardResult> {
  if (isServiceRole(req)) return { ok: true, user: null, service: true };

  const user = await getUser(req);
  if (!user) return { ok: false, response: jsonResponse(cors, { error: "Não autenticado" }, 401) };

  if (opts.roles && !(await hasAnyRole(user.id, opts.roles))) {
    return { ok: false, response: jsonResponse(cors, { error: "Sem permissão" }, 403) };
  }

  if ("clientId" in opts && !(await ownsClient(user.id, opts.clientId))) {
    return { ok: false, response: jsonResponse(cors, { error: "Cliente não encontrado na sua carteira" }, 404) };
  }

  return { ok: true, user, service: false };
}

export function jsonResponse(cors: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
