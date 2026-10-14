// Regras da Central de Automacoes: dado o estado da operacao e a configuracao
// da empresa, quais avisos e acoes sao devidos agora. Puro de proposito: a
// Edge Function automacoes-operacao busca os dados, chama `avisosDevidos` e
// cuida de gravar, notificar e mandar WhatsApp.
//
// O catalogo (titulos e padroes) tem gemeo em src/lib/automacoes.ts, que a
// Central usa para montar a tela: mexeu nos padroes aqui, mexa la.

import { avaliarMeta, temMeta, type MetricaDiaria } from "./metas.ts";

export type ChaveAutomacao =
  | "nova_demanda"
  | "prazo_proximo"
  | "atrasadas"
  | "criativos_pendentes"
  | "parada"
  | "aguardando_cliente"
  | "sobrecarga"
  | "reunioes"
  | "metas"
  | "resumo_diario"
  | "onboarding"
  | "rotinas"
  | "rotina_atrasada";

export interface ConfigAutomacao {
  ativa: boolean;
  /** Algum destino recebe no WhatsApp. Derivado de `config.destinos`; so vale sozinho em config antiga. */
  whatsapp: boolean;
  config: Record<string, any>;
}

/** Quem recebe, pela relacao com o fato. `pessoa` = a propria pessoa do aviso (sobrecarga, resumo). */
export type Papel = "responsavel" | "corresponsavel" | "solicitante" | "gestor" | "adm" | "pessoa";
export type Canal = "nao" | "sino" | "whatsapp";

export const FASES_ONBOARDING = ["acessos", "rastreamento", "estrategia", "operacao"] as const;

const COPIA = { copiar_para: [], copiar_canal: "sino" };

/** Linha ausente em `automacoes` vale isto. Acao que mexe em dado e WhatsApp novo nascem desligados. */
export const PADROES: Record<ChaveAutomacao, ConfigAutomacao> = {
  nova_demanda: {
    ativa: false, whatsapp: true,
    config: { destinos: { responsavel: "whatsapp", corresponsavel: "whatsapp", solicitante: "nao" }, copiar_para: [], copiar_canal: "whatsapp" },
  },
  prazo_proximo: {
    ativa: true, whatsapp: false,
    config: { antecedencia_horas: 2, aviso_vespera: true, destinos: { responsavel: "sino", corresponsavel: "nao", solicitante: "nao", gestor: "nao" }, ...COPIA },
  },
  atrasadas: {
    ativa: true, whatsapp: false,
    config: { repetir_horas: 0, destinos: { responsavel: "sino", corresponsavel: "nao", solicitante: "sino", gestor: "nao", adm: "nao" }, ...COPIA },
  },
  criativos_pendentes: {
    ativa: true, whatsapp: false,
    config: { antecedencia_horas: 24, destinos: { solicitante: "sino", responsavel: "nao", gestor: "nao" }, ...COPIA },
  },
  parada: {
    ativa: true, whatsapp: false,
    config: { horas: 72, destinos: { responsavel: "sino", solicitante: "nao", gestor: "nao", adm: "nao" }, ...COPIA },
  },
  aguardando_cliente: {
    ativa: true, whatsapp: false,
    config: { horas: 48, destinos: { responsavel: "sino", solicitante: "sino", gestor: "nao" }, ...COPIA },
  },
  sobrecarga: {
    ativa: true, whatsapp: false,
    config: { limite_abertas: 12, limite_atrasadas: 3, destinos: { adm: "sino", pessoa: "nao" }, ...COPIA },
  },
  reunioes: {
    ativa: true, whatsapp: false,
    config: { antecedencia_min: 60, pedir_registro: true, destinos: { responsavel: "sino", solicitante: "sino" }, ...COPIA },
  },
  metas: {
    ativa: true, whatsapp: false,
    config: { periodicidade: "semanal", destinos: { gestor: "sino", adm: "nao" }, ...COPIA },
  },
  resumo_diario: {
    ativa: true, whatsapp: false,
    config: { hora: 8, destinos: { pessoa: "sino", adm: "sino" }, ...COPIA },
  },
  onboarding: {
    ativa: false,
    whatsapp: false,
    config: { responsaveis: {}, prazos: { acessos: 2, rastreamento: 5, estrategia: 7, operacao: 10 }, exigir_aprovacao: true },
  },
  rotinas: { ativa: true, whatsapp: false, config: {} },
  rotina_atrasada: {
    ativa: true, whatsapp: false,
    config: { tolerancia_horas: 0, hora_sem_limite: 18, destinos: { responsavel: "sino", gestor: "nao", adm: "nao" }, ...COPIA },
  },
};

/** Automacao cujo sino ja sai por outro caminho (trigger de atribuicao): aqui so o WhatsApp. */
export const SO_WHATSAPP: ChaveAutomacao[] = ["nova_demanda"];

// Config gravada antes de existir "quem recebe" e prazo em horas.
const LEGADO_HORAS: Partial<Record<ChaveAutomacao, [string, string][]>> = {
  criativos_pendentes: [["dias_antes", "antecedencia_horas"]],
  parada: [["dias", "horas"]],
  aguardando_cliente: [["dias", "horas"]],
};

export function temWhatsapp(config: Record<string, any>) {
  const destinos = Object.values((config.destinos ?? {}) as Record<string, Canal>);
  return destinos.includes("whatsapp") || (config.copiar_canal === "whatsapp" && (config.copiar_para ?? []).length > 0);
}

/** Linha gravada (de qualquer epoca) + padrao = config completa. Gemea de configEfetiva no front. */
export function normalizarConfig(chave: ChaveAutomacao, linha?: { ativa?: boolean; whatsapp?: boolean; config?: any } | null): ConfigAutomacao {
  const padrao = PADROES[chave];
  if (!linha) return padrao;
  const salvo: Record<string, any> = { ...(linha.config ?? {}) };
  for (const [velho, novo] of LEGADO_HORAS[chave] ?? []) {
    if (salvo[velho] != null && salvo[novo] == null) salvo[novo] = Number(salvo[velho]) * 24;
  }
  const config: Record<string, any> = { ...padrao.config, ...salvo };
  if (!padrao.config.destinos) return { ativa: linha.ativa ?? padrao.ativa, whatsapp: !!linha.whatsapp, config };

  const destinos: Record<string, Canal> = { ...padrao.config.destinos, ...(salvo.destinos ?? {}) };
  if (!salvo.destinos) {
    if (chave === "atrasadas" && salvo.avisar_solicitante === false) destinos.solicitante = "nao";
    if (chave === "resumo_diario" && salvo.resumo_gestao === false) destinos.adm = "nao";
    if ((chave === "sobrecarga" || chave === "resumo_diario") && Array.isArray(salvo.destinatarios) && salvo.destinatarios.length) {
      config.copiar_para = salvo.destinatarios;
      destinos.adm = "nao";
    }
    if (linha.whatsapp) {
      for (const k of Object.keys(destinos)) if (destinos[k] === "sino") destinos[k] = "whatsapp";
      config.copiar_canal = "whatsapp";
    }
  }
  config.destinos = destinos;
  return { ativa: linha.ativa ?? padrao.ativa, whatsapp: temWhatsapp(config), config };
}

/** Janela em que aviso pode sair (horario de Sao Paulo). Fora dela o aviso espera. */
export const HORA_INICIO = 8;
export const HORA_FIM = 20;

export function configDe(linhas: { chave: string; ativa: boolean; whatsapp: boolean; config: any }[], chave: ChaveAutomacao): ConfigAutomacao {
  return normalizarConfig(chave, linhas.find(l => l.chave === chave));
}

export interface Tarefa {
  id: string;
  titulo: string;
  status: string;
  categoria: string;
  prazo: string | null;
  prazo_hora: string | null;
  assigned_to: string | null;
  created_by: string | null;
  client_id: string | null;
  updated_at: string;
  concluida_at: string | null;
  created_at: string;
  aguardando_cliente?: boolean | null;
  onboarding_fase?: string | null;
  /** Demanda programada: so existe para o responsavel a partir deste dia. */
  inicia_em?: string | null;
  /** Quando a demanda chegou para o responsavel (na criacao, ou no dia em que a programada liberou). */
  liberada_em?: string | null;
  distribuida_auto?: boolean | null;
  /** De task_corresponsaveis. */
  corresponsaveis?: string[] | null;
}

export interface ClienteOp {
  id: string;
  name: string;
  status: string;
  created_at: string;
  alvo_resultados_mes: number | null;
  alvo_custo_resultado: number | null;
}

export interface PessoaOp {
  id: string;
  nome: string;
  admin: boolean;
}

export interface RotinaOp {
  id: string;
  titulo: string;
  assigned_to: string | null;
  client_id: string | null;
  horario_limite: string | null;
  periodicidade: string;
  dias_semana: number[] | null;
  dia_mes: number | null;
  data_pontual: string | null;
}

export interface ExecucaoRotina {
  rotina_id: string;
  data_ref: string;
  done: boolean;
  status: string | null;
  mover_para: string | null;
}

export interface DadosOperacao {
  /** Dia e minuto do dia em Sao Paulo. */
  hoje: string;
  minuto: number;
  agoraMs: number;
  tarefas: Tarefa[];
  clientes: ClienteOp[];
  pessoas: PessoaOp[];
  carteira: { client_id: string; user_id: string }[];
  metricas: (MetricaDiaria & { client_id: string })[];
  /** (cliente, fase) que ja tem responsavel no onboarding. */
  faseResponsaveis: { client_id: string; fase: string }[];
  /** Rotinas ativas e as baixas de ontem e hoje (inclusive remanejadas). */
  rotinas?: RotinaOp[];
  execucoesRotina?: ExecucaoRotina[];
}

export interface AcaoOnboarding {
  responsaveis: { client_id: string; fase: string; responsavel_id: string }[];
  prazos: { task_id: string; prazo: string }[];
}

export interface Aviso {
  chave: ChaveAutomacao;
  /** Identifica o fato: o mesmo (chave, ref, pessoa) nunca sai duas vezes. */
  ref: string;
  user_id: string | null;
  titulo: string;
  corpo: string;
  link: string;
  whatsapp: boolean;
  /** Nao vai para o sino (o sino ja saiu por outro caminho). */
  semSino?: boolean;
  acao?: AcaoOnboarding;
  exigeAprovacao?: boolean;
}

const ABERTA = (t: Tarefa) => t.status !== "concluida";
const CRIATIVO = ["criativo", "video"];
const DIA_MS = 86_400_000;
const HORA_MS = 3_600_000;

function somarDias(iso: string, n: number) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

function diasEntre(de: string, ate: string) {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS);
}

function minutos(hora: string | null) {
  if (!hora) return null;
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
}

function dataBr(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** "5h", "2 dias": para texto de aviso configurado em horas. */
export function tempoBr(horas: number) {
  if (horas < 48) return `${Math.max(1, Math.floor(horas))}h`;
  return `${Math.floor(horas / 24)} dias`;
}

/** Segunda-feira da semana de `iso`: chave de aviso semanal. */
export function semanaDe(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return somarDias(iso, -((dia + 6) % 7));
}

export function estaAtrasada(t: Tarefa, hoje: string, minuto: number) {
  if (!ABERTA(t) || !t.prazo) return false;
  if (t.prazo < hoje) return true;
  const limite = minutos(t.prazo_hora);
  return t.prazo === hoje && limite !== null && minuto >= limite;
}

/** Minutos desde que o prazo passou. Sem horario, o prazo vence no fim do dia. */
function minutosDeAtraso(t: Tarefa, hoje: string, minuto: number) {
  return diasEntre(t.prazo!, hoje) * 1440 + minuto - (minutos(t.prazo_hora) ?? 1440);
}

function horasDesde(iso: string, agoraMs: number) {
  return (agoraMs - new Date(iso).getTime()) / HORA_MS;
}

function unicos(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((x): x is string => !!x))];
}

// Espelha public.rotina_vence_em (e venceEm de src/lib/rotinas.ts).
export function rotinaVenceEm(r: Pick<RotinaOp, "periodicidade" | "dias_semana" | "dia_mes" | "data_pontual">, iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  if (r.periodicidade === "pontual") return r.data_pontual === iso;
  if (r.periodicidade === "diaria") return true;
  if (r.periodicidade === "semanal") return r.dias_semana?.includes(new Date(Date.UTC(a, m - 1, d)).getUTCDay()) ?? false;
  if (r.periodicidade === "mensal") {
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return r.dia_mes != null && d === Math.min(r.dia_mes, ultimo);
  }
  return false;
}

export interface OcorrenciaRotina {
  rotina: RotinaOp;
  data_ref: string;
  feita: boolean;
}

/** Ocorrencias que caem em `dia`, ja contando as remanejadas para ele ou para fora dele. */
export function rotinasDoDia(dados: DadosOperacao, dia: string): OcorrenciaRotina[] {
  const execs = dados.execucoesRotina ?? [];
  const feita = (e?: ExecucaoRotina) => !!e && (e.done || e.status === "concluida");
  const lista: OcorrenciaRotina[] = [];
  for (const r of dados.rotinas ?? []) {
    if (!r.assigned_to) continue;
    const e = execs.find(x => x.rotina_id === r.id && x.data_ref === dia);
    if (rotinaVenceEm(r, dia) && (e?.mover_para ?? dia) === dia) lista.push({ rotina: r, data_ref: dia, feita: feita(e) });
    for (const m of execs) {
      if (m.rotina_id === r.id && m.mover_para === dia && m.data_ref !== dia) lista.push({ rotina: r, data_ref: m.data_ref, feita: feita(m) });
    }
  }
  return lista;
}

type Papeis = Partial<Record<Papel, (string | null | undefined)[]>>;

export function avisosDevidos(dados: DadosOperacao, cfg: (chave: ChaveAutomacao) => ConfigAutomacao): Aviso[] {
  const { hoje, minuto, agoraMs } = dados;
  const avisos: Aviso[] = [];
  const nome = (id: string | null) => dados.pessoas.find(p => p.id === id)?.nome ?? "Sem responsável";
  const cliente = (id: string | null) => (id ? dados.clientes.find(c => c.id === id)?.name ?? null : null);
  const comCliente = (t: { client_id: string | null }) => (cliente(t.client_id) ? ` · ${cliente(t.client_id)}` : "");
  const link = (t: Tarefa) => `/demandas?demanda=${t.id}`;
  // Demanda programada para depois de hoje ainda nao existe para ninguem.
  const liberada = (t: Tarefa) => !t.inicia_em || t.inicia_em <= hoje;
  const abertas = dados.tarefas.filter(t => ABERTA(t) && liberada(t));
  const admins = dados.pessoas.filter(p => p.admin).map(p => p.id);
  const daCarteira = (clientId: string | null) => (clientId ? dados.carteira.filter(a => a.client_id === clientId).map(a => a.user_id) : []);
  const rotinasHoje = rotinasDoDia(dados, hoje);
  const rotinasPendentes = (pessoa: string | null) => rotinasHoje.filter(o => !o.feita && o.rotina.assigned_to === pessoa).length;
  const agendaDe = (pessoa: string | null) => {
    const n = rotinasPendentes(pessoa);
    return pessoa && n ? ` · ${nome(pessoa)} ainda tem ${n} rotina${n === 1 ? "" : "s"} hoje` : "";
  };

  /** Resolve papeis em pessoas; quem aparece em dois papeis fica com o canal mais forte. */
  const destinos = (chave: ChaveAutomacao, papeis: Papeis) => {
    const c = cfg(chave);
    const canais = (c.config.destinos ?? {}) as Partial<Record<Papel, Canal>>;
    const porPessoa = new Map<string, boolean>();
    const somar = (ids: (string | null | undefined)[], canal: Canal | undefined) => {
      if (!canal || canal === "nao") return;
      for (const id of unicos(ids)) porPessoa.set(id, (porPessoa.get(id) ?? false) || canal === "whatsapp");
    };
    for (const papel of Object.keys(canais) as Papel[]) {
      if (papel === "adm") somar(admins, canais.adm);
      else somar(papeis[papel] ?? [], canais[papel]);
    }
    // Cliente sem gestor na carteira: o aviso pedido ao gestor cai nos ADMs.
    if ("gestor" in papeis && !(papeis.gestor ?? []).length) somar(admins, canais.gestor);
    const extras = ((c.config.copiar_para ?? []) as string[]).filter(id => dados.pessoas.some(p => p.id === id));
    somar(extras, c.config.copiar_canal ?? "sino");
    return [...porPessoa].map(([user_id, whatsapp]) => ({ user_id, whatsapp }));
  };

  const emitir = (chave: ChaveAutomacao, base: Omit<Aviso, "chave" | "user_id" | "whatsapp">, papeis: Papeis) => {
    const semSino = SO_WHATSAPP.includes(chave);
    for (const d of destinos(chave, papeis)) {
      if (semSino && !d.whatsapp) continue;
      avisos.push({ chave, ...d, ...base, ...(semSino ? { semSino } : {}) });
    }
  };

  const daTarefa = (t: Tarefa, responsavel: string | null = t.assigned_to ?? t.created_by): Papeis => ({
    responsavel: [responsavel],
    corresponsavel: t.corresponsaveis ?? [],
    solicitante: [t.created_by],
    gestor: daCarteira(t.client_id),
  });

  const nova = cfg("nova_demanda");
  if (nova.ativa) {
    for (const t of abertas) {
      if (!t.assigned_to && !(t.corresponsaveis ?? []).length) continue;
      // So o que chegou nas ultimas 24h; programada conta de quando foi liberada.
      const chegou = t.liberada_em !== undefined ? t.liberada_em : t.created_at;
      if (!chegou || horasDesde(chegou, agoraMs) > 24) continue;
      const papeis = daTarefa(t, t.assigned_to);
      // Quem criou ja sabe da demanda.
      papeis.responsavel = papeis.responsavel!.filter(id => id !== t.created_by);
      papeis.corresponsavel = papeis.corresponsavel!.filter(id => id !== t.created_by);
      emitir("nova_demanda", {
        ref: t.id,
        titulo: `Nova demanda para você: ${t.titulo}`,
        corpo: [
          t.prazo ? `Prazo ${dataBr(t.prazo)}${t.prazo_hora ? ` às ${t.prazo_hora.slice(0, 5)}` : ""}` : "Sem prazo",
          t.created_by ? `pedida por ${nome(t.created_by)}` : null,
          t.distribuida_auto ? "distribuída automaticamente" : null,
        ].filter(Boolean).join(" · ") + comCliente(t),
        link: link(t),
      }, papeis);
    }
  }

  const prazo = cfg("prazo_proximo");
  if (prazo.ativa) {
    const amanha = somarDias(hoje, 1);
    const antes = Number(prazo.config.antecedencia_horas) * 60;
    for (const t of abertas) {
      if (!t.prazo || t.categoria === "reuniao" || t.prazo < hoje) continue;
      const papeis = daTarefa(t);
      if (prazo.config.aviso_vespera && t.prazo === amanha) {
        emitir("prazo_proximo", {
          ref: `${t.id}|${t.prazo}|vespera`,
          titulo: `Vence amanhã: ${t.titulo}`,
          corpo: `Prazo ${dataBr(t.prazo)}${t.prazo_hora ? ` às ${t.prazo_hora.slice(0, 5)}` : ""}${comCliente(t)}`,
          link: link(t),
        }, papeis);
      }
      if (t.prazo === hoje) {
        emitir("prazo_proximo", {
          ref: `${t.id}|${t.prazo}|dia`,
          titulo: `Vence hoje: ${t.titulo}`,
          corpo: `${t.prazo_hora ? `Até ${t.prazo_hora.slice(0, 5)}` : "Prazo hoje"}${comCliente(t)}${agendaDe(t.assigned_to)}`,
          link: link(t),
        }, papeis);
      }
      // Antecedencia em horas pode atravessar o dia (ex.: 30h antes).
      const limite = minutos(t.prazo_hora);
      if (limite === null || antes <= 0) continue;
      const faltam = diasEntre(hoje, t.prazo) * 1440 + limite - minuto;
      if (faltam > 0 && faltam <= antes) {
        emitir("prazo_proximo", {
          ref: `${t.id}|${t.prazo}|${t.prazo_hora}|antes`,
          titulo: `Faltam ${tempoBr(faltam / 60)}: ${t.titulo}`,
          corpo: `Entrega ${t.prazo === hoje ? "hoje" : dataBr(t.prazo)} às ${t.prazo_hora!.slice(0, 5)}${comCliente(t)}`,
          link: link(t),
        }, papeis);
      }
    }
  }

  const atraso = cfg("atrasadas");
  if (atraso.ativa) {
    const repetir = Number(atraso.config.repetir_horas) * 60;
    for (const t of abertas) {
      if (!estaAtrasada(t, hoje, minuto)) continue;
      const atrasoMin = Math.max(0, minutosDeAtraso(t, hoje, minuto));
      const vez = repetir > 0 ? Math.floor(atrasoMin / repetir) : 0;
      emitir("atrasadas", {
        ref: `${t.id}|${t.prazo}${vez ? `|${vez}` : ""}`,
        titulo: vez ? `Ainda atrasada (${tempoBr(atrasoMin / 60)}): ${t.titulo}` : `Atrasada: ${t.titulo}`,
        corpo: `Prazo era ${dataBr(t.prazo!)}${t.prazo_hora ? ` às ${t.prazo_hora.slice(0, 5)}` : ""} · com ${nome(t.assigned_to)}${comCliente(t)}${agendaDe(t.assigned_to)}`,
        link: link(t),
      }, daTarefa(t));
    }
  }

  const criativo = cfg("criativos_pendentes");
  if (criativo.ativa) {
    const horas = Number(criativo.config.antecedencia_horas) || 0;
    // Sem horario de entrega, conta em dias: 24h antes = prazo ate amanha.
    const limiteDia = somarDias(hoje, Math.ceil(horas / 24));
    for (const t of abertas) {
      if (!CRIATIVO.includes(t.categoria) || !t.prazo) continue;
      if (t.status !== "a_fazer" && t.status !== "fazendo") continue;
      const hora = minutos(t.prazo_hora);
      const perto = hora === null
        ? t.prazo <= limiteDia
        : diasEntre(hoje, t.prazo) * 1440 + hora - minuto <= horas * 60;
      if (!perto) continue;
      const papeis = daTarefa(t);
      // Quem fez o pedido para si mesmo nao precisa ser cobrado por ele.
      if (t.created_by === t.assigned_to) papeis.solicitante = [];
      emitir("criativos_pendentes", {
        ref: `${t.id}|${t.prazo}`,
        titulo: `Material ainda não entregue: ${t.titulo}`,
        corpo: `${t.prazo < hoje ? "Prazo passou em" : "Prazo"} ${dataBr(t.prazo)}${t.prazo_hora ? ` às ${t.prazo_hora.slice(0, 5)}` : ""} · ${nome(t.assigned_to)} ainda não mandou para revisão${comCliente(t)}`,
        link: link(t),
      }, papeis);
    }
  }

  const parada = cfg("parada");
  if (parada.ativa) {
    const limite = Number(parada.config.horas) || 72;
    for (const t of abertas) {
      if (t.aguardando_cliente) continue;
      const parado = horasDesde(t.updated_at, agoraMs);
      if (parado < limite) continue;
      const emRevisao = t.status === "revisao";
      emitir("parada", {
        ref: `${t.id}|${t.updated_at}`,
        titulo: emRevisao ? `Esperando revisão há ${tempoBr(parado)}: ${t.titulo}` : `Parada há ${tempoBr(parado)}: ${t.titulo}`,
        corpo: emRevisao
          ? `${nome(t.assigned_to)} entregou e aguarda aprovação de ${nome(t.created_by)}${comCliente(t)}`
          : `Sem nenhuma atualização desde ${dataBr(t.updated_at.slice(0, 10))}${comCliente(t)}${agendaDe(t.assigned_to)}`,
        link: link(t),
      }, daTarefa(t, emRevisao ? t.created_by : t.assigned_to ?? t.created_by));
    }
  }

  const material = cfg("aguardando_cliente");
  if (material.ativa) {
    const limite = Number(material.config.horas) || 48;
    for (const t of abertas) {
      if (!t.aguardando_cliente) continue;
      const parado = horasDesde(t.updated_at, agoraMs);
      if (parado < limite) continue;
      emitir("aguardando_cliente", {
        ref: `${t.id}|${t.updated_at}`,
        titulo: `Cliente não mandou o material: ${t.titulo}`,
        corpo: `Travada há ${tempoBr(parado)} esperando ${cliente(t.client_id) ?? "o cliente"}. Vale cobrar no grupo do cliente.`,
        link: link(t),
      }, daTarefa(t, t.assigned_to));
    }
  }

  const sobrecarga = cfg("sobrecarga");
  if (sobrecarga.ativa) {
    const porPessoa = new Map<string, { abertas: number; atrasadas: number }>();
    for (const t of abertas) {
      if (!t.assigned_to) continue;
      const c = porPessoa.get(t.assigned_to) ?? { abertas: 0, atrasadas: 0 };
      c.abertas += 1;
      if (estaAtrasada(t, hoje, minuto)) c.atrasadas += 1;
      porPessoa.set(t.assigned_to, c);
    }
    for (const [pessoa, c] of porPessoa) {
      if (c.abertas <= Number(sobrecarga.config.limite_abertas) && c.atrasadas < Number(sobrecarga.config.limite_atrasadas)) continue;
      const rotinas = rotinasPendentes(pessoa);
      emitir("sobrecarga", {
        ref: `${pessoa}|${hoje}`,
        titulo: `${nome(pessoa)} está sobrecarregado(a)`,
        corpo: `${c.abertas} demandas abertas, ${c.atrasadas} atrasada${c.atrasadas === 1 ? "" : "s"}` +
          `${rotinas ? ` e ${rotinas} rotina${rotinas === 1 ? "" : "s"} pendente${rotinas === 1 ? "" : "s"} hoje` : ""}. Considere redistribuir ou repriorizar.`,
        link: `/agencia?pessoa=${pessoa}`,
      }, { pessoa: [pessoa] });
    }
  }

  const reuniao = cfg("reunioes");
  if (reuniao.ativa) {
    for (const t of dados.tarefas) {
      if (t.categoria !== "reuniao" || !liberada(t)) continue;
      const papeis: Papeis = { responsavel: [t.assigned_to, ...(t.corresponsaveis ?? [])], solicitante: [t.created_by] };
      if (ABERTA(t) && t.prazo === hoje) {
        const inicio = minutos(t.prazo_hora);
        const antes = Number(reuniao.config.antecedencia_min) || 60;
        if (inicio === null) {
          emitir("reunioes", { ref: `${t.id}|${t.prazo}|dia`, titulo: `Reunião hoje: ${t.titulo}`, corpo: `Sem horário definido${comCliente(t)}`, link: link(t) }, papeis);
        } else if (minuto >= inicio - antes && minuto < inicio) {
          emitir("reunioes", {
            ref: `${t.id}|${t.prazo}|${t.prazo_hora}`,
            titulo: `Reunião às ${t.prazo_hora!.slice(0, 5)}: ${t.titulo}`,
            corpo: `Começa em ${inicio - minuto} min${comCliente(t)}`,
            link: link(t),
          }, papeis);
        }
      }
      if (reuniao.config.pedir_registro && t.status === "concluida" && t.concluida_at && agoraMs - new Date(t.concluida_at).getTime() < 2 * DIA_MS) {
        emitir("reunioes", {
          ref: `${t.id}|registro`,
          titulo: `Registre o que saiu da reunião: ${t.titulo}`,
          corpo: "Transforme os combinados do alinhamento em demandas para ninguém esquecer.",
          link: `/agencia?registrar=${t.id}`,
        }, { solicitante: [t.created_by ?? t.assigned_to] });
      }
    }
  }

  const metas = cfg("metas");
  if (metas.ativa) {
    const periodo = metas.config.periodicidade === "diaria" ? hoje : semanaDe(hoje);
    for (const c of dados.clientes) {
      if (c.status !== "active") continue;
      const alvos = { alvo_resultados_mes: c.alvo_resultados_mes, alvo_custo_resultado: c.alvo_custo_resultado };
      if (!temMeta(alvos)) continue;
      const av = avaliarMeta(alvos, dados.metricas.filter(m => m.client_id === c.id), hoje);
      if (!av.resultadosAbaixo && !av.custoAcima) continue;
      const problemas: string[] = [];
      if (av.resultadosAbaixo) problemas.push(`projeção de ${av.projecao} resultados para meta de ${av.alvoResultados}`);
      if (av.custoAcima) {
        problemas.push(av.custoPorResultado !== null
          ? `custo por resultado de R$ ${av.custoPorResultado.toFixed(2)} para meta de R$ ${av.alvoCusto!.toFixed(2)}`
          : `R$ ${av.gasto.toFixed(2)} gastos sem nenhum resultado`);
      }
      const sugestao = av.custoAcima
        ? "Revise criativos com CPR alto, pause os piores conjuntos e teste novos públicos."
        : "Aumente o orçamento dos conjuntos que estão no custo ou renove os criativos.";
      emitir("metas", {
        ref: `${c.id}|${periodo}`,
        titulo: `${c.name} fora da meta`,
        corpo: `${problemas.join("; ")}. ${sugestao}`,
        link: `/clients/${c.id}`,
      }, { gestor: daCarteira(c.id) });
    }
  }

  const resumo = cfg("resumo_diario");
  if (resumo.ativa && minuto >= (Number(resumo.config.hora) || 8) * 60) {
    const canais = (resumo.config.destinos ?? {}) as Partial<Record<Papel, Canal>>;
    if (canais.pessoa && canais.pessoa !== "nao") {
      for (const p of dados.pessoas) {
        const minhas = abertas.filter(t => t.assigned_to === p.id || (t.corresponsaveis ?? []).includes(p.id));
        const vencemHoje = minhas.filter(t => t.prazo === hoje).length;
        const atrasadas = minhas.filter(t => estaAtrasada(t, hoje, minuto)).length;
        const revisar = abertas.filter(t => t.created_by === p.id && t.assigned_to !== p.id && t.status === "revisao").length;
        const rotinas = rotinasHoje.filter(o => o.rotina.assigned_to === p.id && !o.feita);
        if (!vencemHoje && !atrasadas && !revisar && !rotinas.length) continue;
        const proxima = rotinas.filter(o => o.rotina.horario_limite).sort((a, b) => a.rotina.horario_limite!.localeCompare(b.rotina.horario_limite!))[0];
        const partes = [
          vencemHoje && `${vencemHoje} vence${vencemHoje === 1 ? "" : "m"} hoje`,
          atrasadas && `${atrasadas} atrasada${atrasadas === 1 ? "" : "s"}`,
          revisar && `${revisar} esperando sua revisão`,
          rotinas.length && `${rotinas.length} rotina${rotinas.length === 1 ? "" : "s"} hoje${proxima ? ` (1ª até ${proxima.rotina.horario_limite!.slice(0, 5)}: ${proxima.rotina.titulo})` : ""}`,
          `${minhas.length} demanda${minhas.length === 1 ? "" : "s"} aberta${minhas.length === 1 ? "" : "s"} com você`,
        ].filter(Boolean);
        avisos.push({
          chave: "resumo_diario",
          ref: hoje,
          user_id: p.id,
          whatsapp: canais.pessoa === "whatsapp",
          titulo: "Seu dia",
          corpo: partes.join(" · "),
          link: "/demandas",
        });
      }
    }
    const atrasadas = abertas.filter(t => estaAtrasada(t, hoje, minuto));
    const ontem = somarDias(hoje, -1);
    const entregues = dados.tarefas.filter(t => t.concluida_at && t.concluida_at.slice(0, 10) === ontem).length;
    const semDono = abertas.filter(t => !t.assigned_to).length;
    const rotinasOntem = rotinasDoDia(dados, ontem);
    const feitasOntem = rotinasOntem.filter(o => o.feita).length;
    const corpo = [
      `${abertas.length} demandas abertas`,
      `${atrasadas.length} atrasada${atrasadas.length === 1 ? "" : "s"}`,
      `${abertas.filter(t => t.prazo === hoje).length} vencem hoje`,
      `${entregues} concluída${entregues === 1 ? "" : "s"} ontem`,
      semDono ? `${semDono} sem responsável` : null,
      rotinasOntem.length ? `rotina de ontem: ${feitasOntem} de ${rotinasOntem.length} feitas (${Math.round((feitasOntem / rotinasOntem.length) * 100)}%)` : null,
      rotinasHoje.length ? `${rotinasHoje.length} rotinas hoje` : null,
    ].filter(Boolean).join(" · ");
    // O panorama vai para ADMs e extras; o papel "pessoa" ja recebeu o proprio dia acima.
    emitir("resumo_diario", { ref: `${hoje}|gestao`, titulo: "Resumo da operação", corpo, link: "/agencia" }, {});
  }

  const rotinaAtraso = cfg("rotina_atrasada");
  if (rotinaAtraso.ativa) {
    const tolerancia = (Number(rotinaAtraso.config.tolerancia_horas) || 0) * 60;
    const semLimite = (Number(rotinaAtraso.config.hora_sem_limite) || 18) * 60;
    for (const o of rotinasHoje) {
      if (o.feita) continue;
      const r = o.rotina;
      const limite = minutos(r.horario_limite) ?? semLimite;
      if (minuto < limite + tolerancia) continue;
      const demandas = abertas.filter(t => t.assigned_to === r.assigned_to).length;
      emitir("rotina_atrasada", {
        ref: `${r.id}|${o.data_ref}`,
        titulo: `Rotina não feita: ${r.titulo}`,
        corpo: `${r.horario_limite ? `Limite era ${r.horario_limite.slice(0, 5)}` : "Ainda sem baixa hoje"} · com ${nome(r.assigned_to)}${comCliente(r)}` +
          `${demandas ? ` · ${demandas} demanda${demandas === 1 ? "" : "s"} aberta${demandas === 1 ? "" : "s"} na fila dela(e)` : ""}`,
        link: "/rotina",
      }, { responsavel: [r.assigned_to], gestor: daCarteira(r.client_id) });
    }
  }

  const entrada = cfg("onboarding");
  if (entrada.ativa) {
    const responsaveisPadrao = (entrada.config.responsaveis ?? {}) as Record<string, string | null>;
    const prazos = (entrada.config.prazos ?? {}) as Record<string, number>;
    for (const c of dados.clientes) {
      if (c.status !== "active" || horasDesde(c.created_at, agoraMs) > 30 * 24) continue;
      const acao: AcaoOnboarding = { responsaveis: [], prazos: [] };
      for (const fase of FASES_ONBOARDING) {
        const resp = responsaveisPadrao[fase];
        if (resp && dados.pessoas.some(p => p.id === resp) && !dados.faseResponsaveis.some(f => f.client_id === c.id && f.fase === fase)) {
          acao.responsaveis.push({ client_id: c.id, fase, responsavel_id: resp });
        }
      }
      for (const t of dados.tarefas) {
        if (t.client_id !== c.id || !t.onboarding_fase || t.prazo || !ABERTA(t)) continue;
        const dias = Number(prazos[t.onboarding_fase]);
        if (dias > 0) acao.prazos.push({ task_id: t.id, prazo: somarDias(c.created_at.slice(0, 10), dias) });
      }
      if (!acao.responsaveis.length && !acao.prazos.length) continue;
      const ref = [c.id, ...acao.responsaveis.map(r => `${r.fase}:${r.responsavel_id}`), ...acao.prazos.map(p => p.task_id)].join("|");
      const partes = [
        acao.responsaveis.length && acao.responsaveis.map(r => `${r.fase} → ${nome(r.responsavel_id)}`).join(", "),
        acao.prazos.length && `${acao.prazos.length} prazo${acao.prazos.length === 1 ? "" : "s"} de etapa`,
      ].filter(Boolean).join(" · ");
      const exigeAprovacao = !!entrada.config.exigir_aprovacao;
      avisos.push({
        chave: "onboarding",
        ref,
        user_id: null,
        whatsapp: false,
        titulo: `${exigeAprovacao ? "Aprovar entrada" : "Entrada configurada"}: ${c.name}`,
        corpo: partes,
        link: "/agencia/automacoes",
        acao,
        exigeAprovacao,
      });
      if (exigeAprovacao) {
        for (const g of admins) {
          avisos.push({
            chave: "onboarding",
            ref: `${ref}|aviso`,
            user_id: g,
            whatsapp: false,
            titulo: `Aprovar entrada de ${c.name}`,
            corpo: partes,
            link: "/agencia/automacoes",
          });
        }
      }
    }
  }

  return avisos;
}

/** Texto do aviso no WhatsApp. */
export function textoWhatsapp(a: Pick<Aviso, "titulo" | "corpo" | "link">, siteUrl: string) {
  return [`🔔 *${a.titulo}*`, a.corpo, "", `🔗 ${siteUrl.replace(/\/$/, "")}${a.link}`].join("\n");
}
