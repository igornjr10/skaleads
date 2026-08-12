import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, jsonResponse } from "../_shared/auth.ts";
import { prioritizeAuditActions, logTokenUsage } from "../_shared/claude-service.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { auditResults } = await req.json();

    const user = await getUser(req);
    if (!user) return jsonResponse(cors, { error: "Não autenticado" }, 401);
    // tenantId sai do JWT: no corpo, qualquer um se passava por outro
    // tenant e furava o rate limit do Claude.
    const tenantId = user.id;
    
    if (!auditResults || !Array.isArray(auditResults) || auditResults.length === 0) {
      throw new Error("auditResults array é obrigatório e deve ter pelo menos 1 resultado");
    }

    // Sanitize audit results
    const sanitized = auditResults.map(r => ({
      id: String(r.id || "").slice(0, 100),
      name: String(r.name || "").slice(0, 200),
      status: String(r.status || "unknown").slice(0, 50),
      severity: String(r.severity || "info").slice(0, 50),
      details: r.details ? String(r.details).slice(0, 500) : undefined,
    }));

    const result = await prioritizeAuditActions(tenantId, sanitized);
    
    // Log token usage
    await logTokenUsage(tenantId, "prioritize_audit", result.tokens);

    return new Response(
      JSON.stringify({
        success: true,
        prioritization: result.content,
        tokens: result.tokens,
        cost_usd: result.cost.toFixed(6),
        cached: result.cached,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error in prioritize-audit:", err);
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
