import { metaGet, metaGetAll } from "@/lib/meta-fetch";
import type { MetaAdAccount, MetaInstagramAccount, MetaPage } from "@/lib/facebook-sdk";

const META_V21 = "https://graph.facebook.com/v21.0";

// fan_count, followers_count, picture e profile_picture_url nao sao lidos em lugar
// nenhum (a foto vem de metaPageLogoUrl) e sao justamente o peso que faz a Meta
// recusar /me/accounts por volume em perfis com muitas paginas.
const PAGE_FIELDS =
  "id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}";

export async function fetchFacebookPages(token: string) {
  const fetchPages = (path: string) =>
    metaGetAll<MetaPage>(META_V21, path, { fields: PAGE_FIELDS, access_token: token }, { limit: 25 });

  const directPages = await fetchPages("me/accounts");

  const businesses = await metaGetAll<{ id: string; name: string }>(
    META_V21,
    "me/businesses",
    { fields: "id,name", access_token: token },
    { limit: 50 }
  );

  const bmPagesNested = await Promise.all(
    businesses.flatMap((bm) => [
      fetchPages(`${bm.id}/owned_pages`).catch(() => [] as MetaPage[]),
      fetchPages(`${bm.id}/client_pages`).catch(() => [] as MetaPage[]),
    ])
  );

  const merged = new Map<string, MetaPage>();
  for (const page of [...directPages, ...bmPagesNested.flat()]) {
    if (!page?.id) continue;
    const existing = merged.get(page.id);
    if (!existing) {
      merged.set(page.id, page);
    } else {
      merged.set(page.id, {
        ...existing,
        ...page,
        access_token: existing.access_token || page.access_token,
        instagram_business_account: existing.instagram_business_account || page.instagram_business_account,
        connected_instagram_account: existing.connected_instagram_account || page.connected_instagram_account,
      });
    }
  }

  return {
    pages: Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    businessIds: businesses.map((bm) => bm.id),
  };
}

export async function fetchBusinessIds(token: string): Promise<string[]> {
  try {
    const businesses = await metaGetAll<{ id: string }>(
      META_V21,
      "me/businesses",
      { fields: "id,name", access_token: token },
      { limit: 50 }
    );
    return businesses.map((bm) => bm.id).filter(Boolean);
  } catch {
    return [];
  }
}

export function mergeAdAccounts(current: MetaAdAccount[], incoming: MetaAdAccount[]) {
  const map = new Map(current.map((account) => [account.id, account]));
  for (const account of incoming) {
    const existing = map.get(account.id);
    map.set(account.id, existing ? { ...existing, ...account, name: account.name || existing.name } : account);
  }
  return Array.from(map.values()).sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id, "pt-BR"));
}

// me/adaccounts so devolve contas onde o usuario tem papel direto e ainda vem
// paginado. Conta compartilhada por parceria fica visivel apenas nos edges do
// Business Manager, entao a descoberta precisa varrer os dois caminhos.
export async function discoverAdAccounts(token: string, businessIds: string[]): Promise<MetaAdAccount[]> {
  const fields = "id,name,account_status,business";

  async function fetchAll(path: string): Promise<MetaAdAccount[]> {
    try {
      const accounts = await metaGetAll<MetaAdAccount>(META_V21, path, { fields, access_token: token }, { limit: 50 });
      return accounts.filter((account) => Boolean(account?.id));
    } catch {
      return [];
    }
  }

  const results = await Promise.all([
    fetchAll("me/adaccounts"),
    ...businessIds.flatMap((bmId) => [fetchAll(`${bmId}/owned_ad_accounts`), fetchAll(`${bmId}/client_ad_accounts`)]),
  ]);

  return mergeAdAccounts([], results.flat());
}

// profile_picture_url so existe no node IGUser; os edges de conta de anuncio
// devolvem ShadowIGUser, entao pedimos apenas id,username em todo lugar.
export async function fetchInstagramEdge(path: string, token: string): Promise<MetaInstagramAccount[]> {
  try {
    const accounts = await metaGetAll<MetaInstagramAccount>(
      META_V21,
      path,
      { fields: "id,username", access_token: token },
      { limit: 50 }
    );
    return accounts.filter((account) => Boolean(account?.id));
  } catch {
    return [];
  }
}

// Os edges de conta de anuncio podem devolver IDs de outro espaco (ShadowIGUser)
// que nao respondem aos endpoints de insights do IG. Confirmamos antes de oferecer.
export async function resolveInstagramUser(id: string, token: string): Promise<MetaInstagramAccount | null> {
  try {
    const json = await metaGet<{ id?: string; username?: string }>(META_V21, id, {
      fields: "id,username,followers_count",
      access_token: token,
    });
    if (!json.id) return null;
    return { id: json.id, username: json.username };
  } catch {
    return null;
  }
}

export function mergeInstagramAccounts(current: MetaInstagramAccount[], incoming: MetaInstagramAccount[]) {
  const map = new Map(current.map((account) => [account.id, account]));
  for (const account of incoming) {
    const existing = map.get(account.id);
    map.set(account.id, existing ? { ...existing, username: existing.username || account.username } : account);
  }
  return Array.from(map.values()).sort((a, b) => (a.username ?? a.id).localeCompare(b.username ?? b.id, "pt-BR"));
}

export async function discoverInstagramAccounts(
  token: string,
  facebookPages: MetaPage[],
  businessIds: string[]
) {
  const fromPages = facebookPages.flatMap((page) =>
    [page.instagram_business_account, page.connected_instagram_account]
      .filter((account): account is MetaInstagramAccount => Boolean(account?.id))
      .map((account) => ({ ...account, origin: page.name }))
  );

  const fromBusinesses = await Promise.all(
    businessIds.flatMap((bmId) => [
      fetchInstagramEdge(`${bmId}/owned_instagram_accounts`, token),
      fetchInstagramEdge(`${bmId}/client_instagram_accounts`, token),
    ])
  );

  return mergeInstagramAccounts(
    [],
    [...fromPages, ...fromBusinesses.flat().map((account) => ({ ...account, origin: "Business Manager" }))]
  );
}

// Alguns clientes tem o IG vinculado so na conta de anuncios, sem passar pela Pagina.
export async function discoverInstagramFromAdAccount(accountId: string, token: string) {
  const act = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const edges = await Promise.all([
    fetchInstagramEdge(`${act}/connected_instagram_accounts`, token),
    fetchInstagramEdge(`${act}/instagram_accounts`, token),
  ]);
  const unique = mergeInstagramAccounts([], edges.flat());
  const resolved = await Promise.all(unique.map((account) => resolveInstagramUser(account.id, token)));
  return resolved
    .filter((account): account is MetaInstagramAccount => Boolean(account))
    .map((account) => ({ ...account, origin: "Conta de anuncios" }));
}

export interface MetaInventory {
  pages: MetaPage[];
  businessIds: string[];
  adAccounts: MetaAdAccount[];
  instagramAccounts: MetaInstagramAccount[];
}

// A varredura e sobre a conta Meta de quem logou, nao sobre o cliente: rodar uma
// vez e reaproveitar evita repetir centenas de chamadas a cada configuracao — o
// que, alem de lento, engorda a taxa de erro que a Meta olha para liberar o
// Full Access da Marketing API.
export async function discoverMetaInventory(
  token: string,
  onProgress?: (message: string) => void
): Promise<MetaInventory> {
  onProgress?.("Procurando paginas e contas de anuncio...");

  let pages: MetaPage[] = [];
  let businessIds: string[] = [];
  try {
    const discovered = await fetchFacebookPages(token);
    pages = discovered.pages;
    businessIds = discovered.businessIds;
  } catch {
    // Falha ao listar paginas nao pode derrubar a descoberta: a conta de anuncios
    // e o que realmente importa e vive em outro conjunto de permissoes.
    businessIds = await fetchBusinessIds(token);
  }

  const adAccounts = await discoverAdAccounts(token, businessIds);

  onProgress?.("Procurando perfis do Instagram...");
  const instagramAccounts = await discoverInstagramAccounts(token, pages, businessIds);

  return { pages, businessIds, adAccounts, instagramAccounts };
}

// A URL que a Meta devolve em `picture.data.url` e assinada e vence em poucos
// dias — foi o que fazia a foto do cliente sumir sozinha. Esta aqui nao expira:
// o Graph redireciona para um CDN novo a cada acesso. Vale como ponte ate a
// sync-client-logo copiar a imagem para o Storage.
export function metaPageLogoUrl(pageId: string) {
  return `https://graph.facebook.com/${pageId}/picture?type=square&width=256&height=256`;
}
