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

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || result.error || "Evolution API error");
    }

    const groups = (result as EvolutionGroup[]).map(g => ({
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
