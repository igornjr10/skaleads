import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buscarTudo } from "@/lib/buscar-tudo";
import type { CampanhaEntrada, ClienteEntrada, DiaAnuncio, DiaConta, FinanceiroMes } from "@/lib/analise-campanhas";

export interface DadosInteligencia {
  /** Campanhas de toda a carteira visivel, so para as medianas de referencia. */
  carteira: CampanhaEntrada[];
  clientes: (ClienteEntrada & { logo_url?: string | null })[];
  diasAnuncios: DiaAnuncio[];
  diasConta: DiaConta[];
  financeiro: FinanceiroMes[];
  pctCustoOperacional: Map<string, number>;
  /** Financeiro so abre para ADM/gestor, e a tabela pode nao existir ainda. */
  financeiroDisponivel: boolean;
}

const VAZIO: DadosInteligencia = {
  carteira: [],
  clientes: [],
  diasAnuncios: [],
  diasConta: [],
  financeiro: [],
  pctCustoOperacional: new Map(),
  financeiroDisponivel: false,
};

function isoDiasAtras(dias: number) {
  return new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
}

function inicioDoMesAtras(meses: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - meses);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// Do mais completo ao basico: as colunas de meta chegam por migration que pode
// ainda nao ter sido aplicada, e a tela nao pode quebrar por isso.
const SELECTS_CLIENTE = [
  "id, name, logo_url, business_segment, alvo_custo_mensagem, alvo_cpc, alvo_custo_resultado",
  "id, name, logo_url, business_segment, alvo_custo_resultado",
  "id, name, logo_url, business_segment",
];

async function carregarClientes() {
  for (const sel of SELECTS_CLIENTE) {
    const { data, error } = await supabase.from("clients").select(sel).eq("status", "active").order("name");
    if (!error) return (data ?? []) as unknown as DadosInteligencia["clientes"];
  }
  return [];
}

async function carregarCarteira() {
  return buscarTudo<CampanhaEntrada>((de, ate) =>
    supabase
      .from("campaigns")
      .select("id, client_id, name, status, objective, spend, impressions, clicks, ctr, cpc, cpm, conversions, messages")
      .order("id")
      .range(de, ate)
  );
}

async function carregarDiasAnuncios(adIds: string[]) {
  const desde = isoDiasAtras(15);
  const dias: DiaAnuncio[] = [];
  // Lote pequeno: o filtro `in` vai na URL e estoura com centenas de uuids.
  for (let i = 0; i < adIds.length; i += 100) {
    const lote = adIds.slice(i, i + 100);
    const linhas = await buscarTudo<DiaAnuncio>((de, ate) =>
      supabase
        .from("ad_daily_metrics")
        .select("ad_id, date, impressions, clicks, spend, reach, frequency")
        .in("ad_id", lote)
        .gte("date", desde)
        .order("date")
        .range(de, ate)
    );
    dias.push(...linhas);
  }
  return dias;
}

async function carregarDiasConta(clientId: string | null) {
  const desde = inicioDoMesAtras(2);
  return buscarTudo<DiaConta>((de, ate) => {
    let q = supabase
      .from("campaign_daily_metrics")
      .select("client_id, date, spend, messages, profile_visits")
      .gte("date", desde)
      .order("date")
      .range(de, ate);
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  });
}

async function carregarFinanceiro(clientId: string | null) {
  let q = supabase
    .from("cliente_financeiro_mes")
    .select("client_id, mes, faturamento, investimento_manual, custos_efetivos")
    .gte("mes", inicioDoMesAtras(2));
  if (clientId) q = q.eq("client_id", clientId);
  const [meses, cfg] = await Promise.all([
    q,
    supabase.from("cliente_financeiro").select("client_id, custo_operacional_pct"),
  ]);
  if (meses.error) return null;
  const pct = new Map<string, number>();
  for (const c of (cfg.data ?? []) as { client_id: string; custo_operacional_pct: number }[]) {
    pct.set(c.client_id, Number(c.custo_operacional_pct));
  }
  return { meses: (meses.data ?? []) as FinanceiroMes[], pct };
}

/**
 * Dados extras que a inteligencia usa alem das campanhas: metas e segmento dos
 * clientes, a serie diaria dos anuncios (saturacao), a serie da conta (visitas
 * ao perfil) e o financeiro informado. Cada fonte falha sozinha.
 */
export function useDadosInteligencia(adIds: string[], clientId: string | null) {
  const [dados, setDados] = useState<DadosInteligencia>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const chaveAds = adIds.join(",");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const ids = chaveAds ? chaveAds.split(",") : [];
      const [clientes, carteira, diasAnuncios, diasConta, fin] = await Promise.all([
        carregarClientes(),
        carregarCarteira().catch(() => [] as CampanhaEntrada[]),
        carregarDiasAnuncios(ids).catch(() => [] as DiaAnuncio[]),
        carregarDiasConta(clientId).catch(() => [] as DiaConta[]),
        carregarFinanceiro(clientId).catch(() => null),
      ]);
      setDados({
        carteira,
        clientes,
        diasAnuncios,
        diasConta,
        financeiro: fin?.meses ?? [],
        pctCustoOperacional: fin?.pct ?? new Map(),
        financeiroDisponivel: fin !== null,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar os dados da inteligência");
    } finally {
      setCarregando(false);
    }
  }, [chaveAds, clientId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { dados, carregando, erro, recarregar: carregar };
}
