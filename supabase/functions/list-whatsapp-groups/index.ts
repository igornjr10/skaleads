import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, listGroups } from "../_shared/whatsapp.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const groups = await listGroups();
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
