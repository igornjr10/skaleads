// Comparativo de desempenho por nicho, feito com a carteira da propria agencia.
//
// A ideia e responder "o que funciona em automotivo aqui em Imperatriz" antes
// de subir campanha, usando o historico real em vez de conselho generico de
// internet. O `business_segment` do cliente era so etiqueta de filtro ate
// 18/09/2026; e aqui que ele vira analise.
//
// A honestidade estatistica e parte do produto: com 35 contas divididas em 7
// nichos, varios ficam com duas ou tres. Numero desse tamanho nao e referencia,
// e a tela precisa dizer isso em vez de exibir uma media bonita.

import { supabase } from "@/integrations/supabase/client";
import { segmentLabel } from "@/lib/local-business";
import type { NicheBriefingPayload } from "@/lib/ai-service";

/** Abaixo disto a media diz mais sobre o acaso do que sobre o nicho. */
export const MIN_CLIENTES_CONFIAVEL = 3;

/** Impressoes minimas para um criativo entrar no ranking: CTR de 40 impressoes e ruido. */
const MIN_IMPRESSOES_CRIATIVO = 500;

export interface SegmentBenchmark {
  segment: string;
  label: string;
  clientes: number;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  /** Soma das acoes de negocio local: conversas, ligacoes, rotas e leads. */
  resultados: number;
  custoPorResultado: number | null;
  confiavel: boolean;
}

interface DailyRow {
  client_id: string;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  messages: number | null;
  calls: number | null;
  directions: number | null;
  leads: number | null;
  clients: { business_segment: string | null } | null;
}

function isoDiasAtras(dias: number): string {
  return new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
}

export async function fetchSegmentBenchmarks(dias = 90): Promise<SegmentBenchmark[]> {
  // O join aninhado resolve o segmento sem uma segunda consulta; `clients!inner`
  // ja descarta metrica de cliente apagado.
  const { data, error } = await supabase
    .from("campaign_daily_metrics")
    .select("client_id, spend, impressions, clicks, messages, calls, directions, leads, clients!inner(business_segment)")
    .gte("date", isoDiasAtras(dias))
    .limit(50000);

  if (error) throw error;

  const porSegmento = new Map<string, { agg: Omit<SegmentBenchmark, "segment" | "label" | "clientes" | "ctr" | "cpm" | "cpc" | "custoPorResultado" | "confiavel">; clientes: Set<string> }>();

  for (const row of (data ?? []) as unknown as DailyRow[]) {
    const segment = row.clients?.business_segment;
    if (!segment) continue;

    const atual = porSegmento.get(segment) ?? {
      agg: { spend: 0, impressions: 0, clicks: 0, resultados: 0 },
      clientes: new Set<string>(),
    };

    atual.agg.spend += Number(row.spend) || 0;
    atual.agg.impressions += Number(row.impressions) || 0;
    atual.agg.clicks += Number(row.clicks) || 0;
    atual.agg.resultados +=
      (Number(row.messages) || 0) +
      (Number(row.calls) || 0) +
      (Number(row.directions) || 0) +
      (Number(row.leads) || 0);
    atual.clientes.add(row.client_id);

    porSegmento.set(segment, atual);
  }

  return [...porSegmento.entries()]
    .map(([segment, { agg, clientes }]) => ({
      segment,
      label: segmentLabel(segment) ?? segment,
      clientes: clientes.size,
      spend: agg.spend,
      impressions: agg.impressions,
      clicks: agg.clicks,
      resultados: agg.resultados,
      ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
      cpm: agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0,
      cpc: agg.clicks > 0 ? agg.spend / agg.clicks : 0,
      custoPorResultado: agg.resultados > 0 ? agg.spend / agg.resultados : null,
      confiavel: clientes.size >= MIN_CLIENTES_CONFIAVEL,
    }))
    .filter((linha) => linha.spend > 0)
    .sort((a, b) => b.spend - a.spend);
}

export interface CreativeHighlight {
  id: string;
  clientName: string;
  name: string;
  title: string | null;
  body: string | null;
  thumbnailUrl: string | null;
  creativeType: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
}

interface AdRow {
  id: string;
  name: string | null;
  title: string | null;
  body: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  creative_type: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  ad_sets: {
    campaigns: {
      clients: { name: string | null; business_segment: string | null } | null;
    } | null;
  } | null;
}

/**
 * Criativos que mais renderam no nicho, por CTR.
 *
 * O piso de impressoes existe porque CTR de anuncio quase sem entrega e ruido:
 * dois cliques em quarenta impressoes viram 5% e lideram o ranking sem ter
 * provado nada.
 */
export async function fetchTopCreatives(segment: string, limite = 12): Promise<CreativeHighlight[]> {
  const { data, error } = await supabase
    .from("ads")
    .select(
      "id, name, title, body, thumbnail_url, image_url, creative_type, spend, impressions, clicks, ad_sets!inner(campaigns!inner(clients!inner(name, business_segment)))"
    )
    .eq("ad_sets.campaigns.clients.business_segment", segment)
    .gte("impressions", MIN_IMPRESSOES_CRIATIVO)
    .limit(400);

  if (error) throw error;

  return ((data ?? []) as unknown as AdRow[])
    .map((ad) => {
      const impressions = Number(ad.impressions) || 0;
      const clicks = Number(ad.clicks) || 0;
      return {
        id: ad.id,
        clientName: ad.ad_sets?.campaigns?.clients?.name ?? "—",
        name: ad.name ?? "(sem nome)",
        title: ad.title,
        body: ad.body,
        thumbnailUrl: ad.thumbnail_url || ad.image_url,
        creativeType: ad.creative_type,
        spend: Number(ad.spend) || 0,
        impressions,
        clicks,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      };
    })
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, limite);
}

export interface FormatBreakdown {
  creativeType: string;
  anuncios: number;
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
}

/** Qual formato entrega melhor no nicho: video, imagem ou carrossel. */
export function breakdownPorFormato(creatives: CreativeHighlight[]): FormatBreakdown[] {
  const porTipo = new Map<string, FormatBreakdown>();

  for (const ad of creatives) {
    const creativeType = ad.creativeType || "desconhecido";
    const atual = porTipo.get(creativeType) ?? {
      creativeType,
      anuncios: 0,
      impressions: 0,
      clicks: 0,
      ctr: 0,
      spend: 0,
    };
    atual.anuncios += 1;
    atual.impressions += ad.impressions;
    atual.clicks += ad.clicks;
    atual.spend += ad.spend;
    porTipo.set(creativeType, atual);
  }

  return [...porTipo.values()]
    .map((linha) => ({ ...linha, ctr: linha.impressions > 0 ? (linha.clicks / linha.impressions) * 100 : 0 }))
    .sort((a, b) => b.impressions - a.impressions);
}

// ─── Um cliente contra o nicho dele ───────────────────────────────────────────

export interface ClientOption {
  id: string;
  name: string;
}

/**
 * Clientes do segmento, para comparar com os pares.
 *
 * So faz sentido oferecer quem esta no nicho aberto na tela: comparar uma
 * pizzaria com a media do automotivo nao responde nada.
 */
export async function fetchClientsBySegment(segment: string): Promise<ClientOption[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .eq("business_segment", segment)
    .eq("status", "active")
    .order("name");

  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id as string, name: row.name as string }));
}

export interface ClientSnapshot {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  resultados: number;
  custoPorResultado: number | null;
  /** Dias com entrega no periodo: separa "vai mal" de "mal comecou". */
  diasComGasto: number;
}

/** Os mesmos numeros do comparativo, para um cliente so. */
export async function fetchClientSnapshot(clientId: string, dias = 90): Promise<ClientSnapshot> {
  const { data, error } = await supabase
    .from("campaign_daily_metrics")
    .select("spend, impressions, clicks, messages, calls, directions, leads")
    .eq("client_id", clientId)
    .gte("date", isoDiasAtras(dias));

  if (error) throw error;

  const agg = (data ?? []).reduce(
    (acc, row) => {
      const spend = Number(row.spend) || 0;
      acc.spend += spend;
      acc.impressions += Number(row.impressions) || 0;
      acc.clicks += Number(row.clicks) || 0;
      acc.resultados +=
        (Number(row.messages) || 0) +
        (Number(row.calls) || 0) +
        (Number(row.directions) || 0) +
        (Number(row.leads) || 0);
      if (spend > 0) acc.diasComGasto += 1;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, resultados: 0, diasComGasto: 0 }
  );

  return {
    ...agg,
    ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
    cpm: agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0,
    cpc: agg.clicks > 0 ? agg.spend / agg.clicks : 0,
    custoPorResultado: agg.resultados > 0 ? agg.spend / agg.resultados : null,
  };
}

/**
 * Criativos do cliente, por CTR.
 *
 * Sem o piso de impressoes que o ranking do nicho usa: aqui o objetivo e ver o
 * que ESTE cliente esta rodando, e cortar por entrega esconderia justamente a
 * conta que veicula pouco — que costuma ser a que precisa de diagnostico.
 */
export async function fetchClientCreatives(clientId: string, limite = 10): Promise<CreativeHighlight[]> {
  const { data, error } = await supabase
    .from("ads")
    .select(
      "id, name, title, body, thumbnail_url, image_url, creative_type, spend, impressions, clicks, ad_sets!inner(campaigns!inner(client_id, clients!inner(name)))"
    )
    .eq("ad_sets.campaigns.client_id", clientId)
    .gt("impressions", 0)
    .limit(200);

  if (error) throw error;

  return ((data ?? []) as unknown as AdRow[])
    .map((ad) => {
      const impressions = Number(ad.impressions) || 0;
      const clicks = Number(ad.clicks) || 0;
      return {
        id: ad.id,
        clientName: ad.ad_sets?.campaigns?.clients?.name ?? "—",
        name: ad.name ?? "(sem nome)",
        title: ad.title,
        body: ad.body,
        thumbnailUrl: ad.thumbnail_url || ad.image_url,
        creativeType: ad.creative_type,
        spend: Number(ad.spend) || 0,
        impressions,
        clicks,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      };
    })
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, limite);
}

/**
 * Junta tudo que o briefing de um cliente precisa: o nicho dele, os pares e a
 * propria conta.
 *
 * Vive aqui, e nao na tela, porque duas telas pedem o mesmo briefing — a aba
 * Nichos e o hub do cliente. Montado em cada uma, um dia divergiriam e o mesmo
 * cliente daria respostas diferentes dependendo de onde se clicou.
 */
export async function montarBriefingDoCliente(
  clientId: string,
  clientName: string,
  segment: string,
  goalLabel: string,
  dias = 90
): Promise<NicheBriefingPayload | null> {
  const [benchmarks, criativosDoNicho, snapshot, criativosDoCliente] = await Promise.all([
    fetchSegmentBenchmarks(dias),
    fetchTopCreatives(segment),
    fetchClientSnapshot(clientId, dias),
    fetchClientCreatives(clientId),
  ]);

  const benchmark = benchmarks.find((linha) => linha.segment === segment);
  // Sem par no periodo nao ha comparacao a fazer, e um briefing que compara
  // com o vazio seria pior do que nenhum.
  if (!benchmark) return null;

  const paraPrompt = (ad: CreativeHighlight) => ({
    title: ad.title || ad.body || ad.name,
    ctr: ad.ctr,
    impressions: ad.impressions,
    creativeType: ad.creativeType ?? "desconhecido",
  });

  return {
    segmentLabel: benchmark.label,
    goalLabel,
    benchmark: {
      clientes: benchmark.clientes,
      spend: benchmark.spend,
      ctr: benchmark.ctr,
      cpm: benchmark.cpm,
      cpc: benchmark.cpc,
      custoPorResultado: benchmark.custoPorResultado,
      confiavel: benchmark.confiavel,
    },
    creatives: criativosDoNicho.slice(0, 10).map(paraPrompt),
    formatos: breakdownPorFormato(criativosDoNicho).map((f) => ({
      creativeType: f.creativeType,
      ctr: f.ctr,
      anuncios: f.anuncios,
    })),
    client: {
      name: clientName,
      spend: snapshot.spend,
      ctr: snapshot.ctr,
      cpm: snapshot.cpm,
      cpc: snapshot.cpc,
      custoPorResultado: snapshot.custoPorResultado,
      diasComGasto: snapshot.diasComGasto,
      creatives: criativosDoCliente.map(paraPrompt),
    },
  };
}

// ─── Pauta de conteudo organico, por nicho ────────────────────────────────────

export interface PautaDeConteudo {
  resumo?: string;
  /** Quantos posts por semana e em que formatos. */
  cadencia?: string;
  /** Tipos de post e a proporcao de cada um na semana. */
  pilares?: Array<{ nome: string; proporcao?: string; porque?: string; exemplos?: string[] }>;
  calendario?: Array<{
    semana: number;
    dia: string;
    formato: string;
    pilar: string;
    tema: string;
    gancho?: string;
    cta?: string;
  }>;
  evitar?: string[];
  ressalva?: string;
}

/**
 * Pauta de conteudo do nicho, sem citar cliente nem anuncio.
 *
 * E por nicho de proposito: serve todos os clientes do segmento de uma vez e,
 * por nao identificar ninguem, pode circular — inclusive com o proprio cliente.
 */
export async function gerarPautaDoNicho(
  segment: string,
  dias = 90
): Promise<{ pauta: PautaDeConteudo; segmentLabel: string; contas: number } | null> {
  const [benchmarks, criativos] = await Promise.all([
    fetchSegmentBenchmarks(dias),
    fetchTopCreatives(segment),
  ]);

  const benchmark = benchmarks.find((linha) => linha.segment === segment);
  if (!benchmark) return null;

  const { gerarPautaDeConteudo } = await import("@/lib/ai-service");

  const pauta = await gerarPautaDeConteudo({
    segmentLabel: benchmark.label,
    goalLabel: "conteudo organico",
    benchmark: {
      clientes: benchmark.clientes,
      spend: benchmark.spend,
      ctr: benchmark.ctr,
      cpm: benchmark.cpm,
      cpc: benchmark.cpc,
      custoPorResultado: benchmark.custoPorResultado,
      confiavel: benchmark.confiavel,
    },
    creatives: criativos.slice(0, 10).map((ad) => ({
      title: ad.title || ad.body || ad.name,
      ctr: ad.ctr,
      impressions: ad.impressions,
      creativeType: ad.creativeType ?? "desconhecido",
    })),
    formatos: breakdownPorFormato(criativos).map((f) => ({
      creativeType: f.creativeType,
      ctr: f.ctr,
      anuncios: f.anuncios,
    })),
  });

  return { pauta, segmentLabel: benchmark.label, contas: benchmark.clientes };
}
