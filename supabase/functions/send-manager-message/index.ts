import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestPayload {
  targets: string[];
  text: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { targets, text }: RequestPayload = await req.json();

    const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL");
    const evolutionInstance = Deno.env.get("EVOLUTION_INSTANCE");
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");

    if (!evolutionApiUrl || !evolutionInstance || !evolutionApiKey) {
      throw new Error("EVOLUTION_API_URL / EVOLUTION_INSTANCE / EVOLUTION_API_KEY não configurados");
    }
    if (!targets || targets.length === 0) throw new Error("Selecione ao menos um destino");
    if (!text || !text.trim()) throw new Error("Mensagem vazia");

    const errors: string[] = [];
    let sentCount = 0;

    for (const target of targets) {
      try {
        const response = await fetch(`${evolutionApiUrl.replace(/\/$/, "")}/message/sendText/${evolutionInstance}`, {
          method: "POST",
          headers: { apikey: evolutionApiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ number: target, text }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || result.error || "Evolution API error");
        sentCount++;
      } catch (err) {
        errors.push(`${target}: ${(err as Error).message}`);
      }
    }

    if (sentCount === 0) throw new Error(errors.join("; "));

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, total: targets.length, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
