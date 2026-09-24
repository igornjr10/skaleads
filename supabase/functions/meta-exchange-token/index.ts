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

    // 2. Fetch user's ad accounts.
    // me/adaccounts so lista contas com papel direto e vem paginado; contas
    // acessadas por parceria aparecem apenas nos edges do Business Manager.
    type AdAccount = { id: string; name?: string; account_status?: number; business?: { id: string; name?: string } };

    async function fetchAll(path: string): Promise<AdAccount[]> {
      const out: AdAccount[] = [];
      let url: string | null =
        `https://graph.facebook.com/v21.0/${path}` +
        `?fields=id,name,account_status,business&limit=100&access_token=${longLivedToken}`;
      while (url) {
        try {
          const res = await fetch(url);
          const json = await res.json();
          if (!res.ok || json.error) break;
          for (const account of (json.data as AdAccount[]) ?? []) {
            if (account?.id) out.push(account);
          }
          url = json.paging?.next ?? null;
        } catch {
          break;
        }
      }
      return out;
    }

    let businessIds: string[] = [];
    try {
      const bmRes = await fetch(
        `https://graph.facebook.com/v21.0/me/businesses?fields=id,name&limit=100&access_token=${longLivedToken}`
      );
      const bmData = await bmRes.json();
      if (bmRes.ok && !bmData.error) {
        businessIds = ((bmData.data as { id: string }[]) ?? []).map((bm) => bm.id).filter(Boolean);
      }
    } catch {
      businessIds = [];
    }

    const accountLists = await Promise.all([
      fetchAll("me/adaccounts"),
      ...businessIds.flatMap((bmId) => [fetchAll(`${bmId}/owned_ad_accounts`), fetchAll(`${bmId}/client_ad_accounts`)]),
    ]);

    const byId = new Map<string, AdAccount>();
    for (const account of accountLists.flat()) {
      byId.set(account.id, { ...byId.get(account.id), ...account });
    }
    const adAccounts = Array.from(byId.values()).sort((a, b) =>
      (a.name ?? a.id).localeCompare(b.name ?? b.id, "pt-BR")
    );

    return new Response(
      JSON.stringify({
        access_token: longLivedToken,
        ad_accounts: adAccounts,
        business_ids: businessIds,
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
