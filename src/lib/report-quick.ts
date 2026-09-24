// Monta o relatorio rico a partir do banco, sem passar pela Meta.
//
// O painel de relatorios monta o mesmo `ReportData` consultando a Graph API ao
// vivo — bom para o relatorio caprichado, caro demais para o botao de um
// clique da tela de Clientes. Aqui sai tudo do que o sync ja trouxe: gasto,
// acoes locais, campanhas e criativos com miniatura.
//
// A excecao e o Instagram: seguidores, quantos entraram no periodo e visitas ao
// perfil nao passam pelo sync, sao consultados na hora. Em conta sem papel na
// Pagina a Meta recusa e o bloco some — bloco vazio e pior do que bloco nenhum.

import { supabase } from "@/integrations/supabase/client";
import type { ReportData } from "@/lib/report-types";
import { fetchInstagramSocial } from "@/lib/meta-insights";

export type PeriodoRapido = "7d" | "14d" | "30d";

const DIAS: Record<PeriodoRapido, number> = { "7d": 7, "14d": 14, "30d": 30 };
const ROTULO: Record<PeriodoRapido, string> = {
  "7d": "últimos 7 dias",
  "14d": "últimos 14 dias",
  "30d": "últimos 30 dias",
};

function isoLocal(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

interface LinhaDiaria {
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  messages: number | null;
  calls: number | null;
  directions: number | null;
  leads: number | null;
  profile_visits: number | null;
}

export class SemMetricaNoPeriodo extends Error {
  constructor(rotulo: string) {
    // Dia sem linha nao e dia com zero. Mandar "R$ 0,00" para o grupo do
    // cliente afirma que nao houve investimento quando o sync e que parou.
    super(
      `Sem metrica sincronizada nos ${rotulo}. Sincronize a conta antes de enviar: ` +
        `um relatorio zerado diz ao cliente que nao houve investimento.`
    );
    this.name = "SemMetricaNoPeriodo";
  }
}

export async function montarReportDataDoBanco(
  clientId: string,
  periodo: PeriodoRapido
): Promise<ReportData> {
  const dias = DIAS[periodo];
  const fim = new Date();
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - dias + 1);

  const [{ data: cliente }, { data: diarias }, { data: campanhas }] = await Promise.all([
    supabase
      .from("clients")
      .select("name, logo_url, meta_ad_account_id, meta_instagram_account_id, meta_instagram_username, meta_page_access_token, meta_access_token")
      .eq("id", clientId)
      .single(),
    supabase
      .from("campaign_daily_metrics")
      .select("spend, impressions, clicks, messages, calls, directions, leads, profile_visits")
      .eq("client_id", clientId)
      .gte("date", isoLocal(inicio))
      .lte("date", isoLocal(fim)),
    supabase
      .from("campaigns")
      .select("name, status, spend, impressions, clicks, ctr, conversions")
      .eq("client_id", clientId)
      .order("spend", { ascending: false })
      .limit(5),
  ]);

  const linhas = (diarias ?? []) as unknown as LinhaDiaria[];
  if (linhas.length === 0) throw new SemMetricaNoPeriodo(ROTULO[periodo]);

  const total = linhas.reduce(
    (acc, linha) => ({
      spend: acc.spend + (Number(linha.spend) || 0),
      impressions: acc.impressions + (Number(linha.impressions) || 0),
      clicks: acc.clicks + (Number(linha.clicks) || 0),
      messages: acc.messages + (Number(linha.messages) || 0),
      calls: acc.calls + (Number(linha.calls) || 0),
      directions: acc.directions + (Number(linha.directions) || 0),
      leads: acc.leads + (Number(linha.leads) || 0),
      profileVisits: acc.profileVisits + (Number(linha.profile_visits) || 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, messages: 0, calls: 0, directions: 0, leads: 0, profileVisits: 0 }
  );

  const anuncios = await buscarCriativos(clientId);

  const igId = cliente?.meta_instagram_account_id as string | null;
  const tokenDoPerfil = (cliente?.meta_page_access_token as string | null) || (cliente?.meta_access_token as string | null);
  const social = igId && tokenDoPerfil
    ? await fetchInstagramSocial(igId, tokenDoPerfil, isoLocal(inicio), isoLocal(fim))
    : { followers: null, followersGained: null, followersNet: null, profileViews: null };

  const doInstagram = [
    { key: "followers" as const, label: "Seguidores", value: social.followers, source: "Instagram" },
    { key: "followersGained" as const, label: "Comecaram a seguir", value: social.followersGained, source: "Instagram" },
    { key: "followersNet" as const, label: "Saldo de seguidores", value: social.followersNet, source: "Instagram" },
    { key: "profileViews" as const, label: "Visitas no perfil (total)", value: social.profileViews, source: "Instagram" },
  ].filter((m) => m.value !== null);

  return {
    generatedAt: new Date().toISOString(),
    client: {
      name: (cliente?.name as string) ?? "",
      logoUrl: (cliente?.logo_url as string | null) ?? null,
      adAccountLabel: cliente?.meta_ad_account_id ? `act_${cliente.meta_ad_account_id}` : undefined,
    },
    period: { start: isoLocal(inicio), end: isoLocal(fim), label: ROTULO[periodo] },
    summary: {
      spend: total.spend,
      impressions: total.impressions,
      clicks: total.clicks,
      ctr: total.impressions > 0 ? (total.clicks / total.impressions) * 100 : 0,
      cpc: total.clicks > 0 ? total.spend / total.clicks : 0,
      cpm: total.impressions > 0 ? (total.spend / total.impressions) * 1000 : 0,
      messagesStarted: total.messages,
      phoneCalls: total.calls,
      directions: total.directions,
      leads: total.leads,
      instagramProfileVisits: total.profileVisits,
      // Receita exige pixel de compra configurado; sem isso, zero e a resposta
      // honesta e o template ja esconde o bloco.
      revenue: 0,
      roas: 0,
      conversions: 0,
    },
    topCampaigns: (campanhas ?? []).map((c) => ({
      name: (c.name as string) ?? "",
      status: (c.status as string) ?? "",
      spend: Number(c.spend) || 0,
      impressions: Number(c.impressions) || 0,
      clicks: Number(c.clicks) || 0,
      ctr: Number(c.ctr) || 0,
      revenue: 0,
      roas: 0,
      conversions: Number(c.conversions) || 0,
    })),
    topAds: anuncios,
    ...(doInstagram.length > 0
      ? {
          socialPresence: {
            enabled: true,
            profileName: (cliente?.meta_instagram_username as string | null)
              ? `@${cliente!.meta_instagram_username}`
              : ((cliente?.name as string) ?? ""),
            logoUrl: (cliente?.logo_url as string | null) ?? null,
            sourceLabels: ["Instagram"],
            metrics: doInstagram,
          },
        }
      : {}),
    // Ordem das metricas no resumo: dinheiro, entrega, e depois o que o cliente
    // de negocio local chama de resultado. Metrica zerada o template esconde.
    metricPreferences: [
      "spend",
      "impressions",
      "clicks",
      "ctr",
      "cpc",
      "messagesStarted",
      "instagramProfileVisits",
      "phoneCalls",
      "directions",
      "leads",
    ],
    branding: { primaryColor: "#10b981", agencyName: "Scale Ads" },
  };
}

interface AdRow {
  name: string | null;
  status: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  thumbnail_url: string | null;
  image_url: string | null;
  creative_type: string | null;
  ad_sets: { campaigns: { client_id: string } | null } | null;
}

/** Criativos com entrega, do melhor CTR para o pior — e com a miniatura. */
async function buscarCriativos(clientId: string): Promise<ReportData["topAds"]> {
  const { data } = await supabase
    .from("ads")
    .select(
      "name, status, spend, impressions, clicks, thumbnail_url, image_url, creative_type, ad_sets!inner(campaigns!inner(client_id))"
    )
    .eq("ad_sets.campaigns.client_id", clientId)
    .gt("impressions", 0)
    .order("spend", { ascending: false })
    .limit(60);

  return ((data ?? []) as unknown as AdRow[])
    .map((ad) => {
      const impressions = Number(ad.impressions) || 0;
      const clicks = Number(ad.clicks) || 0;
      const spend = Number(ad.spend) || 0;
      return {
        name: ad.name ?? "(sem nome)",
        status: ad.status ?? "",
        spend,
        impressions,
        clicks,
        previewUrl: ad.thumbnail_url || ad.image_url,
        creativeType: ad.creative_type ?? "image",
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      };
    })
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, 6);
}
