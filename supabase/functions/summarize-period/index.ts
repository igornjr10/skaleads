import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { summarizeReport, logTokenUsage } from "../_shared/claude-service.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { period, metrics, tenantId } = await req.json();
    
    if (!period || !period.start || !period.end || !metrics || !tenantId) {
      throw new Error("period (com start e end), metrics e tenantId são obrigatórios");
    }

    // Sanitize metrics (only accept numbers)
    const sanitized: Record<string, number> = {};
    for (const [key, value] of Object.entries(metrics)) {
      if (typeof value === 'number') {
        sanitized[String(key).slice(0, 50)] = value;
      }
    }

    if (Object.keys(sanitized).length === 0) {
      throw new Error("metrics deve conter pelo menos uma métrica numérica");
    }

    const result = await summarizeReport(
      tenantId,
      {
        start: String(period.start).slice(0, 50),
        end: String(period.end).slice(0, 50),
      },
      sanitized
    );
    
    // Log token usage
    await logTokenUsage(tenantId, "summarize_report", result.tokens);

    return new Response(
      JSON.stringify({
        success: true,
        summary: result.content,
        tokens: result.tokens,
        cost_usd: result.cost.toFixed(6),
        cached: result.cached,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error in summarize-period:", err);
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { 
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" } 
      }
    );
  }
});
