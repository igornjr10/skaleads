// Painel por cliente do Dashboard: quanto investiu, quantos resultados, quanto
// custou cada um, a campanha que melhor entregou pelo objetivo dela e o que
// precisa de atencao.

import {
  type CampanhaEntrada, type GrupoObjetivo,
  classificarObjetivo, labelGrupo, resultadoDaCampanha,
} from "./analise-campanhas";
import { resultadosDoDia, type MetricaDiaria } from "./metas";

/**
 * Ordem de preferencia na hora de escolher a melhor campanha: resultado de
 * negocio antes de clique, clique antes de alcance. Comparar custo entre
 * grupos diferentes nao faz sentido (mensagem a R$ 8 nao e "pior" que clique
 * a R$ 0,50), entao primeiro se escolhe o grupo, depois o menor custo nele.
 */
const CAMADAS: GrupoObjetivo[][] = [["mensagens", "conversoes"], ["trafego", "outros"], ["reconhecimento"]];

/** Abaixo disto a campanha so entra se nenhuma outra do grupo passou do piso. */
export const GASTO_MINIMO_MELHOR = 20;

export interface MelhorCampanha {
  id: string;
  nome: string;
  grupo: GrupoObjetivo;
  objetivo: string;
  volume: number;
  unidade: string;
  custo: number;
  custoLabel: string;
  investido: number;
}

export function melhorCampanha(campanhas: CampanhaEntrada[]): MelhorCampanha | null {
  const avaliadas = campanhas
    .filter(c => (Number(c.spend) || 0) > 0)
    .map(c => ({ c, r: resultadoDaCampanha(c) }))
    .filter(x => (x.r.volume ?? 0) > 0 && x.r.custo != null);
  if (!avaliadas.length) return null;

  for (const camada of CAMADAS) {
    const naCamada = avaliadas.filter(x => camada.includes(x.r.grupo));
    if (!naCamada.length) continue;
    // Grupo da camada em que o cliente mais investe: e o objetivo que importa para ele.
    const gastoPorGrupo = new Map<GrupoObjetivo, number>();
    for (const x of naCamada) gastoPorGrupo.set(x.r.grupo, (gastoPorGrupo.get(x.r.grupo) ?? 0) + Number(x.c.spend));
    const grupo = [...gastoPorGrupo.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const doGrupo = naCamada.filter(x => x.r.grupo === grupo);
    const relevantes = doGrupo.filter(x => Number(x.c.spend) >= GASTO_MINIMO_MELHOR);
    const melhor = (relevantes.length ? relevantes : doGrupo).sort((a, b) => a.r.custo! - b.r.custo!)[0];
    return {
      id: melhor.c.id,
      nome: melhor.c.name,
      grupo,
      objetivo: labelGrupo(grupo),
      volume: melhor.r.volume!,
      unidade: melhor.r.unidade,
      custo: melhor.r.custo!,
      custoLabel: melhor.r.custoLabel,
      investido: Number(melhor.c.spend) || 0,
    };
  }
  return null;
}

/** Campanhas do cliente ordenadas para a lista: a melhor primeiro, depois por investimento. */
export function rankingDeCampanhas(campanhas: CampanhaEntrada[]) {
  const melhor = melhorCampanha(campanhas);
  return campanhas
    .filter(c => (Number(c.spend) || 0) > 0)
    .map(c => ({ c, r: resultadoDaCampanha(c, classificarObjetivo(c.objective, c.messages, c.conversions)), melhor: c.id === melhor?.id }))
    .sort((a, b) => Number(b.melhor) - Number(a.melhor) || Number(b.c.spend) - Number(a.c.spend));
}

export type Gravidade = "alta" | "media";

export interface Atencao {
  gravidade: Gravidade;
  texto: string;
}

export interface ClientePainel {
  id: string;
  name: string;
  logo_url?: string | null;
  alvo_custo_resultado?: number | null;
}

export interface LinhaCliente {
  cliente: ClientePainel;
  investido: number;
  resultados: number;
  custoPorResultado: number | null;
  investidoAntes: number;
  resultadosAntes: number;
  custoAntes: number | null;
  melhor: MelhorCampanha | null;
  atencao: Atencao[];
}

const somar = (dias: MetricaDiaria[]) => dias.reduce(
  (acc, d) => ({ investido: acc.investido + (Number(d.spend) || 0), resultados: acc.resultados + resultadosDoDia(d) }),
  { investido: 0, resultados: 0 },
);

/** Variacao relativa; nula quando nao ha base para comparar. */
export function variacao(atual: number | null, antes: number | null): number | null {
  if (atual == null || antes == null || antes === 0) return null;
  return (atual - antes) / antes;
}

/** O que a lideranca precisa olhar neste cliente, do mais grave para o menos. */
export function atencaoDoCliente(l: Omit<LinhaCliente, "atencao">): Atencao[] {
  const itens: Atencao[] = [];
  if (l.investido === 0) {
    if (l.investidoAntes > 0) itens.push({ gravidade: "alta", texto: "Parou de veicular" });
    return itens;
  }
  if (l.resultados === 0) {
    itens.push({ gravidade: "alta", texto: "Investindo sem resultado" });
    return itens;
  }
  const alvo = Number(l.cliente.alvo_custo_resultado) || 0;
  if (alvo > 0 && l.custoPorResultado != null && l.custoPorResultado > alvo * 1.1) {
    itens.push({ gravidade: "alta", texto: "Custo acima da meta" });
  }
  const custo = variacao(l.custoPorResultado, l.custoAntes);
  if (custo != null && custo >= 0.3) {
    itens.push({ gravidade: "media", texto: `Custo subiu ${Math.round(custo * 100)}%` });
  }
  const volume = variacao(l.resultados, l.resultadosAntes);
  if (volume != null && volume <= -0.3) {
    itens.push({ gravidade: "media", texto: `Resultados caíram ${Math.round(-volume * 100)}%` });
  }
  return itens;
}

/**
 * Uma linha por cliente. `dias` traz o periodo atual e o anterior (mesmo
 * tamanho); `inicio` e o primeiro dia do atual. As campanhas sao as da janela
 * do ultimo sync.
 */
export function montarPainel(
  clientes: ClientePainel[],
  dias: (MetricaDiaria & { client_id: string })[],
  campanhas: CampanhaEntrada[],
  inicio: string,
): LinhaCliente[] {
  const porCliente = new Map<string, { atual: MetricaDiaria[]; antes: MetricaDiaria[] }>();
  for (const d of dias) {
    const g = porCliente.get(d.client_id) ?? { atual: [], antes: [] };
    (d.date >= inicio ? g.atual : g.antes).push(d);
    porCliente.set(d.client_id, g);
  }
  const campanhasDe = new Map<string, CampanhaEntrada[]>();
  for (const c of campanhas) campanhasDe.set(c.client_id, [...(campanhasDe.get(c.client_id) ?? []), c]);

  const linhas = clientes.map(cliente => {
    const g = porCliente.get(cliente.id) ?? { atual: [], antes: [] };
    const atual = somar(g.atual);
    const antes = somar(g.antes);
    const base = {
      cliente,
      investido: atual.investido,
      resultados: atual.resultados,
      custoPorResultado: atual.resultados > 0 ? atual.investido / atual.resultados : null,
      investidoAntes: antes.investido,
      resultadosAntes: antes.resultados,
      custoAntes: antes.resultados > 0 ? antes.investido / antes.resultados : null,
      melhor: melhorCampanha(campanhasDe.get(cliente.id) ?? []),
    };
    return { ...base, atencao: atencaoDoCliente(base) };
  });

  // Quem precisa de atencao primeiro (grave antes de medio), depois quem investe mais.
  const peso = (l: LinhaCliente) => l.atencao.some(a => a.gravidade === "alta") ? 2 : l.atencao.length ? 1 : 0;
  return linhas.sort((a, b) => peso(b) - peso(a) || b.investido - a.investido || a.cliente.name.localeCompare(b.cliente.name));
}
