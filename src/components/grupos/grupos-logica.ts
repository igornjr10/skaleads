export interface Pergunta {
  quem: string;
  texto: string;
  quando: string;
}

export type Atencao = "ok" | "atencao" | "urgente";

export interface Triagem {
  id: string;
  client_id: string;
  dia: string;
  mensagens: number;
  participantes: number;
  ultima_mensagem: string | null;
  ultima_de: string | null;
  ultima_em: string | null;
  ultima_da_agencia: boolean;
  cobrancas: number;
  perguntas_abertas: Pergunta[];
  sinais: string[];
  horas_sem_resposta: number | null;
  atencao: Atencao;
  gerado_em: string;
}

export interface ClienteGrupo {
  id: string;
  name: string;
  logo_url: string | null;
  whatsapp_group_jid: string | null;
}

export interface GrupoWhatsapp {
  id: string;
  subject: string;
}

export interface Pessoa {
  id: string;
  nome: string;
}

/**
 * vinculado: grupo com cliente; sem_grupo: cliente que ainda nao escolheu
 * grupo; sem_cliente: grupo do numero da agencia que nenhum cliente usa.
 */
export type Situacao = "vinculado" | "sem_grupo" | "sem_cliente";

export interface LinhaGrupo {
  chave: string;
  situacao: Situacao;
  jid: string | null;
  nomeGrupo: string | null;
  cliente: ClienteGrupo | null;
  triagem: Triagem | null;
  responsaveis: Pessoa[];
}

export type FiltroSituacao = "todas" | Situacao;
export type FiltroAtividade = "todas" | "esperando" | "urgente" | "recente" | "sem_leitura";

export const SEM_RESPONSAVEL = "__sem__";

export interface FiltrosGrupos {
  busca: string;
  clienteId: string;
  responsavelId: string;
  situacao: FiltroSituacao;
  atividade: FiltroAtividade;
}

export const FILTROS_PADRAO: FiltrosGrupos = {
  busca: "",
  clienteId: "todos",
  responsavelId: "todos",
  situacao: "vinculado",
  atividade: "todas",
};

const HORAS_RECENTE = 24;

export function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Uma linha por cliente por dia chega do banco; vale a mais recente de cada. */
export function triagemMaisRecente(linhas: Triagem[]): Map<string, Triagem> {
  const porCliente = new Map<string, Triagem>();
  for (const linha of linhas) {
    const atual = porCliente.get(linha.client_id);
    if (!atual || linha.dia > atual.dia || (linha.dia === atual.dia && linha.gerado_em > atual.gerado_em)) {
      porCliente.set(linha.client_id, linha);
    }
  }
  return porCliente;
}

export function montarLinhas(
  clientes: ClienteGrupo[],
  triagens: Map<string, Triagem>,
  grupos: GrupoWhatsapp[] | null,
  responsaveisPorCliente: Map<string, Pessoa[]>,
): LinhaGrupo[] {
  const nomePorJid = new Map((grupos ?? []).map(g => [g.id, g.subject]));
  const linhas: LinhaGrupo[] = clientes.map(c => ({
    chave: `c:${c.id}`,
    situacao: c.whatsapp_group_jid ? "vinculado" : "sem_grupo",
    jid: c.whatsapp_group_jid,
    nomeGrupo: c.whatsapp_group_jid ? nomePorJid.get(c.whatsapp_group_jid) ?? null : null,
    cliente: c,
    triagem: c.whatsapp_group_jid ? triagens.get(c.id) ?? null : null,
    responsaveis: responsaveisPorCliente.get(c.id) ?? [],
  }));

  const usados = new Set(clientes.map(c => c.whatsapp_group_jid).filter(Boolean));
  for (const g of grupos ?? []) {
    if (usados.has(g.id)) continue;
    linhas.push({
      chave: `g:${g.id}`,
      situacao: "sem_cliente",
      jid: g.id,
      nomeGrupo: g.subject,
      cliente: null,
      triagem: null,
      responsaveis: [],
    });
  }
  return linhas;
}

export function atividadeRecente(t: Triagem | null, agora = Date.now()) {
  if (!t?.ultima_em) return false;
  const quando = new Date(t.ultima_em).getTime();
  if (isNaN(quando)) return false;
  return agora - quando <= HORAS_RECENTE * 3600_000;
}

function casaAtividade(l: LinhaGrupo, atividade: FiltroAtividade, agora: number) {
  switch (atividade) {
    case "todas": return true;
    case "esperando": return l.triagem?.horas_sem_resposta != null;
    case "urgente": return l.triagem?.atencao === "urgente";
    case "recente": return atividadeRecente(l.triagem, agora);
    case "sem_leitura": return l.situacao === "vinculado" && !l.triagem;
  }
}

export function filtrarLinhas(linhas: LinhaGrupo[], f: FiltrosGrupos, agora = Date.now()) {
  const termo = normalizar(f.busca);
  return linhas.filter(l => {
    if (f.situacao !== "todas" && l.situacao !== f.situacao) return false;
    if (f.clienteId !== "todos" && l.cliente?.id !== f.clienteId) return false;
    if (f.responsavelId === SEM_RESPONSAVEL) {
      if (!l.cliente || l.responsaveis.length) return false;
    } else if (f.responsavelId !== "todos" && !l.responsaveis.some(r => r.id === f.responsavelId)) {
      return false;
    }
    if (!casaAtividade(l, f.atividade, agora)) return false;
    if (!termo) return true;
    const alvo = [l.nomeGrupo ?? "", l.cliente?.name ?? "", ...l.responsaveis.map(r => r.nome)];
    return alvo.some(t => normalizar(t).includes(termo));
  });
}

const PESO_ATENCAO: Record<Atencao, number> = { urgente: 0, atencao: 1, ok: 2 };
const PESO_SITUACAO: Record<Situacao, number> = { vinculado: 0, sem_grupo: 1, sem_cliente: 2 };

/** Quem precisa de resposta primeiro; sem leitura vai para o fim porque ausencia de dado nao e sinal de calma. */
export function ordenarLinhas(linhas: LinhaGrupo[]) {
  return [...linhas].sort((a, b) => {
    const sa = PESO_SITUACAO[a.situacao];
    const sb = PESO_SITUACAO[b.situacao];
    if (sa !== sb) return sa - sb;
    const pa = a.triagem ? PESO_ATENCAO[a.triagem.atencao] : 3;
    const pb = b.triagem ? PESO_ATENCAO[b.triagem.atencao] : 3;
    if (pa !== pb) return pa - pb;
    const ha = a.triagem?.horas_sem_resposta ?? 0;
    const hb = b.triagem?.horas_sem_resposta ?? 0;
    if (ha !== hb) return hb - ha;
    const na = a.cliente?.name ?? a.nomeGrupo ?? "";
    const nb = b.cliente?.name ?? b.nomeGrupo ?? "";
    return na.localeCompare(nb, "pt-BR");
  });
}

export interface ContagemGrupos {
  total: number | null;
  vinculados: number;
  semCliente: number | null;
  semGrupo: number;
  recentes: number;
  esperando: number;
}

/** `gruposConhecidos` falso = a lista do WhatsApp nao veio, entao nao da para contar grupo sem cliente. */
export function contar(linhas: LinhaGrupo[], gruposConhecidos: boolean, agora = Date.now()): ContagemGrupos {
  const vinculados = linhas.filter(l => l.situacao === "vinculado");
  const semCliente = linhas.filter(l => l.situacao === "sem_cliente").length;
  return {
    total: gruposConhecidos ? vinculados.length + semCliente : null,
    vinculados: vinculados.length,
    semCliente: gruposConhecidos ? semCliente : null,
    semGrupo: linhas.filter(l => l.situacao === "sem_grupo").length,
    recentes: vinculados.filter(l => atividadeRecente(l.triagem, agora)).length,
    esperando: vinculados.filter(l => l.triagem?.horas_sem_resposta != null).length,
  };
}

export function filtrosAtivos(f: FiltrosGrupos) {
  return (
    f.busca.trim() !== FILTROS_PADRAO.busca ||
    f.clienteId !== FILTROS_PADRAO.clienteId ||
    f.responsavelId !== FILTROS_PADRAO.responsavelId ||
    f.situacao !== FILTROS_PADRAO.situacao ||
    f.atividade !== FILTROS_PADRAO.atividade
  );
}

export function quando(iso: string | null, agora = new Date()) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return agora.toDateString() === d.toDateString()
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** "3,5h" para esperas curtas, "2 dias" quando passa disso. */
export function espera(horas: number) {
  if (horas < 24) return `${horas.toString().replace(".", ",")}h`;
  const dias = Math.floor(horas / 24);
  return `${dias} dia${dias > 1 ? "s" : ""}`;
}

export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
