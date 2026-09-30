// Operacoes do Reportei Connect, tipadas conforme a spec OpenAPI.
// Server-side apenas — ver o aviso em connect.ts.

import { connectFetch } from "./connect.ts";

export type IntegrationStatus =
  | "active" | "expired" | "revoked" | "synchronizing" | "synchronization_error";

export interface Customer {
  uuid: string;
  name: string;
  created_at: string;
  updated_at: string;
  trial_ends_at: string | null;
  is_paying: boolean;
  merchant: string;
}

/** `api_token` vem so aqui, na criacao, e e irrecuperavel depois. */
export interface CustomerCreated extends Customer {
  api_token: string;
}

export interface CustomerIntegration {
  uuid: string;
  source_id: string;
  source_name: string;
  status: IntegrationStatus;
  created_at: string;
  updated_at: string;
  currency?: string;
  email?: string | null;
  integration: { name: string; slug: string };
}

export interface IntegrationSession {
  session_uuid: string;
  session_link: string;
  expires_at: string;
  customer_uuid: string;
  [k: string]: unknown;
}

export interface ResourceLimit {
  name: "integration_count" | "same_type_integration"
      | "same_integration_across_customers" | "available_integrations";
  value: number | string[];
}

export interface MetricRequestItem {
  id: string;              // precisa ser uuid: e a chave sob a qual o resultado volta
  reference_key: string;   // ex.: "ig:story_replies"
  component: string;       // ex.: "number_v1" | "chart_v1" | "datatable_v1"
  metrics: string[];
  dimensions?: string[];
  entity_id?: string;
  entity_type?: string;
}

export interface MerchantSettings {
  merchant: {
    uuid: string;
    name: string;
    is_paying: boolean;
    trial_ends_at: string | null;
    total_customers: number;
    available_integrations: { name: string; slug: string }[];
    [k: string]: unknown;
  };
  include_settings?: unknown;
}

export function getMerchantSettings() {
  return connectFetch<MerchantSettings>("/merchants/settings");
}

export async function createCustomer(name: string): Promise<CustomerCreated> {
  const res = await connectFetch<{ customer: CustomerCreated }>("/customers", {
    method: "POST",
    body: { name },
  });
  return res.customer;
}

export async function openIntegrationSession(
  customerToken: string,
  opts: {
    redirect_url?: string;
    locale?: "pt_BR" | "en" | "es" | "fr";
    expires_in_minutes?: number;
    close_on_finish?: boolean;
    enable_multi_account_selection?: boolean;
    limit_reached_url?: string;
    limits?: ResourceLimit[];
  } = {},
): Promise<IntegrationSession> {
  const res = await connectFetch<{ integration_session: IntegrationSession }>(
    "/customer-integrations/session",
    { method: "POST", customerToken, body: opts },
  );
  return res.integration_session;
}

export async function listCustomerIntegrations(
  customerToken: string,
  filters: { source_name?: string; status?: IntegrationStatus } = {},
): Promise<CustomerIntegration[]> {
  const res = await connectFetch<{ data: CustomerIntegration[] }>("/customer-integrations", {
    customerToken,
    query: filters,
  });
  return res.data ?? [];
}

export interface MetricsParams {
  start: string;                       // YYYY-MM-DD, <= end
  end: string;
  metrics: MetricRequestItem[];
  customer_integration?: string;
  customer_integration_uuids?: string[];
  comparison_start?: string;
  comparison_end?: string;
  client_timezone?: string;
}

/**
 * Resultados vem indexados pelo `id` que foi enviado. Uma metrica pode falhar
 * isoladamente e virar `{ message, type }` sem derrubar o lote — a requisicao
 * segue 200 e as outras metricas vem normalmente.
 */
export async function getMetrics(
  customerToken: string,
  params: MetricsParams,
): Promise<Record<string, unknown>> {
  const res = await connectFetch<{ data: Record<string, unknown> }>("/metrics/get-data", {
    method: "POST",
    customerToken,
    body: { client_timezone: "America/Sao_Paulo", ...params },
  });
  return res.data ?? {};
}
