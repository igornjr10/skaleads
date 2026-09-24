// Chamada pelo pg_cron com Authorization: Bearer <anon key> (satisfaz o
// verify_jwt do gateway) + x-cron-secret proprio, mesmo padrao de
// run-alerts-cron e run-report-schedules. Sem o Authorization no cron
// registrado, o gateway rejeita a chamada com 401 antes do handler rodar.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sendText } from "../_shared/whatsapp.ts";

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

// Espelha src/lib/local-business.ts. Aqui e Deno e nao da para importar de
// `src/`, entao as regras vivem duplicadas — mudou la, muda aqui.
interface MetaAction {
  action_type?: string;
  value?: string;
}

function sumActions(actions: MetaAction[] | undefined, predicate: (type: string) => boolean): number {
  if (!actions?.length) return 0;
  return actions.reduce((total, action) => {
    const type = (action.action_type ?? "").toLowerCase();
    if (!predicate(type)) return total;
    return total + (parseInt(action.value ?? "0", 10) || 0);
  }, 0);
}

// Campanha de mensagem nunca preenche `conversions`: o resultado dela chega
// dentro de `actions`. Sem isto o dashboard do cliente mostra "gastou e nao
// converteu" numa campanha que trouxe 51 conversas no WhatsApp.
function extractMessages(actions?: MetaAction[]): number {
  return sumActions(actions, t => t.includes("messaging_conversation_started"));
}

function extractLocalActions(actions?: MetaAction[]) {
  return {
    messages: extractMessages(actions),
    calls: sumActions(actions, t => t.includes("click_to_call") || t.includes("call_confirm")),
    directions: sumActions(actions, t => t.includes("get_directions") || t.includes("find_location")),
    leads: sumActions(actions, t => {
      const isMessaging = t.includes("messaging");
      return !isMessaging && (t === "lead" || t.includes("leadgen") || t.includes(".lead"));
    }),
    profileVisits: sumActions(actions, t =>
      (t.includes("instagram") || t.includes("ig_") || t.includes(".ig")) &&
      t.includes("profile") && (t.includes("visit") || t.includes("view"))
    ),
  };
}

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
}

interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
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

// A Graph API responde `code: 1` ("Please reduce the amount of data you're
// asking for") quando a query custa caro demais pra ser resolvida na hora, e
// 4/17/32/613 quando esta limitando a taxa. Nos dois casos a reacao util e a
// mesma: lote menor e backoff antes de desistir.
const RETRYABLE_META_CODES = new Set([1, 4, 17, 32, 613]);

function isRetryableMetaError(error?: { message?: string; code?: number }): boolean {
  if (!error) return false;
  if (typeof error.code === "number" && RETRYABLE_META_CODES.has(error.code)) return true;
  return /reduce the amount of data|too much data/i.test(error.message ?? "");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function metaCollectPages<T>(path: string, params: Record<string, string>): Promise<T[]> {
  let url: string | undefined = `${META_BASE}/${path}?${new URLSearchParams(params)}`;
  const items: T[] = [];
  let pages = 0;

  while (url && pages < 400) {
    const res = await fetch(url, { cache: "no-store" });
    const json: MetaPagedResponse<T> = await res.json();
    if (json.error) {
      const err = new Error(json.error.message) as Error & { retryable?: boolean };
      err.retryable = isRetryableMetaError(json.error);
      throw err;
    }
    items.push(...(json.data ?? []));
    url = json.paging?.next;
    pages++;
  }

  return items;
}

async function metaFetchAll<T>(
  path: string,
  params: Record<string, string>,
  startLimit = 100
): Promise<T[]> {
  let limit = Number(params.limit) || startLimit;
  let attempt = 0;

  for (;;) {
    try {
      return await metaCollectPages<T>(path, { ...params, limit: String(limit) });
    } catch (error) {
      const retryable = (error as { retryable?: boolean }).retryable === true;
      if (!retryable || limit <= 10) {
        if (retryable) {
          throw new Error(
            `A Meta recusou a consulta por volume de dados mesmo em lotes de ${limit}. Tente novamente em alguns minutos.`
          );
        }
        throw error;
      }
      limit = Math.max(10, Math.floor(limit / 4));
      attempt++;
      await sleep(Math.min(4000, 400 * 2 ** attempt));
    }
  }
}

interface MetaLevelInsight {
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  conversions?: string;
  actions?: MetaAction[];
}

// Pedir `insights` aninhado em /campaigns, /adsets ou /ads faz a Meta calcular
// um relatorio por entidade e estoura o limite de volume da conta (erro 1). Um
// unico relatorio da conta no nivel desejado devolve o mesmo dado bem mais barato.
async function fetchInsightsByLevel(
  accountId: string,
  token: string,
  level: "campaign" | "adset" | "ad",
): Promise<Map<string, MetaLevelInsight>> {
  const idField = `${level}_id` as "campaign_id" | "adset_id" | "ad_id";

  const rows = await metaFetchAll<MetaLevelInsight>(`act_${accountId}/insights`, {
    fields: `${idField},spend,impressions,clicks,ctr,cpc,cpm,conversions,actions`,
    level,
    date_preset: "last_30d",
    access_token: token,
  }, 200);

  const byId = new Map<string, MetaLevelInsight>();
  for (const row of rows) {
    const id = row[idField];
    if (id) byId.set(id, row);
  }

  return byId;
}

function inferSyncStatusFromError(message: string): "expired" | "error" | "warning" {
  const text = message.toLowerCase();
  if (
    text.includes("invalid oauth") || text.includes("session has expired") ||
    text.includes("access token") || text.includes("permissions error") || text.includes("expired")
  ) {
    return "expired";
  }
  if (
    text.includes("rate limit") || text.includes("temporar") || text.includes("try again") ||
    text.includes("volume de dados") || text.includes("reduce the amount of data")
  ) return "warning";
  return "error";
}

interface SyncResult {
  campaigns: number;
  adSets: number;
  ads: number;
  days: number;
  /** Aportes recentes o bastante para virar aviso no WhatsApp. */
  newDeposits: NewDeposit[];
  /** Quantos eventos de dinheiro entraram na tabela nesta execucao. */
  fundingEventsRecorded: number;
  balanceCents: number | null;
}

export interface NewDeposit {
  amount: number;
  at: string;
  network: string | null;
}

// ─── Saldo e aportes (espelha src/lib/meta-funding.ts) ────────────────────────

const PREPAID_FUNDING_TYPE = 20;

function parseBalanceCents(label?: string | null): number | null {
  if (!label) return null;

  // So numero colado num marcador de moeda: em conta de cartao o mesmo campo
  // traz "Visa *1234", que viraria um saldo de R$ 1.234,00.
  const match =
    label.match(/(?:R\$|US\$|\$|€)\s*([\d][\d.,\s]*\d|\d)/) ??
    label.match(/([\d][\d.,\s]*\d|\d)\s*(?:BRL|USD|EUR)/);
  if (!match) return null;

  let raw = match[1].replace(/\s/g, "");
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  if (lastComma > lastDot) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma) raw = raw.replace(/,/g, "");
  else raw = raw.replace(/[.,]/g, "");

  const value = Number(raw);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

type ExtraData = Record<string, unknown>;

function parseExtra(raw: unknown): ExtraData | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as ExtraData;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as ExtraData) : null;
  } catch {
    return null;
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

interface RawActivity {
  event_type?: string;
  event_time?: string;
  extra_data?: string;
}

interface FundingRow {
  client_id: string;
  event_type: string;
  event_time: string;
  amount_cents: number;
  currency: string | null;
  network_id: string | null;
  transaction_id: string | null;
  extra_data: ExtraData | null;
}

function toFundingRow(clientId: string, row: RawActivity): FundingRow | null {
  const type = row.event_type;
  if (type !== "funding_event_successful" && type !== "ad_account_billing_charge") return null;
  if (!row.event_time) return null;

  const extra = parseExtra(row.extra_data);
  // Deposito guarda o valor em `amount`; cobranca em `new_value`. Centavos nos dois.
  const rawAmount = type === "funding_event_successful" ? extra?.amount : extra?.new_value;
  const amount = typeof rawAmount === "string" ? Number(rawAmount) : rawAmount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;

  return {
    client_id: clientId,
    event_type: type,
    event_time: new Date(row.event_time).toISOString(),
    amount_cents: Math.round(amount),
    currency: str(extra?.currency),
    network_id: str(extra?.network_id),
    transaction_id: str(extra?.transaction_id),
    extra_data: extra,
  };
}

// POST com resolution=ignore-duplicates devolve so as linhas inseridas de fato —
// e essa a resposta para "entrou dinheiro novo desde o sync passado?".
async function dbInsertNew<T>(url: string, key: string, table: string, onConflict: string, rows: object[]): Promise<T[]> {
  if (rows.length === 0) return [];
  const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`POST ${table} falhou (${res.status}): ${await res.text().catch(() => "")}`);
  return await res.json();
}

async function syncFunding(
  supabaseUrl: string, svcKey: string, clientId: string, accountId: string, token: string
): Promise<{ balanceCents: number | null; newDeposits: NewDeposit[]; recorded: number; patch: Record<string, unknown> }> {
  const accountUrl = `${META_BASE}/act_${accountId}?${new URLSearchParams({
    fields: "balance,amount_spent,spend_cap,currency,funding_source_details",
    access_token: token,
  })}`;
  const account = await fetch(accountUrl, { cache: "no-store" }).then(r => r.json());
  if (account.error) throw new Error(account.error.message);

  const details = account.funding_source_details;
  const fundingType = typeof details?.type === "number" ? details.type : null;
  const label = details?.display_string ?? null;
  const balanceCents = fundingType === PREPAID_FUNDING_TYPE ? parseBalanceCents(label) : null;

  const since = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const cutoff = new Date(`${since}T00:00:00Z`).getTime();

  // A edge /activities nao documenta parametro nenhum, entao `since` pode estar
  // sendo ignorado. Paginar ate passar do corte cobre os dois casos, e evita
  // que uma conta movimentada empurre o aporte do dia 1 para fora da primeira
  // pagina de 100 eventos.
  const raw: RawActivity[] = [];
  let after: string | undefined;

  for (let page = 0; page < 10; page++) {
    const url = `${META_BASE}/act_${accountId}/activities?${new URLSearchParams({
      fields: "event_type,event_time,extra_data",
      since,
      limit: "100",
      access_token: token,
      ...(after ? { after } : {}),
    })}`;
    const activities = await fetch(url, { cache: "no-store" }).then(r => r.json());
    if (activities.error) throw new Error(activities.error.message);

    const pageRows: RawActivity[] = activities.data ?? [];
    raw.push(...pageRows);

    const passedCutoff = pageRows.some((r: RawActivity) => {
      const time = r.event_time ? new Date(r.event_time).getTime() : NaN;
      return Number.isFinite(time) && time < cutoff;
    });
    if (passedCutoff || pageRows.length === 0) break;

    after = activities.paging?.cursors?.after;
    if (!after) break;
  }

  const rows = raw
    .map((row: RawActivity) => toFundingRow(clientId, row))
    .filter((row: FundingRow | null): row is FundingRow => row !== null)
    .filter((row: FundingRow) => new Date(row.event_time).getTime() >= cutoff);

  const inserted = await dbInsertNew<FundingRow>(
    supabaseUrl, svcKey, "client_funding_events", "client_id,event_type,event_time,amount_cents", rows
  );

  // "Inserido agora" nao e o mesmo que "aconteceu agora". Na primeira execucao a
  // tabela esta vazia, entao o mes inteiro entra de uma vez — sem este corte o
  // gestor receberia no WhatsApp todo aporte antigo do cliente de uma so vez.
  // O cron roda de hora em hora, logo um aporte real e sempre recente quando e
  // descoberto; 24h da folga para o cron ter falhado algumas vezes.
  const NOTIFY_WINDOW_MS = 24 * 60 * 60 * 1000;
  const notifyAfter = Date.now() - NOTIFY_WINDOW_MS;

  const newDeposits: NewDeposit[] = inserted
    .filter(row => row.event_type === "funding_event_successful")
    .filter(row => new Date(row.event_time).getTime() >= notifyAfter)
    .map(row => ({
      amount: row.amount_cents / 100,
      at: row.event_time,
      network: row.network_id,
    }));

  return {
    balanceCents,
    newDeposits,
    recorded: inserted.length,
    patch: {
      meta_balance_cents: balanceCents,
      meta_balance_label: label,
      meta_funding_type: fundingType,
      meta_balance_at: new Date().toISOString(),
    },
  };
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
    fields: "id,name,status,objective",
    access_token: token,
  }, 200);

  const campaignInsights = await fetchInsightsByLevel(accountId, token, "campaign");

  const existingCampaigns: { id: string; meta_campaign_id: string | null }[] =
    await dbGet(supabaseUrl, svcKey, `campaigns?client_id=eq.${clientId}&select=id,meta_campaign_id`);
  const campaignMap = new Map<string, string>();
  (existingCampaigns || []).forEach(c => { if (c.meta_campaign_id) campaignMap.set(c.meta_campaign_id, c.id); });

  for (const campaign of metaCampaigns) {
    const insight = campaignInsights.get(campaign.id);
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
      messages: extractMessages(insight?.actions),
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
    fields: "id,name,status,campaign_id",
    access_token: token,
  }, 200);

  const adSetInsights = await fetchInsightsByLevel(accountId, token, "adset");

  const campaignInternalIds = [...campaignMap.values()];
  const existingAdSets: { id: string; meta_adset_id: string | null }[] = campaignInternalIds.length
    ? await dbGet(supabaseUrl, svcKey, `ad_sets?campaign_id=in.(${campaignInternalIds.join(",")})&select=id,meta_adset_id`)
    : [];
  const adSetMap = new Map<string, string>();
  (existingAdSets || []).forEach(a => { if (a.meta_adset_id) adSetMap.set(a.meta_adset_id, a.id); });

  for (const adSet of metaAdSets) {
    const campaignInternalId = campaignMap.get(adSet.campaign_id);
    if (!campaignInternalId) continue;

    const insight = adSetInsights.get(adSet.id);
    const payload = {
      campaign_id: campaignInternalId,
      meta_adset_id: adSet.id,
      name: adSet.name,
      status: adSet.status,
      spend: n(insight?.spend),
      impressions: ni(insight?.impressions),
      clicks: ni(insight?.clicks),
      messages: extractMessages(insight?.actions),
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
    fields: "id,name,status,adset_id,creative{thumbnail_url,image_url,body,title,object_type,video_id}",
    access_token: token,
  }, 100);

  const adInsights = await fetchInsightsByLevel(accountId, token, "ad");

  const adSetInternalIds = [...adSetMap.values()];
  const existingAds: { id: string; meta_ad_id: string | null }[] = adSetInternalIds.length
    ? await dbGet(supabaseUrl, svcKey, `ads?ad_set_id=in.(${adSetInternalIds.join(",")})&select=id,meta_ad_id`)
    : [];
  const adMap = new Map<string, string>();
  (existingAds || []).forEach(a => { if (a.meta_ad_id) adMap.set(a.meta_ad_id, a.id); });

  for (const ad of metaAds) {
    const adSetInternalId = adSetMap.get(ad.adset_id);
    if (!adSetInternalId) continue;

    const insight = adInsights.get(ad.id);
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
      messages: extractMessages(insight?.actions),
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

  const dailyData = await metaFetchAll<MetaInsight & { date_start: string; actions?: MetaAction[] }>(`act_${accountId}/insights`, {
    fields: "spend,impressions,clicks,actions,date_start",
    time_increment: "1",
    date_preset: "last_30d",
    level: "account",
    access_token: token,
  });

  for (const day of dailyData) {
    const local = extractLocalActions(day.actions);
    await dbUpsert(supabaseUrl, svcKey, "campaign_daily_metrics", "client_id,date", {
      client_id: clientId,
      date: day.date_start,
      spend: n(day.spend),
      impressions: ni(day.impressions),
      clicks: ni(day.clicks),
      messages: local.messages,
      calls: local.calls,
      directions: local.directions,
      leads: local.leads,
      profile_visits: local.profileVisits,
    });
  }

  // Saldo e aporte sao extras vindos de um texto formatado e de um log sem
  // contrato: falhar aqui nao pode custar o sync de campanha e metrica.
  let funding: { balanceCents: number | null; newDeposits: NewDeposit[]; recorded: number; patch: Record<string, unknown> } = {
    balanceCents: null, newDeposits: [], recorded: 0, patch: {},
  };
  try {
    funding = await syncFunding(supabaseUrl, svcKey, clientId, accountId, token);
  } catch (_err) { /* nao-bloqueante por design */ }

  const completedAt = new Date().toISOString();
  const [clientRow] = await dbGet(supabaseUrl, svcKey, `clients?id=eq.${clientId}&select=meta_sync_runs&limit=1`);
  await dbPatch(supabaseUrl, svcKey, `clients?id=eq.${clientId}`, {
    ...funding.patch,
    meta_connected_at: completedAt,
    meta_last_sync_at: completedAt,
    meta_last_verified_at: checkedAt,
    meta_last_sync_error: null,
    meta_sync_status: "healthy",
    meta_sync_runs: ((clientRow?.meta_sync_runs as number | null) ?? 0) + 1,
  });

  return {
    campaigns: metaCampaigns.length,
    adSets: metaAdSets.length,
    ads: metaAds.length,
    days: dailyData.length,
    newDeposits: funding.newDeposits,
    fundingEventsRecorded: funding.recorded,
    balanceCents: funding.balanceCents,
  };
}

// ─── Aviso de deposito ────────────────────────────────────────────────────────

const BRL = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;

function depositMessage(clientName: string, deposits: NewDeposit[], balanceCents: number | null): string {
  const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://manager.marketprosystem.com";
  const total = deposits.reduce((sum, d) => sum + d.amount, 0);

  const lines = deposits.map(d => {
    const quando = new Date(d.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    return `• ${BRL(d.amount)}${d.network ? ` via ${d.network}` : ""} — ${quando}`;
  });

  return [
    `💰 *${clientName} depositou na conta*`,
    "",
    ...lines,
    deposits.length > 1 ? `\n*Total:* ${BRL(total)}` : "",
    balanceCents !== null ? `*Saldo agora:* ${BRL(balanceCents / 100)}` : "",
    "",
    `🔗 ${siteUrl}/clients`,
  ].filter(Boolean).join("\n");
}

/** Numero do gestor da conta; cai no numero padrao quando o cliente nao tem gestor. */
async function resolveManagerNumber(url: string, key: string, clientId: string): Promise<string | null> {
  const [client] = await dbGet(url, key, `clients?id=eq.${clientId}&select=manager_id&limit=1`);
  if (client?.manager_id) {
    const [manager] = await dbGet(url, key, `managers?id=eq.${client.manager_id}&select=whatsapp_number,is_active&limit=1`);
    if (manager?.is_active && manager.whatsapp_number) return manager.whatsapp_number as string;
  }
  return Deno.env.get("MANAGER_WHATSAPP_NUMBER") || null;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

interface ClientRow {
  id: string;
  name: string;
  meta_ad_account_id: string | null;
  meta_access_token: string | null;
  meta_auto_sync_enabled: boolean;
  meta_auto_sync_frequency_hours: number;
  meta_last_sync_at: string | null;
}

function isDue(client: ClientRow): boolean {
  if (!client.meta_auto_sync_enabled || !client.meta_ad_account_id || !client.meta_access_token) return false;
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
      `clients?status=eq.active&meta_auto_sync_enabled=eq.true&select=id,name,meta_ad_account_id,meta_access_token,meta_auto_sync_enabled,meta_auto_sync_frequency_hours,meta_last_sync_at`
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
    const whatsappConfigured = !!(Deno.env.get("UAZAPI_URL") && Deno.env.get("UAZAPI_TOKEN"));
    const results: { client: string; ok: boolean; error?: string; campaigns?: number; days?: number; fundingEvents?: number; avisos?: number }[] = [];

    for (const client of dueClients) {
      try {
        const result = await syncClientData(supabaseUrl, svcKey, client.id, client.meta_ad_account_id!, client.meta_access_token!);
        results.push({
          client: client.name,
          ok: true,
          campaigns: result.campaigns,
          days: result.days,
          fundingEvents: result.fundingEventsRecorded,
          avisos: result.newDeposits.length,
        });

        // O aviso nao pode derrubar o sync: o deposito ja esta gravado, e sem a
        // gravacao ele seria reenviado a cada hora.
        if (result.newDeposits.length > 0 && whatsappConfigured) {
          try {
            const number = await resolveManagerNumber(supabaseUrl, svcKey, client.id);
            if (number) {
              await sendText(number, depositMessage(client.name, result.newDeposits, result.balanceCents));
            }
          } catch (_err) { /* nao-bloqueante */ }
        }
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
