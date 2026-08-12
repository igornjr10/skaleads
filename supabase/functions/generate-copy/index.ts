import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUser, jsonResponse } from "../_shared/auth.ts";
import { generateCopy, logTokenUsage } from "../_shared/claude-service.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { clientInfo, objective, tone, briefing } = await req.json();

    const user = await getUser(req);
    if (!user) return jsonResponse(cors, { error: "Não autenticado" }, 401);
    // tenantId sai do JWT: no corpo, qualquer um se passava por outro
    // tenant e furava o rate limit do Claude.
    const tenantId = user.id;
    
    if (!clientInfo || !objective || !tone || !briefing) {
      throw new Error("clientInfo, objective, tone e briefing são obrigatórios");
    }

    const validTones = ["professional", "casual", "urgent", "inspirational"];
    if (!validTones.includes(tone)) {
      throw new Error(`tone deve ser um de: ${validTones.join(", ")}`);
    }

    // Sanitize inputs
    const sanitized = {
      clientInfo: {
        name: String(clientInfo.name || "").slice(0, 100),
        industry: String(clientInfo.industry || "").slice(0, 100),
      },
      objective: String(objective).slice(0, 500),
      tone,
      briefing: String(briefing).slice(0, 1000),
    };

    const result = await generateCopy(
      tenantId,
      sanitized.clientInfo,
      sanitized.objective,
      tone as "professional" | "casual" | "urgent" | "inspirational",
      sanitized.briefing
    );
    
    // Log token usage
    await logTokenUsage(tenantId, "generate_copy", result.tokens);

    return new Response(
      JSON.stringify({
        success: true,
        copy: result.content,
        tokens: result.tokens,
        cost_usd: result.cost.toFixed(6),
        cached: result.cached,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error in generate-copy:", err);
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
