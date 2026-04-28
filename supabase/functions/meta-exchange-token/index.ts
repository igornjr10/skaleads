import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { short_lived_token } = await req.json();
    if (!short_lived_token) throw new Error("short_lived_token é obrigatório");

    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appId || !appSecret) throw new Error("META_APP_ID ou META_APP_SECRET não configurados");

    // 1. Exchange short-lived → long-lived token
    const exchangeUrl =
      `https://graph.facebook.com/v21.0/oauth/access_token` +
      `?grant_type=fb_exchange_token` +
      `&client_id=${appId}` +
      `&client_secret=${appSecret}` +
      `&fb_exchange_token=${short_lived_token}`;

    const tokenRes = await fetch(exchangeUrl);
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error.message);

    const longLivedToken: string = tokenData.access_token;

    // 2. Fetch user's ad accounts
    const accountsRes = await fetch(
      `https://graph.facebook.com/v21.0/me/adaccounts` +
        `?fields=id,name,account_status` +
        `&limit=50` +
        `&access_token=${longLivedToken}`
    );
    const accountsData = await accountsRes.json();
    if (accountsData.error) throw new Error(accountsData.error.message);

    return new Response(
      JSON.stringify({
        access_token: longLivedToken,
        ad_accounts: accountsData.data ?? [],
      }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
