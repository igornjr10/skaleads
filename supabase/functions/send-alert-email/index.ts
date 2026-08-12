import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FiredEntity {
  entityType: string;
  entityId: string;
  entityName: string;
  metricValue: number;
}

interface AlertEmailPayload {
  alertName: string;
  alertDescription: string | null;
  entities: FiredEntity[];
  ruleSnapshot: { conditions: any[]; logic: string };
  recipients: string[];
}

function formatMetricValue(metric: string, value: number): string {
  if (["cpa", "spend", "cpm"].includes(metric)) {
    return `R$ ${value.toFixed(2).replace(".", ",")}`;
  }
  if (["ctr", "frequency"].includes(metric)) {
    return `${value.toFixed(2)}`;
  }
  return String(value);
}

function buildEmailHtml(payload: AlertEmailPayload): string {
  const { alertName, alertDescription, entities, ruleSnapshot } = payload;
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const entityRows = entities
    .map(
      e => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#374151;">${e.entityType === "CAMPAIGN" ? "📊 Campanha" : "👤 Cliente"}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#374151;">${e.entityName}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#374151;text-align:right;font-weight:600;">${e.metricValue.toFixed(2)}</td>
    </tr>`
    )
    .join("");

  const conditionList = ruleSnapshot.conditions
    .map((c: any) => `<li style="margin-bottom:4px;color:#6b7280;font-size:14px;">${c.metric} ${c.comparator} ${c.value} (${c.period})</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Alerta: ${alertName}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <div style="width:40px;height:40px;background:rgba(255,255,255,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;">⚠️</div>
        <span style="color:rgba(255,255,255,0.8);font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Scale Ads — Alerta</span>
      </div>
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">${alertName}</h1>
      ${alertDescription ? `<p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">${alertDescription}</p>` : ""}
    </div>

    <!-- Body -->
    <div style="padding:32px 40px;">
      <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
        Uma ou mais condições do seu alerta foram atingidas em <strong>${now}</strong>.
      </p>

      <!-- Entities table -->
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Tipo</th>
            <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Entidade</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Valor</th>
          </tr>
        </thead>
        <tbody>${entityRows}</tbody>
      </table>

      <!-- Rule conditions -->
      <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Condições da regra (${ruleSnapshot.logic}):</p>
        <ul style="margin:0;padding-left:20px;">${conditionList}</ul>
      </div>

      <!-- CTA -->
      <a href="${Deno.env.get("PUBLIC_SITE_URL") || "https://ad-campaign-hub-one.vercel.app"}/alert-events"
         style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
        Ver eventos de alerta →
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:20px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
        Scale Ads • Você recebe este email porque está cadastrado nos alertas desta plataforma.<br>
        Para cancelar, desative o canal de email no alerta correspondente.
      </p>
    </div>
  </div>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: AlertEmailPayload = await req.json();
    const { recipients } = payload;

    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ error: "Sem destinatários" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY não configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = buildEmailHtml(payload);

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "alertas@marketproads.com.br",
        to: recipients,
        subject: `⚠️ Alerta: ${payload.alertName}`,
        html,
      }),
    });

    const result = await resendResponse.json();

    if (!resendResponse.ok) {
      throw new Error(result.message || "Resend error");
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
