// Ponte entre o app e o Reportei Connect.
//
// Existe porque a CONNECT_API_KEY nao pode sair daqui: ela da acesso aos dados
// de todos os clientes do merchant, entao nenhuma chamada ao Connect pode
// partir do browser. O front fala com esta function; ela fala com o Connect.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, ownsClient, isServiceRole, isUuid, jsonResponse } from "../_shared/auth.ts";
import { ConnectError } from "../_shared/connect.ts";
import {
  getMerchantSettings,
  createCustomer,
  openIntegrationSession,
  listCustomerIntegrations,
  getMetrics,
  type MetricsParams,
  type ResourceLimit,
} from "../_shared/connect-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function env() {
  return {
    supabaseUrl: Deno.env.get("SUPABASE_URL")!,
    svcKey: Deno.env.get("SVC_ROLE_KEY")!,
  };
}

function svcHeaders() {
  const { svcKey } = env();
  return {
    apikey: svcKey,
    Authorization: `Bearer ${svcKey}`,
    "Content-Type": "application/json",
  };
}

/** Token do customer daquele cliente. Nunca sai desta function. */
async function customerTokenFor(clientId: string): Promise<{ token: string; customerUuid: string } | null> {
  const { supabaseUrl } = env();
  const rows = await fetch(
    `${supabaseUrl}/rest/v1/connect_customer_tokens?client_id=eq.${clientId}&select=api_token,customer_uuid`,
    { headers: svcHeaders() },
  ).then(r => r.json()).catch(() => null);

  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.api_token ? { token: row.api_token, customerUuid: row.customer_uuid } : null;
}

async function persistCustomer(clientId: string, customerUuid: string, apiToken: string) {
  const { supabaseUrl } = env();
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/connect_persist_customer`, {
    method: "POST",
    headers: svcHeaders(),
    body: JSON.stringify({ _client_id: clientId, _customer_uuid: customerUuid, _api_token: apiToken }),
  });
  if (!res.ok) {
    // O token so e devolvido uma vez: se nao gravou, o cliente precisa ser
    // recriado no Connect. Falhar alto e melhor que seguir sem saber.
    throw new Error(`Falha ao persistir o customer do Connect: ${await res.text()}`);
  }
}

async function clientName(clientId: string): Promise<string | null> {
  const { supabaseUrl } = env();
  const rows = await fetch(
    `${supabaseUrl}/rest/v1/clients?id=eq.${clientId}&select=name`,
    { headers: svcHeaders() },
  ).then(r => r.json()).catch(() => null);
  return Array.isArray(rows) && rows[0]?.name ? rows[0].name : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    // Chamada interna (cron) dispensa usuario; o resto exige sessao real.
    const internal = isServiceRole(req);
    const user = internal ? null : await getUser(req);
    if (!internal && !user) {
      return jsonResponse(corsHeaders, { error: "Nao autenticado" }, 401);
    }

    // `settings` e do merchant, nao de um cliente: nao pede client_id.
    if (action === "settings") {
      const data = await getMerchantSettings();
      return jsonResponse(corsHeaders, {
        merchant: {
          name: data.merchant.name,
          is_paying: data.merchant.is_paying,
          trial_ends_at: data.merchant.trial_ends_at,
          total_customers: data.merchant.total_customers,
        },
        available_integrations: data.merchant.available_integrations,
      });
    }

    const clientId = body.client_id;
    if (!isUuid(clientId)) {
      return jsonResponse(corsHeaders, { error: "client_id invalido" }, 400);
    }
    if (!internal && !(await ownsClient(user!.id, clientId))) {
      return jsonResponse(corsHeaders, { error: "Sem acesso a este cliente" }, 403);
    }

    switch (action) {
      // Cria o customer no Connect e grava o token. Idempotente: se o cliente
      // ja tem customer, devolve o que existe em vez de criar outro — recriar
      // descartaria as conexoes que o cliente ja autorizou.
      case "connect_client": {
        const existing = await customerTokenFor(clientId);
        if (existing) {
          return jsonResponse(corsHeaders, { customer_uuid: existing.customerUuid, created: false });
        }

        const name = body.name ?? await clientName(clientId);
        if (!name) return jsonResponse(corsHeaders, { error: "Cliente sem nome" }, 400);

        const customer = await createCustomer(String(name).slice(0, 255));
        await persistCustomer(clientId, customer.uuid, customer.api_token);

        return jsonResponse(corsHeaders, { customer_uuid: customer.uuid, created: true }, 201);
      }

      // Link da tela onde o cliente autoriza as contas dele.
      case "open_session": {
        const creds = await customerTokenFor(clientId);
        if (!creds) {
          return jsonResponse(corsHeaders, { error: "Cliente ainda nao conectado ao Connect" }, 409);
        }

        const limits: ResourceLimit[] | undefined = Array.isArray(body.available_integrations)
          ? [{ name: "available_integrations", value: body.available_integrations }]
          : undefined;

        const session = await openIntegrationSession(creds.token, {
          redirect_url: body.redirect_url,
          locale: "pt_BR",
          expires_in_minutes: body.expires_in_minutes ?? 15,
          enable_multi_account_selection: body.enable_multi_account_selection ?? true,
          ...(limits ? { limits } : {}),
        });

        return jsonResponse(corsHeaders, {
          session_link: session.session_link,
          expires_at: session.expires_at,
        });
      }

      // O que o cliente conectou, e o uuid de cada conexao (a chave das metricas).
      case "list_integrations": {
        const creds = await customerTokenFor(clientId);
        if (!creds) return jsonResponse(corsHeaders, { integrations: [], connected: false });

        const integrations = await listCustomerIntegrations(creds.token, {
          status: body.status,
          source_name: body.source_name,
        });

        return jsonResponse(corsHeaders, { connected: true, integrations });
      }

      case "metrics": {
        const creds = await customerTokenFor(clientId);
        if (!creds) {
          return jsonResponse(corsHeaders, { error: "Cliente ainda nao conectado ao Connect" }, 409);
        }
        const { start, end, metrics } = body as MetricsParams;
        if (!start || !end || !Array.isArray(metrics) || metrics.length === 0) {
          return jsonResponse(corsHeaders, { error: "start, end e metrics sao obrigatorios" }, 400);
        }
        // A spec exige um dos dois; barrar aqui poupa um 422 de ida e volta.
        if (!body.customer_integration && !Array.isArray(body.customer_integration_uuids)) {
          return jsonResponse(corsHeaders, {
            error: "Informe customer_integration ou customer_integration_uuids",
          }, 400);
        }

        const data = await getMetrics(creds.token, {
          start,
          end,
          metrics,
          customer_integration: body.customer_integration,
          customer_integration_uuids: body.customer_integration_uuids,
          comparison_start: body.comparison_start,
          comparison_end: body.comparison_end,
          client_timezone: body.client_timezone,
        });

        return jsonResponse(corsHeaders, { data });
      }

      default:
        return jsonResponse(corsHeaders, { error: `Acao desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    if (e instanceof ConnectError) {
      console.error("connect_error", JSON.stringify(e.toLog()));
      // 401/403 aqui sao da nossa chave, nao do usuario: nao repassar o status
      // cru, senao o front trata como sessao expirada e desloga por engano.
      const status = e.status === 401 || e.status === 403 ? 502 : (e.status || 502);
      return jsonResponse(corsHeaders, {
        error: e.message,
        kind: e.kind,
        ...(e.fieldErrors ? { field_errors: e.fieldErrors } : {}),
        ...(e.extra !== undefined ? { extra: e.extra } : {}),
      }, status);
    }
    console.error("reportei-connect", e instanceof Error ? e.message : String(e));
    return jsonResponse(corsHeaders, { error: "Erro interno" }, 500);
  }
});
