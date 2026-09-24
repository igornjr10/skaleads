// Saldo e aportes da conta Meta.
//
// A Graph API nao tem edge de transacoes nem campo de "saldo disponivel". O que
// existe, e que a sondagem de 17/09/2026 confirmou funcionar, sao dois desvios:
//
//   funding_source_details.display_string -> "Saldo disponivel (R$689,05 BRL)"
//   /activities                           -> funding_event_successful (deposito)
//                                            ad_account_billing_charge (cobranca)
//
// Os dois sao informais: um e texto formatado, o outro e um log de auditoria sem
// parametros documentados. Por isso tudo aqui degrada em vez de quebrar — sem
// saldo o card cai no valor digitado a mao, sem aporte o mes fica como estava.

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { metaGet } from "@/lib/meta-fetch";

const META_BASE = "https://graph.facebook.com/v21.0";

/** `funding_source_details.type` 20 = saldo pre-pago. Pos-pago nunca tem aporte. */
export const PREPAID_FUNDING_TYPE = 20;

export type FundingEventType = "funding_event_successful" | "ad_account_billing_charge";

export interface AccountFunding {
  balanceCents: number | null;
  balanceLabel: string | null;
  fundingType: number | null;
  /** `balance` da conta: fatura em aberto, nao saldo. Guardado so para conferencia. */
  billAmountCents: number;
  amountSpentCents: number;
  spendCapCents: number;
  currency: string | null;
}

export interface FundingEvent {
  eventType: FundingEventType;
  eventTime: string;
  amountCents: number;
  currency: string | null;
  networkId: string | null;
  transactionId: string | null;
  extraData: Record<string, unknown> | null;
}

export interface StoredFundingEvent extends FundingEvent {
  id: string;
  clientId: string;
}

// ─── Parse ────────────────────────────────────────────────────────────────────

/**
 * Extrai centavos de um `display_string`.
 *
 * So aceita numero colado num marcador de moeda. Sem essa exigencia um cartao
 * ("Visa *1234") viraria um saldo de R$ 1.234,00 — o campo e o mesmo para os
 * dois tipos de financiamento.
 */
export function parseBalanceCents(label?: string | null): number | null {
  if (!label) return null;

  const match =
    label.match(/(?:R\$|US\$|\$|€)\s*([\d][\d.,\s]*\d|\d)/) ??
    label.match(/([\d][\d.,\s]*\d|\d)\s*(?:BRL|USD|EUR)/);
  if (!match) return null;

  let raw = match[1].replace(/\s/g, "");
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");

  // O separador decimal e o ultimo que aparece: "1.229,91" (pt-BR) e
  // "1,229.91" (en-US) carregam o mesmo valor com os papeis trocados.
  if (lastComma > lastDot) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma) raw = raw.replace(/,/g, "");
  else raw = raw.replace(/[.,]/g, "");

  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function parseExtraData(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asCents(value: unknown): number | null {
  const num = typeof value === "string" ? Number(value) : value;
  return typeof num === "number" && Number.isFinite(num) ? Math.round(num) : null;
}

interface RawActivity {
  event_type?: string;
  event_time?: string;
  extra_data?: string;
}

/**
 * Converte uma linha do log em evento de dinheiro, ou null se nao for uma.
 *
 * O valor muda de campo conforme o evento: deposito usa `amount`, cobranca usa
 * `new_value`. Ambos em centavos.
 */
export function parseFundingActivity(row: RawActivity): FundingEvent | null {
  const eventType = row.event_type;
  if (eventType !== "funding_event_successful" && eventType !== "ad_account_billing_charge") return null;
  if (!row.event_time) return null;

  const extra = parseExtraData(row.extra_data);
  const amountCents = asCents(
    eventType === "funding_event_successful" ? extra?.amount : extra?.new_value
  );
  if (amountCents === null || amountCents <= 0) return null;

  return {
    eventType,
    eventTime: new Date(row.event_time).toISOString(),
    amountCents,
    currency: typeof extra?.currency === "string" ? extra.currency : null,
    networkId: typeof extra?.network_id === "string" ? extra.network_id : null,
    transactionId: typeof extra?.transaction_id === "string" ? extra.transaction_id : null,
    extraData: extra,
  };
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

function normalizeAccountId(id: string): string {
  return id.startsWith("act_") ? id.slice(4) : id.trim();
}

export async function fetchAccountFunding(adAccountId: string, accessToken: string): Promise<AccountFunding> {
  const accountId = normalizeAccountId(adAccountId);

  const json = await metaGet<{
    balance?: string;
    amount_spent?: string;
    spend_cap?: string;
    currency?: string;
    funding_source_details?: { display_string?: string; type?: number };
  }>(META_BASE, `act_${accountId}`, {
    fields: "balance,amount_spent,spend_cap,currency,funding_source_details",
    access_token: accessToken.trim(),
  });

  const details = json.funding_source_details;
  const fundingType = typeof details?.type === "number" ? details.type : null;
  const balanceLabel = details?.display_string ?? null;

  return {
    // Fora do pre-pago o `display_string` descreve um cartao, nao um saldo.
    balanceCents: fundingType === PREPAID_FUNDING_TYPE ? parseBalanceCents(balanceLabel) : null,
    balanceLabel,
    fundingType,
    billAmountCents: asCents(json.balance) ?? 0,
    amountSpentCents: asCents(json.amount_spent) ?? 0,
    spendCapCents: asCents(json.spend_cap) ?? 0,
    currency: json.currency ?? null,
  };
}

interface ActivitiesResponse {
  data?: RawActivity[];
  paging?: { cursors?: { after?: string } };
}

/**
 * Le o log de atividades ate cobrir `sinceIso`, e devolve so o que e dinheiro.
 *
 * A pagina da edge `/activities` na Meta nao documenta parametro nenhum, entao
 * `since` pode estar sendo ignorado. O corte por data e refeito aqui, e a
 * paginacao para sozinha ao passar do periodo — assim funciona nos dois casos.
 */
export async function fetchFundingEvents(
  adAccountId: string,
  accessToken: string,
  sinceIso: string,
  maxPages = 10
): Promise<FundingEvent[]> {
  const accountId = normalizeAccountId(adAccountId);
  const token = accessToken.trim();
  const cutoff = new Date(sinceIso).getTime();

  const rows: RawActivity[] = [];
  let after: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const json = await metaGet<ActivitiesResponse>(META_BASE, `act_${accountId}/activities`, {
      fields: "event_type,event_time,extra_data",
      since: sinceIso.slice(0, 10),
      limit: "100",
      access_token: token,
      ...(after ? { after } : {}),
    });

    const page_rows = json.data ?? [];
    rows.push(...page_rows);

    const reachedCutoff = page_rows.some((row) => {
      const time = row.event_time ? new Date(row.event_time).getTime() : NaN;
      return Number.isFinite(time) && time < cutoff;
    });
    if (reachedCutoff || page_rows.length === 0) break;

    after = json.paging?.cursors?.after;
    if (!after) break;
  }

  return rows
    .map(parseFundingActivity)
    .filter((event): event is FundingEvent => event !== null)
    .filter((event) => new Date(event.eventTime).getTime() >= cutoff);
}

// ─── Persistencia ─────────────────────────────────────────────────────────────

/**
 * Grava os eventos e devolve so os que nao existiam.
 *
 * `ignoreDuplicates` faz o select voltar apenas as linhas inseridas de fato, que
 * e exatamente a resposta para "entrou dinheiro novo desde o ultimo sync?".
 */
export async function persistFundingEvents(
  clientId: string,
  events: FundingEvent[]
): Promise<StoredFundingEvent[]> {
  if (events.length === 0) return [];

  const { data, error } = await supabase
    .from("client_funding_events")
    .upsert(
      events.map((event) => ({
        client_id: clientId,
        event_type: event.eventType,
        event_time: event.eventTime,
        amount_cents: event.amountCents,
        currency: event.currency,
        network_id: event.networkId,
        transaction_id: event.transactionId,
        extra_data: (event.extraData ?? null) as Json,
      })),
      { onConflict: "client_id,event_type,event_time,amount_cents", ignoreDuplicates: true }
    )
    .select("id, client_id, event_type, event_time, amount_cents, currency, network_id, transaction_id");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    clientId: row.client_id as string,
    eventType: row.event_type as FundingEventType,
    eventTime: row.event_time as string,
    amountCents: row.amount_cents as number,
    currency: (row.currency as string | null) ?? null,
    networkId: (row.network_id as string | null) ?? null,
    transactionId: (row.transaction_id as string | null) ?? null,
    extraData: null,
  }));
}

// ─── Leitura para a tela ──────────────────────────────────────────────────────

export function firstOfMonthIso(now: Date = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export interface ClientFundingSummary {
  /** Soma dos aportes do mes corrente, em reais. */
  depositedThisMonth: number;
  depositCount: number;
  lastDepositAt: string | null;
  lastDepositAmount: number | null;
  lastDepositNetwork: string | null;
}

export function summarizeDeposits(
  events: Array<Pick<FundingEvent, "eventType" | "eventTime" | "amountCents" | "networkId">>,
  now: Date = new Date()
): ClientFundingSummary {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const deposits = events
    .filter((event) => event.eventType === "funding_event_successful")
    .filter((event) => new Date(event.eventTime).getTime() >= start)
    .sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime());

  const last = deposits[0];

  return {
    depositedThisMonth: deposits.reduce((sum, event) => sum + event.amountCents, 0) / 100,
    depositCount: deposits.length,
    lastDepositAt: last?.eventTime ?? null,
    lastDepositAmount: last ? last.amountCents / 100 : null,
    lastDepositNetwork: last?.networkId ?? null,
  };
}

export async function fetchClientFundingSummaries(
  now: Date = new Date()
): Promise<Record<string, ClientFundingSummary>> {
  const { data, error } = await supabase
    .from("client_funding_events")
    .select("client_id, event_type, event_time, amount_cents, network_id")
    .eq("event_type", "funding_event_successful")
    .gte("event_time", firstOfMonthIso(now));

  if (error) throw error;

  const byClient = new Map<string, FundingEvent[]>();
  for (const row of data ?? []) {
    const clientId = row.client_id as string;
    const list = byClient.get(clientId) ?? [];
    list.push({
      eventType: row.event_type as FundingEventType,
      eventTime: row.event_time as string,
      amountCents: row.amount_cents as number,
      currency: null,
      networkId: (row.network_id as string | null) ?? null,
      transactionId: null,
      extraData: null,
    });
    byClient.set(clientId, list);
  }

  const summaries: Record<string, ClientFundingSummary> = {};
  for (const [clientId, events] of byClient) summaries[clientId] = summarizeDeposits(events, now);
  return summaries;
}

// ─── Conferencia cobranca x gasto ─────────────────────────────────────────────

export interface ChargeReconciliation {
  chargeDate: string;
  spendDate: string;
  chargedAmount: number;
  reportedSpend: number;
  diff: number;
  /** Acima disto a diferenca deixa de ser arredondamento e vira buraco no sync. */
  suspicious: boolean;
}

const RECONCILIATION_TOLERANCE = 1;

/**
 * Cruza a cobranca da Meta com o gasto que o sync registrou.
 *
 * A cobranca do dia D cobre o gasto de D-1 (conferido em 5 dias da BLITZ STORE:
 * diferenca de ate R$ 0,05). Divergencia maior que isso significa dia faltando
 * ou incompleto em `campaign_daily_metrics`.
 */
export function reconcileCharges(
  charges: Array<Pick<FundingEvent, "eventType" | "eventTime" | "amountCents">>,
  spendByDate: Record<string, number>
): ChargeReconciliation[] {
  return charges
    .filter((charge) => charge.eventType === "ad_account_billing_charge")
    .map((charge) => {
      const chargeDate = charge.eventTime.slice(0, 10);
      const spendDate = new Date(new Date(`${chargeDate}T00:00:00Z`).getTime() - 86400000)
        .toISOString()
        .slice(0, 10);
      const chargedAmount = charge.amountCents / 100;
      const reportedSpend = spendByDate[spendDate] ?? 0;
      const diff = chargedAmount - reportedSpend;

      return {
        chargeDate,
        spendDate,
        chargedAmount,
        reportedSpend,
        diff,
        suspicious: Math.abs(diff) > RECONCILIATION_TOLERANCE,
      };
    })
    .sort((a, b) => b.chargeDate.localeCompare(a.chargeDate));
}
