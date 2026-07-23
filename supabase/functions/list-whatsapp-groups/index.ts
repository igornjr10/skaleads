import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EvolutionGroup {
  id: string;
  subject: string;
  size: number;
  pictureUrl: string | null;
  creation: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL");
    const evolutionInstance = Deno.env.get("EVOLUTION_INSTANCE");
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");

    if (!evolutionApiUrl || !evolutionInstance || !evolutionApiKey) {
      return new Response(
        JSON.stringify({ error: "EVOLUTION_API_URL / EVOLUTION_INSTANCE / EVOLUTION_API_KEY não configurados" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch(
      `${evolutionApiUrl.replace(/\/$/, "")}/group/fetchAllGroups/${evolutionInstance}?getParticipants=false`,
      { headers: { apikey: evolutionApiKey } }
    );

    const raw = await response.text();
    let result: any = null;
    try { result = JSON.parse(raw); } catch { /* resposta não-JSON */ }

    if (!response.ok) {
      const detail =
        result?.response?.message ??
        result?.message ??
        result?.error ??
        raw.slice(0, 400);
      throw new Error(
        `Evolution API respondeu ${response.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`
      );
    }

    // A Evolution as vezes responde 200 com um objeto de erro em vez da lista
    const list = Array.isArray(result) ? result : result?.groups;
    if (!Array.isArray(list)) {
      throw new Error(`Evolution API respondeu 200 mas sem lista de grupos: ${raw.slice(0, 400)}`);
    }

    const groups = (list as EvolutionGroup[]).map(g => ({
      id: g.id,
      subject: g.subject,
      size: g.size,
      pictureUrl: g.pictureUrl ?? null,
    }));

    return new Response(
      JSON.stringify({ success: true, groups }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
