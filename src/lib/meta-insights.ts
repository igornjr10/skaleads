const META_BASE = "https://graph.facebook.com/v21.0";

function normalizeAccountId(id: string) {
  return id.startsWith("act_") ? id.slice(4) : id.trim();
}

function normalizeInstagramUsername(username: string) {
  return username.trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9._]/g, "");
}

async function fetchMetaJson<T>(path: string, params: Record<string, string>): Promise<T> {
  const response = await fetch(`${META_BASE}/${path}?${new URLSearchParams(params)}`);
  const json = await response.json();
  if (!response.ok || json.error) {
    throw new Error(json.error?.message || "Erro ao buscar dados na Meta");
  }
  return json as T;
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

  const reach = await tryMetric([{ metric: "reach" }, { metric: "impressions" }]);
  const engagement = await tryMetric([{ metric: "accounts_engaged" }, { metric: "total_interactions" }]);
  const profileViews = await tryMetric([
    { metric: "profile_views" },
    { metric: "views" },
    { metric: "profile_views", useTotalValue: false },
  ]);

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
  const igId = page?.instagramAccountId || input.instagramAccountId || null;
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
