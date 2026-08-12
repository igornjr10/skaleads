import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, jsonResponse } from "../_shared/auth.ts";
import { analyzeCreatives, logTokenUsage } from "../_shared/claude-service.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { creatives } = await req.json();

    const user = await getUser(req);
    if (!user) return jsonResponse(cors, { error: "Não autenticado" }, 401);
    // tenantId sai do JWT: no corpo, qualquer um se passava por outro
    // tenant e furava o rate limit do Claude.
    const tenantId = user.id;
    
    if (!creatives || !Array.isArray(creatives) || creatives.length === 0) {
      throw new Error("creatives array é obrigatório e deve ter pelo menos 1 criativo");
    }

    // Sanitize creatives (prevent injection)
    const sanitized = creatives.map(c => ({
      copy: String(c.copy || "").slice(0, 500),
      visual_description: String(c.visual_description || "").slice(0, 500),
      metrics: typeof c.metrics === 'object' ? c.metrics : {},
    }));

    const result = await analyzeCreatives(tenantId, sanitized);
    
    // Log token usage for billing
    await logTokenUsage(tenantId, "analyze_creatives", result.tokens);

    return new Response(
      JSON.stringify({
        success: true,
        analysis: result.content,
        tokens: result.tokens,
        cost_usd: result.cost.toFixed(6),
        cached: result.cached,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error in analyze-creatives:", err);
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
