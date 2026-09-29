import { endOfDay, startOfDay } from "date-fns";

export interface Funil {
  id: string;
  nome: string;
  client_id: string | null;
  created_at: string;
}

export interface Etapa {
  id: string;
  funil_id: string;
  nome: string;
  posicao: number;
  tipo: "aberta" | "ganho" | "perdido";
}

export interface Lead {
  id: string;
  funil_id: string;
  etapa_id: string;
  client_id: string | null;
  empresa: string | null;
  contato_nome: string;
  cargo: string | null;
  telefone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  email: string | null;
  segmento: string | null;
  cidade: string | null;
  origem: string | null;
  canal: string;
  responsavel_id: string | null;
  closer_id: string | null;
  valor_estimado: number | null;
  proximo_contato_em: string | null;
  reuniao_em: string | null;
  motivo_perda: string | null;
  observacoes: string | null;
  ganho_em: string | null;
  perdido_em: string | null;
  convertido_client_id: string | null;
  posicao: number;
  created_by: string | null;
  created_at: string;
}

export interface Atividade {
  id: string;
  lead_id: string;
  autor_id: string | null;
  tipo: string;
  canal: string | null;
  descricao: string | null;
  created_at: string;
}

export const CANAIS_LEAD = [
  { id: "sdr", label: "Prospecção ativa (SDR)" },
  { id: "social", label: "Social selling" },
  { id: "inbound", label: "Inbound" },
  { id: "indicacao", label: "Indicação" },
  { id: "anuncio", label: "Anúncio" },
  { id: "outro", label: "Outro" },
] as const;

/** Atividades que a pessoa registra. `etapa` e `convertido` so o banco escreve. */
export const TIPOS_ATIVIDADE = [
  { id: "mensagem", label: "Mensagem enviada" },
  { id: "ligacao", label: "Ligação atendida" },
  { id: "ligacao_nao_atendida", label: "Ligação não atendida" },
  { id: "follow_up", label: "Follow-up" },
  { id: "reuniao_marcada", label: "Reunião marcada" },
  { id: "reuniao_realizada", label: "Reunião realizada" },
  { id: "proposta", label: "Proposta enviada" },
  { id: "negociacao", label: "Negociação" },
  { id: "nota", label: "Anotação" },
] as const;

export const CANAIS_CONTATO = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "telefone", label: "Telefone" },
  { id: "email", label: "E-mail" },
  { id: "video", label: "Videochamada" },
  { id: "presencial", label: "Presencial" },
] as const;

export const MOTIVOS_PERDA = [
  "Preço", "Sem orçamento agora", "Fechou com concorrente", "Sem resposta", "Não é o momento", "Sem perfil (não qualificado)", "Outro",
];

export function rotuloAtividade(tipo: string) {
  if (tipo === "etapa") return "Mudou de etapa";
  if (tipo === "convertido") return "Virou cliente";
  return TIPOS_ATIVIDADE.find(t => t.id === tipo)?.label ?? tipo;
}

export function nomeDoLead(l: Pick<Lead, "empresa" | "contato_nome">) {
  return l.empresa?.trim() ? `${l.empresa} · ${l.contato_nome}` : l.contato_nome;
}

export function estaEmAberto(l: Pick<Lead, "ganho_em" | "perdido_em">) {
  return !l.ganho_em && !l.perdido_em;
}

/** Follow-up vencido ou para hoje. */
export function followUpPendente(l: Lead, agora = new Date()) {
  return estaEmAberto(l) && !!l.proximo_contato_em && new Date(l.proximo_contato_em) <= endOfDay(agora);
}

export function reuniaoHoje(l: Lead, agora = new Date()) {
  if (!l.reuniao_em) return false;
  const r = new Date(l.reuniao_em);
  return r >= startOfDay(agora) && r <= endOfDay(agora);
}

export function reuniaoFutura(l: Lead, agora = new Date()) {
  return !!l.reuniao_em && new Date(l.reuniao_em) > endOfDay(agora) && estaEmAberto(l);
}

/** Quantos leads em cada etapa, na ordem do funil. */
export function contagemPorEtapa(etapas: Etapa[], leads: Lead[]) {
  return [...etapas]
    .sort((a, b) => a.posicao - b.posicao)
    .map(e => ({ etapa: e, total: leads.filter(l => l.etapa_id === e.id).length }));
}

/**
 * Quantos leads chegaram pelo menos a cada etapa aberta (estao nela ou alem,
 * contando os ganhos). Perdidos saem da conta: nao da para saber onde pararam
 * sem o historico. E o formato de funil que mostra onde o processo trava.
 */
export function funilAcumulado(etapas: Etapa[], leads: Lead[]) {
  const ordem = new Map(etapas.map(e => [e.id, e]));
  const abertas = [...etapas].filter(e => e.tipo === "aberta").sort((a, b) => a.posicao - b.posicao);
  const ganho = etapas.find(e => e.tipo === "ganho");
  const vivos = leads.filter(l => ordem.get(l.etapa_id)?.tipo !== "perdido");
  const pos = (l: Lead) => (ordem.get(l.etapa_id)?.tipo === "ganho" ? Infinity : ordem.get(l.etapa_id)?.posicao ?? -1);
  const linhas = abertas.map(e => ({ nome: e.nome, total: vivos.filter(l => pos(l) >= e.posicao).length }));
  if (ganho) linhas.push({ nome: ganho.nome, total: vivos.filter(l => pos(l) === Infinity).length });
  return linhas;
}

export function taxaDeGanho(leads: Lead[]) {
  const ganhos = leads.filter(l => l.ganho_em).length;
  const perdidos = leads.filter(l => l.perdido_em).length;
  return ganhos + perdidos === 0 ? null : ganhos / (ganhos + perdidos);
}

export function motivosDePerda(leads: Lead[]) {
  const contagem = new Map<string, number>();
  for (const l of leads) {
    if (!l.perdido_em) continue;
    const motivo = l.motivo_perda?.trim() || "Sem motivo informado";
    contagem.set(motivo, (contagem.get(motivo) ?? 0) + 1);
  }
  return [...contagem.entries()].map(([motivo, total]) => ({ motivo, total })).sort((a, b) => b.total - a.total);
}

export interface Produtividade {
  contatos: number;
  mensagens: number;
  ligacoes: number;
  ligacoesAtendidas: number;
  followUps: number;
  reunioesMarcadas: number;
  reunioesRealizadas: number;
  propostas: number;
}

const VAZIA: Produtividade = {
  contatos: 0, mensagens: 0, ligacoes: 0, ligacoesAtendidas: 0,
  followUps: 0, reunioesMarcadas: 0, reunioesRealizadas: 0, propostas: 0,
};

/** Atividades registradas por pessoa desde `desde`. Anotacao e movimento automatico nao contam como contato. */
export function produtividadePorPessoa(atividades: Atividade[], desde: Date): Map<string, Produtividade> {
  const porPessoa = new Map<string, Produtividade>();
  for (const a of atividades) {
    if (!a.autor_id || new Date(a.created_at) < desde) continue;
    const p = { ...(porPessoa.get(a.autor_id) ?? VAZIA) };
    if (!["nota", "etapa", "convertido"].includes(a.tipo)) p.contatos += 1;
    if (a.tipo === "mensagem") p.mensagens += 1;
    if (a.tipo === "ligacao" || a.tipo === "ligacao_nao_atendida") p.ligacoes += 1;
    if (a.tipo === "ligacao") p.ligacoesAtendidas += 1;
    if (a.tipo === "follow_up") p.followUps += 1;
    if (a.tipo === "reuniao_marcada") p.reunioesMarcadas += 1;
    if (a.tipo === "reuniao_realizada") p.reunioesRealizadas += 1;
    if (a.tipo === "proposta") p.propostas += 1;
    porPessoa.set(a.autor_id, p);
  }
  return porPessoa;
}

export function produtividadeDe(mapa: Map<string, Produtividade>, pessoa: string | undefined): Produtividade {
  return (pessoa && mapa.get(pessoa)) || VAZIA;
}

/** Posicao entre dois cards no Kanban (ordem fracionaria, sem renumerar a coluna). */
export function posicaoEntre(antes: number | null, depois: number | null) {
  if (antes === null && depois === null) return 0;
  if (antes === null) return depois! - 1;
  if (depois === null) return antes + 1;
  return (antes + depois) / 2;
}
