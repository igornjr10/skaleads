import { CATEGORIAS, type Demanda, estaAberta, estaAtrasada } from "./demandas";
import type { ClienteEmAtencao } from "./agencia";

export type Gravidade = "alta" | "media" | "baixa";

export interface Gargalo {
  id: string;
  gravidade: Gravidade;
  titulo: string;
  impacto: string;
  sugestao: string;
  /** Onde resolver; demandas abre direto a demanda na propria Visao. */
  link?: string;
  demandas?: string[];
  pessoa?: string;
}

export interface PessoaGargalo {
  id: string;
  nome: string;
  role: string;
}

export interface EntradaGargalos {
  hoje: string;
  agoraMs: number;
  demandas: Demanda[];
  pessoas: PessoaGargalo[];
  nomeCliente: (id: string) => string | null;
  atencao: ClienteEmAtencao[];
  limiteAbertas?: number;
  limiteAtrasadas?: number;
  diasParada?: number;
}

const DIA_MS = 86_400_000;
const CRIATIVO = ["criativo", "video"];
const PESO: Record<Gravidade, number> = { alta: 0, media: 1, baixa: 2 };

function diasDesde(iso: string | undefined, agoraMs: number) {
  return iso ? Math.floor((agoraMs - new Date(iso).getTime()) / DIA_MS) : 0;
}

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

export interface CargaPessoa {
  pessoa: string | null;
  abertas: number;
  atrasadas: number;
  vencemLogo: number;
  emRevisao: number;
}

/** Abertas por responsavel; vencemLogo = hoje e amanha. Chave null junta as sem dono. */
export function cargaDaEquipe(demandas: Demanda[], hoje: string, amanha: string): CargaPessoa[] {
  const mapa = new Map<string | null, CargaPessoa>();
  for (const d of demandas) {
    if (!estaAberta(d)) continue;
    const c = mapa.get(d.assigned_to) ?? { pessoa: d.assigned_to, abertas: 0, atrasadas: 0, vencemLogo: 0, emRevisao: 0 };
    c.abertas += 1;
    if (estaAtrasada(d, hoje)) c.atrasadas += 1;
    else if (d.prazo && d.prazo <= amanha) c.vencemLogo += 1;
    if (d.status === "revisao") c.emRevisao += 1;
    mapa.set(d.assigned_to, c);
  }
  return [...mapa.values()].sort((a, b) => b.atrasadas - a.atrasadas || b.abertas - a.abertas);
}

export interface SetorDemandas {
  id: string;
  nome: string;
  aFazer: number;
  andamento: number;
  revisao: number;
  concluidasSemana: number;
  atrasadas: number;
  abertas: number;
  responsaveis: string[];
}

/** Pipeline de demandas: um setor por categoria (Trafego, Arte, Video...), so os que tem movimento. */
export function pipelineDeDemandas(demandas: Demanda[], hoje: string, inicioSemana: string): SetorDemandas[] {
  return CATEGORIAS.map(cat => {
    const doSetor = demandas.filter(d => d.categoria === cat.id);
    const abertas = doSetor.filter(estaAberta);
    return {
      id: cat.id,
      nome: cat.label,
      aFazer: abertas.filter(d => d.status === "a_fazer").length,
      andamento: abertas.filter(d => d.status === "fazendo").length,
      revisao: abertas.filter(d => d.status === "revisao" || d.status === "aprovado").length,
      concluidasSemana: doSetor.filter(d => d.status === "concluida" && (d.concluida_at ?? "").slice(0, 10) >= inicioSemana).length,
      atrasadas: abertas.filter(d => estaAtrasada(d, hoje)).length,
      abertas: abertas.length,
      responsaveis: [...new Set(abertas.map(d => d.assigned_to).filter((p): p is string => !!p))],
    };
  }).filter(s => s.abertas > 0 || s.concluidasSemana > 0);
}

/**
 * Gargalos da operacao com o que a pessoa enxerga: problema, impacto e uma
 * sugestao pratica. Nao chama IA: regra explicavel vale mais que texto bonito
 * na hora de cobrar alguem.
 */
export function analisarGargalos(e: EntradaGargalos): Gargalo[] {
  const { hoje, agoraMs, demandas, pessoas } = e;
  const limiteAbertas = e.limiteAbertas ?? 12;
  const limiteAtrasadas = e.limiteAtrasadas ?? 3;
  const diasParada = e.diasParada ?? 3;
  const nome = (id: string | null) => (id ? pessoas.find(p => p.id === id)?.nome ?? "Alguém" : "Sem responsável");
  const abertas = demandas.filter(estaAberta);
  const lista: Gargalo[] = [];

  const criativosPorCliente = new Map<string, Demanda[]>();
  for (const d of abertas) {
    if (!d.client_id || !CRIATIVO.includes(d.categoria) || !estaAtrasada(d, hoje)) continue;
    criativosPorCliente.set(d.client_id, [...(criativosPorCliente.get(d.client_id) ?? []), d]);
  }
  for (const [cliente, ds] of criativosPorCliente) {
    if (ds.length < 2) continue;
    const quem = [...new Set(ds.map(d => nome(d.assigned_to)))].join(", ");
    lista.push({
      id: `criativos|${cliente}`,
      gravidade: "alta",
      titulo: `${e.nomeCliente(cliente) ?? "Cliente"}: ${plural(ds.length, "criativo atrasado", "criativos atrasados")}`,
      impacto: "As campanhas seguem com criativo antigo: risco de fadiga, custo por resultado subindo e cliente percebendo o atraso.",
      sugestao: `Alinhar novo prazo com ${quem} hoje e avisar o cliente; se a fila de criação está cheia, redistribuir uma das peças.`,
      demandas: ds.map(d => d.id),
    });
  }

  const carga = cargaDaEquipe(demandas, hoje, hoje);
  for (const c of carga) {
    if (!c.pessoa) continue;
    if (c.abertas <= limiteAbertas && c.atrasadas < limiteAtrasadas) continue;
    const pessoa = pessoas.find(p => p.id === c.pessoa);
    const colegas = pessoas
      .filter(p => p.id !== c.pessoa && p.role === pessoa?.role)
      .map(p => ({ p, abertas: carga.find(x => x.pessoa === p.id)?.abertas ?? 0 }))
      .sort((a, b) => a.abertas - b.abertas);
    const folga = colegas[0];
    lista.push({
      id: `sobrecarga|${c.pessoa}`,
      gravidade: c.atrasadas >= limiteAtrasadas ? "alta" : "media",
      titulo: `${nome(c.pessoa)} com ${plural(c.abertas, "demanda aberta", "demandas abertas")}${c.atrasadas ? `, ${plural(c.atrasadas, "atrasada", "atrasadas")}` : ""}`,
      impacto: "Fila acumulada vira atraso em cascata e queda de qualidade nas entregas.",
      sugestao: folga && folga.abertas < c.abertas / 2
        ? `Passar parte das demandas para ${folga.p.nome}, que está com ${folga.abertas}. Repriorizar o restante por prazo.`
        : "Repriorizar por prazo e renegociar o que não é urgente; ninguém da mesma função está com folga.",
      pessoa: c.pessoa,
    });
  }

  const onboardingPorCliente = new Map<string, Demanda[]>();
  for (const d of abertas) {
    if (!d.onboarding_fase || !d.client_id || diasDesde(d.created_at, agoraMs) < 7) continue;
    onboardingPorCliente.set(d.client_id, [...(onboardingPorCliente.get(d.client_id) ?? []), d]);
  }
  for (const [cliente, ds] of onboardingPorCliente) {
    const dias = Math.max(...ds.map(d => diasDesde(d.created_at, agoraMs)));
    lista.push({
      id: `onboarding|${cliente}`,
      gravidade: dias >= 14 ? "alta" : "media",
      titulo: `${e.nomeCliente(cliente) ?? "Cliente novo"}: entrada incompleta há ${dias} dias`,
      impacto: "Cliente pagando sem campanha rodando é o maior risco de cancelamento no primeiro mês.",
      sugestao: `Cobrar ${[...new Set(ds.map(d => nome(d.assigned_to)))].join(", ")} pelas etapas ${ds.map(d => d.onboarding_fase).join(", ")}; se trava em acesso, pedir ao cliente no grupo.`,
      link: "/onboarding",
      demandas: ds.map(d => d.id),
    });
  }

  const paradas = new Map<string | null, Demanda[]>();
  const revisoes = new Map<string | null, Demanda[]>();
  for (const d of abertas) {
    if (d.aguardando_cliente || diasDesde(d.updated_at ?? d.created_at, agoraMs) < diasParada) continue;
    const alvo = d.status === "revisao" ? revisoes : paradas;
    const chave = d.status === "revisao" ? d.created_by : d.assigned_to;
    alvo.set(chave, [...(alvo.get(chave) ?? []), d]);
  }
  for (const [pessoa, ds] of paradas) {
    lista.push({
      id: `parada|${pessoa}`,
      gravidade: ds.length >= 3 ? "media" : "baixa",
      titulo: `${pessoa ? nome(pessoa) : "Fila sem dono"}: ${plural(ds.length, "demanda parada", "demandas paradas")} há ${diasParada}+ dias`,
      impacto: "Demanda sem movimento costuma estar travada em alguma dúvida que ninguém levantou.",
      sugestao: pessoa
        ? `Perguntar a ${nome(pessoa)} o que trava "${ds[0].titulo}"${ds.length > 1 ? " e as demais" : ""}; se depende do cliente, marcar como aguardando o cliente.`
        : "Definir um responsável para cada uma.",
      demandas: ds.map(d => d.id),
      pessoa: pessoa ?? undefined,
    });
  }
  for (const [pessoa, ds] of revisoes) {
    lista.push({
      id: `revisao|${pessoa}`,
      gravidade: "media",
      titulo: `${plural(ds.length, "entrega esperando", "entregas esperando")} revisão de ${nome(pessoa)}`,
      impacto: "Material pronto parado na aprovação atrasa a publicação e desmotiva quem entregou.",
      sugestao: `${nome(pessoa)} revisar hoje, começando por "${ds[0].titulo}".`,
      demandas: ds.map(d => d.id),
      pessoa: pessoa ?? undefined,
    });
  }

  const travadas = new Map<string, Demanda[]>();
  for (const d of abertas) {
    if (!d.aguardando_cliente || diasDesde(d.updated_at ?? d.created_at, agoraMs) < 2) continue;
    const chave = d.client_id ?? "sem-cliente";
    travadas.set(chave, [...(travadas.get(chave) ?? []), d]);
  }
  for (const [cliente, ds] of travadas) {
    lista.push({
      id: `material|${cliente}`,
      gravidade: "media",
      titulo: `${e.nomeCliente(cliente) ?? "Cliente"} não mandou o material (${plural(ds.length, "entrega", "entregas")})`,
      impacto: "A entrega atrasa por fora da equipe, mas o cliente costuma cobrar a agência.",
      sugestao: "Cobrar no grupo do cliente com prazo claro e registrar a data; se passar, repactuar a entrega.",
      demandas: ds.map(d => d.id),
    });
  }

  const semDono = abertas.filter(d => !d.assigned_to);
  if (semDono.length) {
    lista.push({
      id: "sem-dono",
      gravidade: semDono.some(d => estaAtrasada(d, hoje)) ? "alta" : "baixa",
      titulo: `${plural(semDono.length, "demanda sem responsável", "demandas sem responsável")}`,
      impacto: "Demanda sem dono é demanda que ninguém vai fazer.",
      sugestao: "Atribuir cada uma a alguém da função; a mais antiga primeiro.",
      demandas: semDono.map(d => d.id),
    });
  }

  for (const c of e.atencao) {
    const custo = c.motivos.includes("custo_acima");
    const abaixo = c.motivos.includes("abaixo_da_meta");
    if (!custo && !abaixo) continue;
    lista.push({
      id: `meta|${c.id}`,
      gravidade: custo ? "alta" : "media",
      titulo: `${c.name}: ${custo ? "custo por resultado acima da meta" : "resultados abaixo da meta"}`,
      impacto: "Cliente fora da meta no fim do mês vira conversa difícil de renovação.",
      sugestao: custo
        ? "Pausar os anúncios com CPR mais alto, renovar criativos e revisar o público dos conjuntos que mais gastam."
        : "Escalar o orçamento do que está no custo e abrir teste de criativo novo esta semana.",
      link: `/clients/${c.id}`,
    });
  }

  return lista.sort((a, b) => PESO[a.gravidade] - PESO[b.gravidade]);
}
