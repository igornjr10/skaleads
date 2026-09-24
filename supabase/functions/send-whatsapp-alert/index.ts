import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, resolveTargets, sendText } from "../_shared/whatsapp.ts";

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
  target?: string | null;
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
    `🔗 ${Deno.env.get("PUBLIC_SITE_URL") || "https://manager.marketprosystem.com"}/alert-events`,
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

    const managerNumber = Deno.env.get("MANAGER_WHATSAPP_NUMBER");

    const targets = await resolveTargets(payload.target || managerNumber);

    if (targets.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum destino: informe um alvo ou cadastre gestor ativo com WhatsApp" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const message = buildMessage(payload);

    // Envia para todos e so falha se ninguem recebeu — um numero quebrado nao
    // pode fazer o teste parecer que nada foi enviado.
    const results = await Promise.allSettled(targets.map(t => sendText(t, message)));
    const enviados = results.filter(r => r.status === "fulfilled").length;

    if (enviados === 0) {
      const motivo = results
        .map(r => r.status === "rejected" ? (r.reason as Error).message : "")
        .filter(Boolean)
        .join("; ");
      return new Response(
        JSON.stringify({ error: `Nenhuma mensagem saiu: ${motivo}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, enviados, destinos: targets.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
