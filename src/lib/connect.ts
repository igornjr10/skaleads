// Reportei Connect, do lado do app.
//
// Nada aqui fala com o Connect direto: a chave de API do merchant da acesso
// aos dados de todos os clientes, entao ela vive so na Edge Function
// `reportei-connect`. Este arquivo so chama a function.

import { supabase } from "@/integrations/supabase/client";

export type IntegrationStatus =
  | "active" | "expired" | "revoked" | "synchronizing" | "synchronization_error";

export interface ConnectIntegration {
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

export interface MetricRequestItem {
  /** Precisa ser um uuid: e a chave sob a qual o resultado volta. */
  id: string;
  /** Identificador da metrica na plataforma, ex.: `ig:story_replies`. */
  reference_key: string;
  /** Formato do resultado, ex.: `number_v1`, `chart_v1`, `datatable_v1`. */
  component: string;
  metrics: string[];
  dimensions?: string[];
}

/** Uma metrica pode falhar sozinha sem derrubar o lote; o resultado dela vira isto. */
export interface MetricFailure {
  message: string;
  type: "invalid_metrics_combination" | "no_data_in_period" | "internal_error" | "expired_token";
}

export function isMetricFailure(value: unknown): value is MetricFailure {
  return typeof value === "object" && value !== null && "type" in value && "message" in value;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("reportei-connect", { body });

  // Num erro HTTP o supabase-js poe a mensagem em `error` e o corpo em `data`;
  // a mensagem do Connect esta no corpo e e ela que diz qual recusa foi.
  if (error) {
    const detail = (data as { error?: string } | null)?.error;
    throw new Error(detail || error.message || "Falha ao falar com o Reportei Connect");
  }
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

export function getConnectSettings() {
  return call<{
    merchant: { name: string; is_paying: boolean; trial_ends_at: string | null; total_customers: number };
    available_integrations: { name: string; slug: string }[];
  }>({ action: "settings" });
}

/** Cria o customer no Connect para este cliente. Idempotente. */
export function connectClient(clientId: string) {
  return call<{ customer_uuid: string; created: boolean }>({
    action: "connect_client",
    client_id: clientId,
  });
}

/**
 * Abre a tela de autorizacao e devolve o link. O link e temporario — leve o
 * cliente ate ele na hora, nao guarde.
 */
export function openConnectSession(
  clientId: string,
  opts: { redirectUrl?: string; availableIntegrations?: string[]; expiresInMinutes?: number } = {},
) {
  return call<{ session_link: string; expires_at: string }>({
    action: "open_session",
    client_id: clientId,
    redirect_url: opts.redirectUrl ?? `${window.location.origin}/clientes`,
    available_integrations: opts.availableIntegrations,
    expires_in_minutes: opts.expiresInMinutes,
  });
}

export function listConnectIntegrations(clientId: string, status?: IntegrationStatus) {
  return call<{ connected: boolean; integrations: ConnectIntegration[] }>({
    action: "list_integrations",
    client_id: clientId,
    status,
  });
}

export function getConnectMetrics(
  clientId: string,
  params: {
    start: string;
    end: string;
    metrics: MetricRequestItem[];
    customerIntegration?: string;
    customerIntegrationUuids?: string[];
    comparisonStart?: string;
    comparisonEnd?: string;
  },
) {
  return call<{ data: Record<string, unknown> }>({
    action: "metrics",
    client_id: clientId,
    start: params.start,
    end: params.end,
    metrics: params.metrics,
    customer_integration: params.customerIntegration,
    customer_integration_uuids: params.customerIntegrationUuids,
    comparison_start: params.comparisonStart,
    comparison_end: params.comparisonEnd,
  });
}
