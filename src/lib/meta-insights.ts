import { metaGet } from "@/lib/meta-fetch";

// A Meta removeu profile_views e impressions do Instagram em abr/2025 e as
// substitutas (views, total_interactions) so existem da v22 em diante — na v21
// alcance, engajamento e visitas do perfil voltavam sempre vazios.
export const META_GRAPH_VERSION = "v23.0";
const META_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

function normalizeAccountId(id: string) {
  return id.startsWith("act_") ? id.slice(4) : id.trim();
}

function normalizeInstagramUsername(username: string) {
  return username.trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9._]/g, "");
}

function fetchMetaJson<T>(path: string, params: Record<string, string>): Promise<T> {
  return metaGet<T>(META_BASE, path, params);
}

export interface ReachFrequency {
  reach: number;
  frequency: number;
  impressions: number;
}

export async function fetchAccountReachFrequency(
  adAccountId: string,
  accessToken: string,
  since: string,
  until: string
): Promise<ReachFrequency> {
  const json = await fetchMetaJson<{ data?: Array<{ reach?: string; frequency?: string; impressions?: string }> }>(
    `act_${normalizeAccountId(adAccountId)}/insights`,
    {
      fields: "reach,frequency,impressions",
      level: "account",
      time_range: JSON.stringify({ since, until }),
      access_token: accessToken.trim(),
    }
  );
  const row = json.data?.[0];
  return {
    reach: parseInt(row?.reach ?? "0", 10) || 0,
    frequency: parseFloat(row?.frequency ?? "0") || 0,
    impressions: parseInt(row?.impressions ?? "0", 10) || 0,
  };
}

export interface SocialPresence {
  profileName: string | null;
  logoUrl: string | null;
  sources: string[];
  followers: number | null;
  profileViews: number | null;
  reach: number | null;
  engagement: number | null;
}

interface SocialPresenceInput {
  pageId?: string | null;
  pageName?: string | null;
  instagramAccountId?: string | null;
  instagramUsername?: string | null;
  accessToken?: string | null;
  logoUrl?: string | null;
  since: string;
  until: string;
}

async function fetchFacebookPresence(pageId: string, token: string, since: string, until: string) {
  const pageInfo = await fetchMetaJson<{
    name?: string;
    fan_count?: number;
    followers_count?: number;
    instagram_business_account?: { id?: string };
  }>(pageId, {
    fields: "name,fan_count,followers_count,instagram_business_account{id}",
    access_token: token,
  });

  let reach: number | null = null;
  let engagement: number | null = null;
  try {
    const insights = await fetchMetaJson<{ data?: Array<{ name?: string; values?: Array<{ value?: number }> }> }>(
      `${pageId}/insights`,
      {
        metric: "page_impressions_unique,page_actions_post_reactions_total",
        since,
        until,
        access_token: token,
      }
    );
    const rows = insights.data || [];
    reach = rows.find((r) => r.name === "page_impressions_unique")?.values?.reduce((s, i) => s + (i.value || 0), 0) ?? null;
    engagement = rows.find((r) => r.name === "page_actions_post_reactions_total")?.values?.reduce((s, i) => s + (i.value || 0), 0) ?? null;
  } catch {
    // Page insights podem estar indisponíveis; segue sem eles.
  }

  return {
    pageName: pageInfo.name || null,
    followers: pageInfo.followers_count ?? pageInfo.fan_count ?? null,
    reach,
    engagement,
    instagramAccountId: pageInfo.instagram_business_account?.id || null,
  };
}

async function fetchInstagramPresence(igId: string, token: string, since: string, until: string) {
  const profile = await fetchMetaJson<{ username?: string; followers_count?: number; profile_picture_url?: string }>(igId, {
    fields: "username,followers_count,profile_picture_url",
    access_token: token,
  });

  // A janela de insights do IG é limitada a ~30 dias.
  const untilObj = new Date(`${until}T00:00:00`);
  const sinceObj = new Date(`${since}T00:00:00`);
  const earliest = new Date(untilObj);
  earliest.setDate(earliest.getDate() - 30);
  const cappedSince = sinceObj < earliest ? earliest.toISOString().split("T")[0] : since;

  async function tryMetric(metrics: Array<{ metric: string; useTotalValue?: boolean }>): Promise<number | null> {
    for (const { metric, useTotalValue = true } of metrics) {
      const params: Record<string, string> = {
        metric,
        period: "day",
        since: cappedSince,
        until,
        access_token: token,
      };
      if (useTotalValue) params.metric_type = "total_value";
      try {
        const insights = await fetchMetaJson<{
          data?: Array<{ name?: string; total_value?: { value?: number }; values?: Array<{ value?: number | string }> }>;
        }>(`${igId}/insights`, params);
        const row = (insights.data || []).find((r) => r.name === metric);
        if (row?.total_value?.value !== undefined) return row.total_value.value;
        if (row?.values?.length) return row.values.reduce((s, i) => s + (Number(i.value) || 0), 0);
      } catch {
        // tenta o próximo nome de métrica
      }
    }
    return null;
  }

  const reach = await tryMetric([{ metric: "reach" }]);
  const engagement = await tryMetric([{ metric: "accounts_engaged" }, { metric: "total_interactions" }]);
  // views conta conteudo visto, nao visita de perfil — no lugar das visitas ela
  // inflava o numero em varias ordens de grandeza.
  const profileViews = await tryMetric([{ metric: "profile_views" }, { metric: "profile_views", useTotalValue: false }]);

  return {
    username: profile.username || null,
    logoUrl: profile.profile_picture_url || null,
    followers: profile.followers_count ?? null,
    profileViews,
    reach,
    engagement,
  };
}

export async function fetchSocialPresence(input: SocialPresenceInput): Promise<SocialPresence | null> {
  const token = input.accessToken?.trim();
  if (!token) return null;

  const page = input.pageId ? await fetchFacebookPresence(input.pageId, token, input.since, input.until).catch(() => null) : null;
  // O perfil escolhido no cliente tem prioridade: a Pagina pode estar vinculada a outro IG.
  const igId = input.instagramAccountId || page?.instagramAccountId || null;
  const ig = igId ? await fetchInstagramPresence(igId, token, input.since, input.until).catch(() => null) : null;

  if (!page && !ig) return null;

  const sources = [page ? "Facebook" : null, ig ? "Instagram" : null].filter(Boolean) as string[];
  const followers = (page?.followers ?? 0) + (ig?.followers ?? 0) || (page?.followers ?? ig?.followers ?? null);

  return {
    profileName: ig?.username ? `@${ig.username}` : input.pageName || page?.pageName || null,
    logoUrl: ig?.logoUrl || input.logoUrl || null,
    sources,
    followers,
    profileViews: ig?.profileViews ?? null,
    reach: ig?.reach ?? page?.reach ?? null,
    engagement: ig?.engagement ?? page?.engagement ?? null,
  };
}

export { normalizeInstagramUsername };

/**
 * Retrato do Instagram para o relatorio de um clique: quantos seguidores o
 * perfil tem, quantos entraram e sairam no periodo, e as visitas ao perfil.
 *
 * O `fetchSocialPresence` traz isso e mais — util no painel de relatorios, caro
 * demais para o botao de envio. Aqui sao tres chamadas curtas, independentes:
 * uma que falhe nao derruba as outras.
 *
 * Cada campo volta `null` quando a Meta recusa (conta sem papel na Pagina,
 * token sem `instagram_manage_insights`) em vez de zero: zero seguidor no
 * relatorio do cliente parece resultado, nao dado ausente.
 */
export interface InstagramSocial {
  followers: number | null;
  /** Quem comecou a seguir no periodo. NAO desconta quem saiu. */
  followersGained: number | null;
  /** O que sobrou depois de descontar quem deixou de seguir. Pode ser negativo. */
  followersNet: number | null;
  profileViews: number | null;
}

export async function fetchInstagramSocial(
  igId: string,
  token: string,
  since: string,
  until: string
): Promise<InstagramSocial> {
  const limpo = token.trim();
  const [followers, crescimento, profileViews] = await Promise.all([
    tentar(async () => {
      const perfil = await fetchMetaJson<{ followers_count?: number }>(igId, {
        fields: "followers_count",
        access_token: limpo,
      });
      return typeof perfil.followers_count === "number" ? perfil.followers_count : null;
    }),
    tentarCrescimento(igId, limpo, since, until),
    tentar(async () => {
      const json = await fetchMetaJson<{
        data?: Array<{ total_value?: { value?: number } }>;
      }>(`${igId}/insights`, {
        metric: "profile_views",
        // `profile_views` so responde com `metric_type=total_value`, e ai vem um
        // numero unico do periodo, sem quebra por dia.
        metric_type: "total_value",
        period: "day",
        since,
        until,
        access_token: limpo,
      });
      const valor = json.data?.[0]?.total_value?.value;
      return typeof valor === "number" ? valor : null;
    }),
  ]);
  return { followers, ...crescimento, profileViews };
}

/**
 * Crescimento de seguidores no periodo, ja descontando quem saiu.
 *
 * Usa `follows_and_unfollows` e nao `follower_count` de proposito. Conferido em
 * 21/09/2026 na carteira: os dois dao o mesmo numero de gente que comecou a
 * seguir, mas so este separa quem deixou de seguir. Em ALAN DUTRA foram 96
 * seguindo contra 105 saindo — o `follower_count` sozinho diria "+96 novos
 * seguidores" no relatorio de um cliente que na verdade perdeu 9.
 *
 * Sem o saldo nao mostramos nada: o numero bruto sozinho e o que engana.
 */
async function tentarCrescimento(
  igId: string,
  token: string,
  since: string,
  until: string
): Promise<{ followersGained: number | null; followersNet: number | null }> {
  const vazio = { followersGained: null, followersNet: null };
  try {
    const json = await fetchMetaJson<{
      data?: Array<{
        total_value?: {
          breakdowns?: Array<{ results?: Array<{ dimension_values?: string[]; value?: number }> }>;
        };
      }>;
    }>(`${igId}/insights`, {
      metric: "follows_and_unfollows",
      metric_type: "total_value",
      breakdown: "follow_type",
      period: "day",
      since,
      until,
      access_token: token,
    });
    const linhas = json.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
    const valor = (dimensao: string) =>
      linhas.find((linha) => linha.dimension_values?.[0] === dimensao)?.value;
    const seguiram = valor("FOLLOWER");
    const sairam = valor("NON_FOLLOWER");
    if (typeof seguiram !== "number" || typeof sairam !== "number") return vazio;
    return { followersGained: seguiram, followersNet: seguiram - sairam };
  } catch {
    return vazio;
  }
}

async function tentar(consulta: () => Promise<number | null>): Promise<number | null> {
  try {
    return await consulta();
  } catch {
    return null;
  }
}
