// Regras da Central de Automacoes: dado o estado da operacao e a configuracao
// da empresa, quais avisos e acoes sao devidos agora. Puro de proposito: a
// Edge Function automacoes-operacao busca os dados, chama `avisosDevidos` e
// cuida de gravar, notificar e mandar WhatsApp.
//
// O catalogo (titulos e padroes) tem gemeo em src/lib/automacoes.ts, que a
// Central usa para montar a tela: mexeu nos padroes aqui, mexa la.

import { avaliarMeta, temMeta, type MetricaDiaria } from "./metas.ts";

export type ChaveAutomacao =
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
  | "rotinas";

export interface ConfigAutomacao {
  ativa: boolean;
  whatsapp: boolean;
  config: Record<string, any>;
}

export const FASES_ONBOARDING = ["acessos", "rastreamento", "estrategia", "operacao"] as const;

/** Linha ausente em `automacoes` vale isto. Acao que mexe em dado nasce desligada. */
export const PADROES: Record<ChaveAutomacao, ConfigAutomacao> = {
  prazo_proximo: { ativa: true, whatsapp: false, config: { antecedencia_horas: 2, aviso_vespera: true, copiar_para: [] } },
  atrasadas: { ativa: true, whatsapp: false, config: { avisar_solicitante: true, copiar_para: [] } },
  criativos_pendentes: { ativa: true, whatsapp: false, config: { dias_antes: 1 } },
  parada: { ativa: true, whatsapp: false, config: { dias: 3 } },
  aguardando_cliente: { ativa: true, whatsapp: false, config: { dias: 2 } },
  sobrecarga: { ativa: true, whatsapp: false, config: { limite_abertas: 12, limite_atrasadas: 3, destinatarios: [] } },
  reunioes: { ativa: true, whatsapp: false, config: { antecedencia_min: 60, pedir_registro: true } },
  metas: { ativa: true, whatsapp: false, config: { periodicidade: "semanal", destinatarios: [] } },
  resumo_diario: { ativa: true, whatsapp: false, config: { hora: 8, resumo_gestao: true, destinatarios: [] } },
  onboarding: {
    ativa: false,
    whatsapp: false,
    config: { responsaveis: {}, prazos: { acessos: 2, rastreamento: 5, estrategia: 7, operacao: 10 }, exigir_aprovacao: true },
  },
  rotinas: { ativa: true, whatsapp: false, config: {} },
};

/** Janela em que aviso pode sair (horario de Sao Paulo). Fora dela o aviso espera. */
export const HORA_INICIO = 8;
export const HORA_FIM = 20;

export function configDe(linhas: { chave: string; ativa: boolean; whatsapp: boolean; config: any }[], chave: ChaveAutomacao): ConfigAutomacao {
  const padrao = PADROES[chave];
  const linha = linhas.find(l => l.chave === chave);
  if (!linha) return padrao;
  return { ativa: linha.ativa, whatsapp: linha.whatsapp, config: { ...padrao.config, ...(linha.config ?? {}) } };
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
  acao?: AcaoOnboarding;
  exigeAprovacao?: boolean;
}

const ABERTA = (t: Tarefa) => t.status !== "concluida";
const CRIATIVO = ["criativo", "video"];
const DIA_MS = 86_400_000;

function somarDias(iso: string, n: number) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
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

function diasDesde(iso: string, agoraMs: number) {
  return Math.floor((agoraMs - new Date(iso).getTime()) / DIA_MS);
}

function unicos(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((x): x is string => !!x))];
}

function gestores(dados: DadosOperacao, destinatarios: string[] | undefined) {
  const validos = (destinatarios ?? []).filter(id => dados.pessoas.some(p => p.id === id));
  return validos.length ? validos : dados.pessoas.filter(p => p.admin).map(p => p.id);
}

export function avisosDevidos(dados: DadosOperacao, cfg: (chave: ChaveAutomacao) => ConfigAutomacao): Aviso[] {
  const { hoje, minuto, agoraMs } = dados;
  const avisos: Aviso[] = [];
  const nome = (id: string | null) => dados.pessoas.find(p => p.id === id)?.nome ?? "Sem responsável";
  const cliente = (id: string | null) => (id ? dados.clientes.find(c => c.id === id)?.name ?? null : null);
  const comCliente = (t: Tarefa) => (cliente(t.client_id) ? ` · ${cliente(t.client_id)}` : "");
  const link = (t: Tarefa) => `/demandas?demanda=${t.id}`;
  const abertas = dados.tarefas.filter(ABERTA);

  const emitir = (chave: ChaveAutomacao, base: Omit<Aviso, "chave" | "user_id" | "whatsapp">, pessoas: (string | null)[]) => {
    const c = cfg(chave);
    for (const user_id of unicos([...pessoas, ...((c.config.copiar_para as string[]) ?? [])])) {
      avisos.push({ chave, user_id, whatsapp: c.whatsapp, ...base });
    }
  };

  const prazo = cfg("prazo_proximo");
  if (prazo.ativa) {
    const amanha = somarDias(hoje, 1);
    for (const t of abertas) {
      if (!t.prazo || t.categoria === "reuniao") continue;
      const quem = t.assigned_to ?? t.created_by;
      if (prazo.config.aviso_vespera && t.prazo === amanha) {
        emitir("prazo_proximo", {
          ref: `${t.id}|${t.prazo}|vespera`,
          titulo: `Vence amanhã: ${t.titulo}`,
          corpo: `Prazo ${dataBr(t.prazo)}${t.prazo_hora ? ` às ${t.prazo_hora.slice(0, 5)}` : ""}${comCliente(t)}`,
          link: link(t),
        }, [quem]);
      }
      if (t.prazo !== hoje) continue;
      emitir("prazo_proximo", {
        ref: `${t.id}|${t.prazo}|dia`,
        titulo: `Vence hoje: ${t.titulo}`,
        corpo: `${t.prazo_hora ? `Até ${t.prazo_hora.slice(0, 5)}` : "Prazo hoje"}${comCliente(t)}`,
        link: link(t),
      }, [quem]);
      const limite = minutos(t.prazo_hora);
      const antes = Number(prazo.config.antecedencia_horas) * 60;
      if (limite !== null && antes > 0 && minuto >= limite - antes && minuto < limite) {
        emitir("prazo_proximo", {
          ref: `${t.id}|${t.prazo}|${t.prazo_hora}|antes`,
          titulo: `Faltam ${Math.max(1, Math.round((limite - minuto) / 60))}h: ${t.titulo}`,
          corpo: `Entrega às ${t.prazo_hora!.slice(0, 5)}${comCliente(t)}`,
          link: link(t),
        }, [quem]);
      }
    }
  }

  const atraso = cfg("atrasadas");
  if (atraso.ativa) {
    for (const t of abertas) {
      if (!estaAtrasada(t, hoje, minuto)) continue;
      const pessoas = [t.assigned_to ?? t.created_by];
      if (atraso.config.avisar_solicitante) pessoas.push(t.created_by);
      emitir("atrasadas", {
        ref: `${t.id}|${t.prazo}`,
        titulo: `Atrasada: ${t.titulo}`,
        corpo: `Prazo era ${dataBr(t.prazo!)} · com ${nome(t.assigned_to)}${comCliente(t)}`,
        link: link(t),
      }, pessoas);
    }
  }

  const criativo = cfg("criativos_pendentes");
  if (criativo.ativa) {
    const limite = somarDias(hoje, Number(criativo.config.dias_antes) || 0);
    for (const t of abertas) {
      if (!CRIATIVO.includes(t.categoria) || !t.prazo || t.prazo > limite) continue;
      if (t.status !== "a_fazer" && t.status !== "fazendo") continue;
      if (!t.created_by || t.created_by === t.assigned_to) continue;
      emitir("criativos_pendentes", {
        ref: `${t.id}|${t.prazo}`,
        titulo: `Material ainda não entregue: ${t.titulo}`,
        corpo: `${t.prazo < hoje ? "Prazo passou em" : "Prazo"} ${dataBr(t.prazo)} · ${nome(t.assigned_to)} ainda não mandou para revisão${comCliente(t)}`,
        link: link(t),
      }, [t.created_by]);
    }
  }

  const parada = cfg("parada");
  if (parada.ativa) {
    const dias = Number(parada.config.dias) || 3;
    for (const t of abertas) {
      if (t.aguardando_cliente) continue;
      const parado = diasDesde(t.updated_at, agoraMs);
      if (parado < dias) continue;
      const emRevisao = t.status === "revisao";
      emitir("parada", {
        ref: `${t.id}|${t.updated_at.slice(0, 10)}`,
        titulo: emRevisao ? `Esperando sua revisão há ${parado} dias: ${t.titulo}` : `Parada há ${parado} dias: ${t.titulo}`,
        corpo: emRevisao ? `${nome(t.assigned_to)} entregou e aguarda aprovação${comCliente(t)}` : `Sem nenhuma atualização desde ${dataBr(t.updated_at.slice(0, 10))}${comCliente(t)}`,
        link: link(t),
      }, [emRevisao ? t.created_by : t.assigned_to ?? t.created_by]);
    }
  }

  const material = cfg("aguardando_cliente");
  if (material.ativa) {
    const dias = Number(material.config.dias) || 2;
    for (const t of abertas) {
      if (!t.aguardando_cliente) continue;
      const parado = diasDesde(t.updated_at, agoraMs);
      if (parado < dias) continue;
      emitir("aguardando_cliente", {
        ref: `${t.id}|${t.updated_at.slice(0, 10)}`,
        titulo: `Cliente não mandou o material: ${t.titulo}`,
        corpo: `Travada há ${parado} dias esperando ${cliente(t.client_id) ?? "o cliente"}. Vale cobrar no grupo do cliente.`,
        link: link(t),
      }, [t.created_by, t.assigned_to]);
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
    const quemRecebe = gestores(dados, sobrecarga.config.destinatarios);
    for (const [pessoa, c] of porPessoa) {
      if (c.abertas <= Number(sobrecarga.config.limite_abertas) && c.atrasadas < Number(sobrecarga.config.limite_atrasadas)) continue;
      for (const g of quemRecebe) {
        avisos.push({
          chave: "sobrecarga",
          ref: `${pessoa}|${hoje}`,
          user_id: g,
          whatsapp: sobrecarga.whatsapp,
          titulo: `${nome(pessoa)} está sobrecarregado(a)`,
          corpo: `${c.abertas} demandas abertas, ${c.atrasadas} atrasada${c.atrasadas === 1 ? "" : "s"}. Considere redistribuir ou repriorizar.`,
          link: `/agencia?pessoa=${pessoa}`,
        });
      }
    }
  }

  const reuniao = cfg("reunioes");
  if (reuniao.ativa) {
    for (const t of dados.tarefas) {
      if (t.categoria !== "reuniao") continue;
      const pessoas = [t.assigned_to, t.created_by];
      if (ABERTA(t) && t.prazo === hoje) {
        const inicio = minutos(t.prazo_hora);
        const antes = Number(reuniao.config.antecedencia_min) || 60;
        if (inicio === null) {
          emitir("reunioes", { ref: `${t.id}|${t.prazo}|dia`, titulo: `Reunião hoje: ${t.titulo}`, corpo: `Sem horário definido${comCliente(t)}`, link: link(t) }, pessoas);
        } else if (minuto >= inicio - antes && minuto < inicio) {
          emitir("reunioes", {
            ref: `${t.id}|${t.prazo}|${t.prazo_hora}`,
            titulo: `Reunião às ${t.prazo_hora!.slice(0, 5)}: ${t.titulo}`,
            corpo: `Começa em ${inicio - minuto} min${comCliente(t)}`,
            link: link(t),
          }, pessoas);
        }
      }
      if (reuniao.config.pedir_registro && t.status === "concluida" && t.concluida_at && agoraMs - new Date(t.concluida_at).getTime() < 2 * DIA_MS) {
        emitir("reunioes", {
          ref: `${t.id}|registro`,
          titulo: `Registre o que saiu da reunião: ${t.titulo}`,
          corpo: "Transforme os combinados do alinhamento em demandas para ninguém esquecer.",
          link: `/agencia?registrar=${t.id}`,
        }, [t.created_by ?? t.assigned_to]);
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
      const daCarteira = dados.carteira.filter(a => a.client_id === c.id).map(a => a.user_id);
      const quemRecebe = daCarteira.length ? daCarteira : gestores(dados, metas.config.destinatarios);
      for (const u of unicos(quemRecebe)) {
        avisos.push({
          chave: "metas",
          ref: `${c.id}|${periodo}`,
          user_id: u,
          whatsapp: metas.whatsapp,
          titulo: `${c.name} fora da meta`,
          corpo: `${problemas.join("; ")}. ${sugestao}`,
          link: `/clients/${c.id}`,
        });
      }
    }
  }

  const resumo = cfg("resumo_diario");
  if (resumo.ativa && minuto >= (Number(resumo.config.hora) || 8) * 60) {
    for (const p of dados.pessoas) {
      const minhas = abertas.filter(t => t.assigned_to === p.id);
      const vencemHoje = minhas.filter(t => t.prazo === hoje).length;
      const atrasadas = minhas.filter(t => estaAtrasada(t, hoje, minuto)).length;
      const revisar = abertas.filter(t => t.created_by === p.id && t.assigned_to !== p.id && t.status === "revisao").length;
      if (!vencemHoje && !atrasadas && !revisar) continue;
      const partes = [
        vencemHoje && `${vencemHoje} vence${vencemHoje === 1 ? "" : "m"} hoje`,
        atrasadas && `${atrasadas} atrasada${atrasadas === 1 ? "" : "s"}`,
        revisar && `${revisar} esperando sua revisão`,
        `${minhas.length} aberta${minhas.length === 1 ? "" : "s"} com você`,
      ].filter(Boolean);
      avisos.push({
        chave: "resumo_diario",
        ref: hoje,
        user_id: p.id,
        whatsapp: resumo.whatsapp,
        titulo: "Seu dia",
        corpo: partes.join(" · "),
        link: "/demandas",
      });
    }
    if (resumo.config.resumo_gestao) {
      const atrasadas = abertas.filter(t => estaAtrasada(t, hoje, minuto));
      const ontem = somarDias(hoje, -1);
      const entregues = dados.tarefas.filter(t => t.concluida_at && t.concluida_at.slice(0, 10) === ontem).length;
      const semDono = abertas.filter(t => !t.assigned_to).length;
      const corpo = [
        `${abertas.length} demandas abertas`,
        `${atrasadas.length} atrasada${atrasadas.length === 1 ? "" : "s"}`,
        `${abertas.filter(t => t.prazo === hoje).length} vencem hoje`,
        `${entregues} concluída${entregues === 1 ? "" : "s"} ontem`,
        semDono ? `${semDono} sem responsável` : null,
      ].filter(Boolean).join(" · ");
      for (const g of gestores(dados, resumo.config.destinatarios)) {
        avisos.push({ chave: "resumo_diario", ref: `${hoje}|gestao`, user_id: g, whatsapp: resumo.whatsapp, titulo: "Resumo da operação", corpo, link: "/agencia" });
      }
    }
  }

  const entrada = cfg("onboarding");
  if (entrada.ativa) {
    const responsaveisPadrao = (entrada.config.responsaveis ?? {}) as Record<string, string | null>;
    const prazos = (entrada.config.prazos ?? {}) as Record<string, number>;
    const quemRecebe = gestores(dados, undefined);
    for (const c of dados.clientes) {
      if (c.status !== "active" || diasDesde(c.created_at, agoraMs) > 30) continue;
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
        for (const g of quemRecebe) {
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
