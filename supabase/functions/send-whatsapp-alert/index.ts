import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DATAFY_BASE_URL = "https://cloud.datafyapi.com.br";

interface FiredEntity {
  entityType: string;
  entityId: string;
  entityName: string;
  metricValue: number;
}

interface WhatsAppAlertPayload {
  alertName: string;
  alertDescription: string | null;
  entities: FiredEntity[];
  ruleSnapshot: { conditions: any[]; logic: string };
}

function buildMessage(payload: WhatsAppAlertPayload): string {
  const { alertName, alertDescription, entities, ruleSnapshot } = payload;
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const entityLines = entities
    .map(e => {
      const tipo = e.entityType === "CAMPAIGN" ? "📊 Campanha" : "👤 Cliente";
      return `${tipo}: *${e.entityName}* — ${e.metricValue.toFixed(2)}`;
    })
    .join("\n");

  const conditionLines = ruleSnapshot.conditions
    .map((c: any) => `• ${c.metric} ${c.comparator} ${c.value} (${c.period})`)
    .join("\n");

  return [
    `⚠️ *Alerta disparado: ${alertName}*`,
    alertDescription ? `_${alertDescription}_` : "",
    "",
    `🕐 ${now}`,
    "",
    "*Entidades afetadas:*",
    entityLines,
    "",
    `*Regra (${ruleSnapshot.logic}):*`,
    conditionLines,
    "",
    `🔗 ${Deno.env.get("PUBLIC_SITE_URL") || "https://ad-campaign-hub-one.vercel.app"}/alert-events`,
  ]
    .filter(line => line !== null)
    .join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: WhatsAppAlertPayload = await req.json();

    const datafyApiKey = Deno.env.get("DATAFY_API_KEY");
    const managerNumber = Deno.env.get("MANAGER_WHATSAPP_NUMBER");

    if (!datafyApiKey) {
      return new Response(
        JSON.stringify({ error: "DATAFY_API_KEY não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!managerNumber) {
      return new Response(
        JSON.stringify({ error: "MANAGER_WHATSAPP_NUMBER não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const message = buildMessage(payload);

    const response = await fetch(`${DATAFY_BASE_URL}/messages/send/text`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${datafyApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: managerNumber,
        text: message,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || result.error || "Datafy API error");
    }

    return new Response(
      JSON.stringify({ success: true, message_id: result.messages?.[0]?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
