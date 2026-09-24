import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function dbGet(supabaseUrl: string, svcKey: string, path: string) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    cache: "no-store",
  }).then(r => r.json());
}

interface ClientRow {
  id: string;
  name: string;
  logo_url: string | null;
  business_segment: string | null;
  meta_balance_cents: number | null;
  meta_funding_type: number | null;
  meta_last_sync_at: string | null;
}

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  conversions: number;
  messages: number;
}

interface AdRow {
  ad_set_id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  messages: number;
  thumbnail_url: string | null;
  image_url: string | null;
}

interface DailyMetricRow {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  messages: number;
  calls: number;
  directions: number;
  leads: number;
}

// Este endpoint e publico (o token no link E a autenticacao — sem login).
// So devolve campos seguros pra exibir: nunca meta_access_token ou outros
// dados sensiveis do cliente.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token } = await req.json().catch(() => ({}));
    if (!token) throw new Error("Token não informado");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
    if (!supabaseUrl || !svcKey) throw new Error("SUPABASE_URL / SVC_ROLE_KEY não configurados");

    const [client]: ClientRow[] = await dbGet(
      supabaseUrl, svcKey,
      `clients?dashboard_share_token=eq.${token}&select=id,name,logo_url,business_segment,meta_balance_cents,meta_funding_type,meta_last_sync_at&limit=1`
    );
    if (!client) {
      return new Response(JSON.stringify({ error: "Dashboard não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().split("T")[0];

    const [dailyMetrics, campaigns]: [DailyMetricRow[], CampaignRow[]] = await Promise.all([
      dbGet(supabaseUrl, svcKey, `campaign_daily_metrics?client_id=eq.${client.id}&date=gte.${sinceStr}&select=date,spend,clicks,impressions,messages,calls,directions,leads&order=date.asc`),
      dbGet(supabaseUrl, svcKey, `campaigns?client_id=eq.${client.id}&select=id,name,status,objective,spend,impressions,clicks,ctr,cpm,conversions,messages&order=spend.desc`),
    ]);

    // Campanha sem gasto e ja pausada nao interessa ao cliente. Decidir isso
    // aqui, antes de buscar anuncio, faz todo anuncio devolvido pertencer a uma
    // campanha que esta na tela — que e o que permite clicar na campanha e
    // filtrar os anuncios dela sem sobrar anuncio orfao.
    const visibleCampaigns = (campaigns || [])
      .filter(c => c.status === "ACTIVE" || c.spend > 0)
      .slice(0, 15);

    // Anuncio nao tem client_id: pendura em ad_set, que pendura em campanha.
    // Os ids sao fatiados porque eles entram na URL do PostgREST — conta grande
    // estouraria o limite de tamanho da requisicao.
    const campaignIds = visibleCampaigns.map((c) => c.id).filter(Boolean).slice(0, 200);

    // A posicao na lista e a chave que liga anuncio a campanha na tela. O uuid
    // interno nao sai daqui: link publico, sem login.
    const campaignKeyById = new Map<string, number>();
    visibleCampaigns.forEach((c, index) => campaignKeyById.set(c.id, index));

    let ads: AdRow[] = [];
    const campaignKeyByAdSet = new Map<string, number>();
    if (campaignIds.length > 0) {
      const adSets: { id: string; campaign_id: string }[] = await dbGet(
        supabaseUrl, svcKey,
        `ad_sets?campaign_id=in.(${campaignIds.join(",")})&select=id,campaign_id`
      );
      const adSetIds = (adSets || []).map((s) => s.id).filter(Boolean).slice(0, 300);
      (adSets || []).forEach((s) => {
        const key = campaignKeyById.get(s.campaign_id);
        if (key !== undefined) campaignKeyByAdSet.set(s.id, key);
      });

      if (adSetIds.length > 0) {
        // Era 12, e conta media ja passa disso: a ERNESTO tem 42 anuncios
        // elegiveis e o cliente via so os 12 mais caros, sem nada dizendo que
        // havia mais. O teto agora e de seguranca, nao de exibicao — quem
        // decide quantos mostrar de uma vez e a tela.
        ads = await dbGet(
          supabaseUrl, svcKey,
          `ads?ad_set_id=in.(${adSetIds.join(",")})&select=ad_set_id,name,status,spend,impressions,clicks,messages,thumbnail_url,image_url&order=spend.desc&limit=200`
        );
      }
    }

    // `messages`, `calls`, `directions` e `leads` sao o que o cliente chama de
    // resultado: a conversa que comecou no WhatsApp, a ligacao, a rota tracada,
    // o cadastro. Campanha de mensagem nunca preenche `conversions`, entao sem
    // isso o dashboard mostra investimento sem nada do outro lado.
    const summary = (dailyMetrics || []).reduce(
      (acc, row) => ({
        spend: acc.spend + (row.spend ?? 0),
        clicks: acc.clicks + (row.clicks ?? 0),
        impressions: acc.impressions + (row.impressions ?? 0),
        messages: acc.messages + (row.messages ?? 0),
        calls: acc.calls + (row.calls ?? 0),
        directions: acc.directions + (row.directions ?? 0),
        leads: acc.leads + (row.leads ?? 0),
      }),
      { spend: 0, clicks: 0, impressions: 0, messages: 0, calls: 0, directions: 0, leads: 0 }
    );

    const ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions) * 100 : 0;
    const cpm = summary.impressions > 0 ? (summary.spend / summary.impressions) * 1000 : 0;
    const cpc = summary.clicks > 0 ? summary.spend / summary.clicks : 0;

    // O teto digitado a mao saiu em 17/09/2026: era promessa, nao caixa, e
    // vivia divergindo da conta. O cliente ve o proprio saldo, que e fato.
    const balance = client.meta_balance_cents !== null ? client.meta_balance_cents / 100 : null;

    // So anuncio no ar. Anuncio pausado que gastou no periodo continua contando
    // no investimento da campanha e no total do topo — o que sai daqui e a
    // listagem, nao o numero. O cliente abre este link para ver o que esta
    // rodando agora; anuncio desligado so gera pergunta.
    const visibleAds = (ads || []).filter(a => a.status === "ACTIVE");

    // Quantos anuncios cada campanha tem na tela: e o que deixa a linha da
    // campanha dizer o que acontece ao ser clicada, em vez de so parecer
    // clicavel.
    const adCountByKey = new Map<number, number>();
    for (const ad of visibleAds) {
      const key = campaignKeyByAdSet.get(ad.ad_set_id);
      if (key === undefined) continue;
      adCountByKey.set(key, (adCountByKey.get(key) ?? 0) + 1);
    }

    return new Response(
      JSON.stringify({
        client: {
          name: client.name,
          logoUrl: client.logo_url,
          businessSegment: client.business_segment,
        },
        summary: { ...summary, ctr, cpm, cpc },
        balance,
        dailySeries: (dailyMetrics || []).map(row => ({ date: row.date, spend: row.spend ?? 0, clicks: row.clicks ?? 0, impressions: row.impressions ?? 0 })),
        // O id da campanha e so para chegar nos anuncios; nao vai para o
        // cliente. `key` e a posicao na lista, suficiente para a tela ligar uma
        // coisa na outra.
        campaigns: visibleCampaigns.map(({ id, ...rest }, index) => ({
          ...rest,
          key: index,
          adsCount: adCountByKey.get(index) ?? 0,
        })),
        ads: visibleAds
          .map(a => ({
            campaignKey: campaignKeyByAdSet.get(a.ad_set_id) ?? null,
            name: a.name,
            status: a.status,
            spend: a.spend ?? 0,
            impressions: a.impressions ?? 0,
            clicks: a.clicks ?? 0,
            messages: a.messages ?? 0,
            ctr: a.impressions > 0 ? ((a.clicks ?? 0) / a.impressions) * 100 : 0,
            thumbnailUrl: a.thumbnail_url || a.image_url || null,
          })),
        lastSyncAt: client.meta_last_sync_at,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
