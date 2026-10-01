// Tokens da Meta ficam em client_secrets, que so o service_role le. Toda
// function que fala com a Graph API em nome de um cliente pega o token aqui.

export type TipoToken = "conta" | "pagina";

export interface TokensMeta {
  conta: string | null;
  pagina: string | null;
}

function env() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SVC_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SVC_ROLE_KEY nao configurados");
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" } };
}

const limpo = (t: unknown) => (typeof t === "string" && t.trim() ? t.trim() : null);

export async function tokensDosClientes(ids: string[]): Promise<Map<string, TokensMeta>> {
  const mapa = new Map<string, TokensMeta>();
  if (!ids.length) return mapa;
  const { url, headers } = env();
  const res = await fetch(
    `${url}/rest/v1/client_secrets?client_id=in.(${ids.join(",")})&select=client_id,meta_access_token,meta_page_access_token`,
    { headers },
  );
  if (!res.ok) throw new Error(`Nao consegui ler o cofre de tokens (${res.status})`);
  for (const r of await res.json()) {
    mapa.set(r.client_id, { conta: limpo(r.meta_access_token), pagina: limpo(r.meta_page_access_token) });
  }
  return mapa;
}

/** Token de Pagina cai para o da conta: e o que a conexao antiga guardava. */
export async function tokenDoCliente(clientId: string, tipo: TipoToken = "conta"): Promise<string | null> {
  const t = (await tokensDosClientes([clientId])).get(clientId);
  if (!t) return null;
  return tipo === "pagina" ? t.pagina ?? t.conta : t.conta;
}
