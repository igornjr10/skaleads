// Chamada pelo pg_cron com Authorization: Bearer <anon key> (satisfaz o
// verify_jwt do gateway) + x-cron-secret proprio, mesmo padrao de
// run-alerts-cron e run-report-schedules. Sem o Authorization no cron
// registrado, o gateway rejeita a chamada com 401 antes do handler rodar.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const META_BASE = "https://graph.facebook.com/v21.0";

// ─── DB helpers ───────────────────────────────────────────────────────────────

function dbGet(url: string, key: string, path: string) {
  return fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    cache: "no-store",
  }).then(r => r.json());
}

async function dbPatch(url: string, key: string, path: string, body: object) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} falhou (${res.status}): ${await res.text().catch(() => "")}`);
}

async function dbInsert(url: string, key: string, table: string, body: object): Promise<{ id: string } | null> {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${table} falhou (${res.status}): ${await res.text().catch(() => "")}`);
  const [row] = await res.json();
  return row ?? null;
}

async function dbUpsert(url: string, key: string, table: string, onConflict: string, body: object) {
  const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`UPSERT ${table} falhou (${res.status}): ${await res.text().catch(() => "")}`);
}

// ─── Meta helpers (espelha src/lib/meta-api.ts) ────────────────────────────────

interface MetaInsight {
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  conversions?: string;
  date_start?: string;
}

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
  insights?: { data: MetaInsight[] };
}

interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  insights?: { data: MetaInsight[] };
}

interface MetaAd {
  id: string;
  name: string;
  status: string;
  adset_id: string;
  creative?: {
    thumbnail_url?: string;
    image_url?: string;
    body?: string;
    title?: string;
    object_type?: string;
    video_id?: string;
  };
  insights?: { data: MetaInsight[] };
}

interface MetaPagedResponse<T> {
  data: T[];
  paging?: { next?: string };
  error?: { message: string; code: number };
}

function n(value?: string): number {
  return parseFloat(value ?? "0") || 0;
}

function ni(value?: string): number {
  return parseInt(value ?? "0") || 0;
}

function normalizeAccountId(id: string): string {
  return id.startsWith("act_") ? id.slice(4) : id.trim();
}

async function metaFetchAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
  let url: string | undefined = `${META_BASE}/${path}?${new URLSearchParams(params)}`;
  const items: T[] = [];

  while (url) {
    const res = await fetch(url, { cache: "no-store" });
    const json: MetaPagedResponse<T> = await res.json();
    if (json.error) throw new Error(json.error.message);
    items.push(...(json.data ?? []));
    url = json.paging?.next;
  }

  return items;
}

function inferSyncStatusFromError(message: string): "expired" | "error" | "warning" {
  const text = message.toLowerCase();
  if (
    text.includes("invalid oauth") || text.includes("session has expired") ||
    text.includes("access token") || text.includes("permissions error") || text.includes("expired")
  ) {
    return "expired";
  }
  if (text.includes("rate limit") || text.includes("temporar") || text.includes("try again")) return "warning";
  return "error";
}

interface SyncResult {
  campaigns: number;
  adSets: number;
  ads: number;
  days: number;
}

// Reimplementa syncClientData (src/lib/meta-api.ts) do lado do servidor, usando
// SVC_ROLE_KEY em vez do client Supabase do browser — o resto da logica e igual.
async function syncClientData(
  supabaseUrl: string, svcKey: string, clientId: string, adAccountId: string, accessToken: string
): Promise<SyncResult> {
  const accountId = normalizeAccountId(adAccountId);
  const token = accessToken.trim();

  const verifyUrl = `${META_BASE}/act_${accountId}?${new URLSearchParams({ fields: "id,name,account_status", access_token: token })}`;
  const verifyRes = await fetch(verifyUrl, { cache: "no-store" });
  const verifyJson = await verifyRes.json();
  if (verifyJson.error) throw new Error(verifyJson.error.message);
  const checkedAt = new Date().toISOString();

  const metaCampaigns = await metaFetchAll<MetaCampaign>(`act_${accountId}/campaigns`, {
    fields: "id,name,status,objective,insights.date_preset(last_30d){spend,impressions,clicks,ctr,cpc,cpm,conversions}",
    limit: "100",
    access_token: token,
  });

  const existingCampaigns: { id: string; meta_campaign_id: string | null }[] =
    await dbGet(supabaseUrl, svcKey, `campaigns?client_id=eq.${clientId}&select=id,meta_campaign_id`);
  const campaignMap = new Map<string, string>();
  (existingCampaigns || []).forEach(c => { if (c.meta_campaign_id) campaignMap.set(c.meta_campaign_id, c.id); });

  for (const campaign of metaCampaigns) {
    const insight = campaign.insights?.data?.[0];
    const payload = {
      client_id: clientId,
      meta_campaign_id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      objective: campaign.objective ?? null,
      spend: n(insight?.spend),
      impressions: ni(insight?.impressions),
      clicks: ni(insight?.clicks),
      ctr: n(insight?.ctr),
      cpc: n(insight?.cpc),
      cpm: n(insight?.cpm),
      conversions: ni(insight?.conversions),
    };

    const existingId = campaignMap.get(campaign.id);
    if (existingId) {
      await dbPatch(supabaseUrl, svcKey, `campaigns?id=eq.${existingId}`, payload);
    } else {
      const row = await dbInsert(supabaseUrl, svcKey, "campaigns", payload);
      if (row) campaignMap.set(campaign.id, row.id);
    }
  }

  const metaAdSets = await metaFetchAll<MetaAdSet>(`act_${accountId}/adsets`, {
    fields: "id,name,status,campaign_id,insights.date_preset(last_30d){spend,impressions,clicks}",
    limit: "200",
    access_token: token,
  });

  const campaignInternalIds = [...campaignMap.values()];
  const existingAdSets: { id: string; meta_adset_id: string | null }[] = campaignInternalIds.length
    ? await dbGet(supabaseUrl, svcKey, `ad_sets?campaign_id=in.(${campaignInternalIds.join(",")})&select=id,meta_adset_id`)
    : [];
  const adSetMap = new Map<string, string>();
  (existingAdSets || []).forEach(a => { if (a.meta_adset_id) adSetMap.set(a.meta_adset_id, a.id); });

  for (const adSet of metaAdSets) {
    const campaignInternalId = campaignMap.get(adSet.campaign_id);
    if (!campaignInternalId) continue;

    const insight = adSet.insights?.data?.[0];
    const payload = {
      campaign_id: campaignInternalId,
      meta_adset_id: adSet.id,
      name: adSet.name,
      status: adSet.status,
      spend: n(insight?.spend),
      impressions: ni(insight?.impressions),
      clicks: ni(insight?.clicks),
    };

    const existingId = adSetMap.get(adSet.id);
    if (existingId) {
      await dbPatch(supabaseUrl, svcKey, `ad_sets?id=eq.${existingId}`, payload);
    } else {
      const row = await dbInsert(supabaseUrl, svcKey, "ad_sets", payload);
      if (row) adSetMap.set(adSet.id, row.id);
    }
  }

  const metaAds = await metaFetchAll<MetaAd>(`act_${accountId}/ads`, {
    fields: "id,name,status,adset_id,creative{thumbnail_url,image_url,body,title,object_type,video_id},insights.date_preset(last_30d){spend,impressions,clicks}",
    limit: "500",
    access_token: token,
  });

  const adSetInternalIds = [...adSetMap.values()];
  const existingAds: { id: string; meta_ad_id: string | null }[] = adSetInternalIds.length
    ? await dbGet(supabaseUrl, svcKey, `ads?ad_set_id=in.(${adSetInternalIds.join(",")})&select=id,meta_ad_id`)
    : [];
  const adMap = new Map<string, string>();
  (existingAds || []).forEach(a => { if (a.meta_ad_id) adMap.set(a.meta_ad_id, a.id); });

  for (const ad of metaAds) {
    const adSetInternalId = adSetMap.get(ad.adset_id);
    if (!adSetInternalId) continue;

    const insight = ad.insights?.data?.[0];
    const creative = ad.creative;
    const creativeType = creative?.object_type === "VIDEO" || creative?.video_id ? "video" : "image";
    const payload = {
      ad_set_id: adSetInternalId,
      meta_ad_id: ad.id,
      name: ad.name,
      status: ad.status,
      spend: n(insight?.spend),
      impressions: ni(insight?.impressions),
      clicks: ni(insight?.clicks),
      thumbnail_url: creative?.thumbnail_url ?? null,
      image_url: creative?.image_url ?? null,
      video_id: creative?.video_id ?? null,
      body: creative?.body ?? null,
      title: creative?.title ?? null,
      creative_type: creativeType,
      creative_synced_at: new Date().toISOString(),
    };

    const existingId = adMap.get(ad.id);
    if (existingId) {
      await dbPatch(supabaseUrl, svcKey, `ads?id=eq.${existingId}`, payload);
    } else {
      const row = await dbInsert(supabaseUrl, svcKey, "ads", payload);
      if (row) adMap.set(ad.id, row.id);
    }
  }

  const dailyData = await metaFetchAll<MetaInsight & { date_start: string }>(`act_${accountId}/insights`, {
    fields: "spend,impressions,clicks,date_start",
    time_increment: "1",
    date_preset: "last_30d",
    level: "account",
    access_token: token,
  });

  for (const day of dailyData) {
    await dbUpsert(supabaseUrl, svcKey, "campaign_daily_metrics", "client_id,date", {
      client_id: clientId,
      date: day.date_start,
      spend: n(day.spend),
      impressions: ni(day.impressions),
      clicks: ni(day.clicks),
    });
  }

  const completedAt = new Date().toISOString();
  const [clientRow] = await dbGet(supabaseUrl, svcKey, `clients?id=eq.${clientId}&select=meta_sync_runs&limit=1`);
  await dbPatch(supabaseUrl, svcKey, `clients?id=eq.${clientId}`, {
    meta_connected_at: completedAt,
    meta_last_sync_at: completedAt,
    meta_last_verified_at: checkedAt,
    meta_last_sync_error: null,
    meta_sync_status: "healthy",
    meta_sync_runs: ((clientRow?.meta_sync_runs as number | null) ?? 0) + 1,
  });

  return { campaigns: metaCampaigns.length, adSets: metaAdSets.length, ads: metaAds.length, days: dailyData.length };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

interface ClientRow {
  id: string;
  name: string;
  meta_ad_account_id: string | null;
  meta_token_configured: boolean | null;
  meta_auto_sync_enabled: boolean;
  meta_auto_sync_frequency_hours: number;
  meta_last_sync_at: string | null;
}

function isDue(client: ClientRow): boolean {
  if (!client.meta_auto_sync_enabled || !client.meta_ad_account_id || !client.meta_token_configured) return false;
  if (!client.meta_last_sync_at) return true;
  const lastSync = new Date(client.meta_last_sync_at).getTime();
  const frequencyMs = (client.meta_auto_sync_frequency_hours || 24) * 60 * 60 * 1000;
  return Date.now() - lastSync >= frequencyMs;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
      },
    });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const startedAt = new Date().toISOString();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
  let runSuccess = true;
  let runSummary: Record<string, unknown> = {};
  let runError: string | null = null;

  try {
    if (!supabaseUrl || !svcKey) throw new Error("SUPABASE_URL / SVC_ROLE_KEY não configurados");

    const clients: ClientRow[] = await dbGet(
      supabaseUrl, svcKey,
      `clients?status=eq.active&meta_auto_sync_enabled=eq.true&select=id,name,meta_ad_account_id,meta_token_configured,meta_auto_sync_enabled,meta_auto_sync_frequency_hours,meta_last_sync_at`
    );

    // Limita quantos clientes sincroniza por execucao: com dezenas de clientes
    // atrasados de uma vez (ex: backlog acumulado), processar todos numa unica
    // invocacao arrisca estourar o timeout da edge function. Prioriza os mais
    // atrasados e deixa o resto para a proxima hora.
    const MAX_PER_RUN = 10;
    const allDueClients = (clients || [])
      .filter(isDue)
      .sort((a, b) => {
        const aTime = a.meta_last_sync_at ? new Date(a.meta_last_sync_at).getTime() : 0;
        const bTime = b.meta_last_sync_at ? new Date(b.meta_last_sync_at).getTime() : 0;
        return aTime - bTime;
      });
    const dueClients = allDueClients.slice(0, MAX_PER_RUN);
    const results: { client: string; ok: boolean; error?: string; campaigns?: number; days?: number }[] = [];

    for (const client of dueClients) {
      try {
        // O token vive em client_secrets, que so o service_role enxerga.
        const [secret]: Array<{ meta_access_token: string | null }> = await dbGet(
          supabaseUrl, svcKey,
          `client_secrets?client_id=eq.${client.id}&select=meta_access_token&limit=1`
        );
        const token = secret?.meta_access_token?.trim();
        if (!token) throw new Error("Cliente sem token da Meta no cofre");

        const result = await syncClientData(supabaseUrl, svcKey, client.id, client.meta_ad_account_id!, token);
        results.push({ client: client.name, ok: true, campaigns: result.campaigns, days: result.days });
      } catch (err) {
        const message = (err as Error).message;
        results.push({ client: client.name, ok: false, error: message });
        await dbPatch(supabaseUrl, svcKey, `clients?id=eq.${client.id}`, {
          meta_last_sync_error: message,
          meta_sync_status: inferSyncStatusFromError(message),
        }).catch(() => {});
      }
    }

    runSummary = {
      checked: (clients || []).length,
      due: allDueClients.length,
      processed: dueClients.length,
      synced: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results,
    };

    return new Response(JSON.stringify({ success: true, ...runSummary }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    runSuccess = false;
    runError = (err as Error).message;
    return new Response(JSON.stringify({ error: runError }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    dbInsert(supabaseUrl, svcKey, "automation_runs", {
      job_name: "sync-meta-cron",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      success: runSuccess,
      summary: runSummary,
      error: runError,
    }).catch(() => {});
  }
});
