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

/** O cliente esta na carteira desse usuario? */
export async function ownsClient(userId: string, clientId: unknown): Promise<boolean> {
  if (!isUuid(clientId)) return false;
  const { supabaseUrl, svcKey } = env();
  const rows = await fetch(
    `${supabaseUrl}/rest/v1/clients?id=eq.${clientId}&owner_id=eq.${userId}&select=id&limit=1`,
    { headers: svcHeaders(svcKey) }
  ).then(r => r.json()).catch(() => null);
  return Array.isArray(rows) && rows.length > 0;
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

export function jsonResponse(cors: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
