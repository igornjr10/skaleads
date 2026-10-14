import { describe, expect, it } from "vitest";
import {
  type ChaveAutomacao, type DadosOperacao, type Tarefa,
  PADROES, avisosDevidos, configDe, estaAtrasada, normalizarConfig, rotinasDoDia, semanaDe,
} from "../../supabase/functions/_shared/automacoes.ts";
import { PADROES_AUTOMACAO, configEfetiva } from "./automacoes";

const AGORA = Date.parse("2026-10-12T13:00:00Z"); // 10:00 em Sao Paulo

function tarefa(p: Partial<Tarefa>): Tarefa {
  return {
    id: "t1", titulo: "Carrossel", status: "a_fazer", categoria: "outro", prazo: null, prazo_hora: null,
    assigned_to: "ana", created_by: "bia", client_id: null, updated_at: "2026-10-12T12:00:00Z",
    concluida_at: null, created_at: "2026-10-01T12:00:00Z", aguardando_cliente: false, onboarding_fase: null,
    ...p,
  };
}

function dados(p: Partial<DadosOperacao> = {}): DadosOperacao {
  return {
    hoje: "2026-10-12", minuto: 600, agoraMs: AGORA, tarefas: [], clientes: [],
    pessoas: [{ id: "ana", nome: "Ana", admin: false }, { id: "bia", nome: "Bia", admin: false }, { id: "adm", nome: "Adm", admin: true }],
    carteira: [], metricas: [], faseResponsaveis: [],
    ...p,
  };
}

const so = (...chaves: ChaveAutomacao[]) => (c: ChaveAutomacao) =>
  chaves.includes(c) ? PADROES[c] : { ...PADROES[c], ativa: false };

/** So `chave` ligada, com a config gravada `config` por cima do padrao. */
const com = (chave: ChaveAutomacao, config: Record<string, unknown>) => (c: ChaveAutomacao) =>
  c === chave ? normalizarConfig(c, { ativa: true, config: { ...PADROES[c].config, ...config } }) : { ...PADROES[c], ativa: false };

const rotina = (p: Record<string, unknown> = {}) => ({
  id: "r1", titulo: "Checar orçamento", assigned_to: "ana", client_id: null, horario_limite: "09:00:00",
  periodicidade: "diaria", dias_semana: null, dia_mes: null, data_pontual: null, ...p,
});

describe("avisosDevidos", () => {
  it("avisa duas horas antes do horario do prazo, uma vez por horario", () => {
    const t = tarefa({ prazo: "2026-10-12", prazo_hora: "11:30:00" });
    const avisos = avisosDevidos(dados({ tarefas: [t] }), so("prazo_proximo"));
    expect(avisos.map(a => a.ref)).toEqual(["t1|2026-10-12|dia", "t1|2026-10-12|11:30:00|antes"]);
    expect(avisos.every(a => a.user_id === "ana")).toBe(true);
  });

  it("nao avisa antes da antecedencia configurada", () => {
    const t = tarefa({ prazo: "2026-10-12", prazo_hora: "15:00:00" });
    const refs = avisosDevidos(dados({ tarefas: [t] }), so("prazo_proximo")).map(a => a.ref);
    expect(refs).not.toContain("t1|2026-10-12|15:00:00|antes");
  });

  it("atrasada avisa responsavel e quem pediu, sem repetir a mesma pessoa", () => {
    const t = tarefa({ prazo: "2026-10-10" });
    const avisos = avisosDevidos(dados({ tarefas: [t] }), so("atrasadas"));
    expect(avisos.map(a => a.user_id).sort()).toEqual(["ana", "bia"]);
    const propria = tarefa({ prazo: "2026-10-10", created_by: "ana" });
    expect(avisosDevidos(dados({ tarefas: [propria] }), so("atrasadas"))).toHaveLength(1);
  });

  it("prazo de hoje com hora passada ja conta como atrasada", () => {
    expect(estaAtrasada(tarefa({ prazo: "2026-10-12", prazo_hora: "09:00:00" }), "2026-10-12", 600)).toBe(true);
    expect(estaAtrasada(tarefa({ prazo: "2026-10-12" }), "2026-10-12", 600)).toBe(false);
  });

  it("criativo perto do prazo e ainda nao entregue avisa quem pediu", () => {
    const t = tarefa({ categoria: "criativo", prazo: "2026-10-13", status: "fazendo" });
    const entregue = tarefa({ id: "t2", categoria: "criativo", prazo: "2026-10-13", status: "revisao" });
    const avisos = avisosDevidos(dados({ tarefas: [t, entregue] }), so("criativos_pendentes"));
    expect(avisos).toHaveLength(1);
    expect(avisos[0].user_id).toBe("bia");
  });

  it("demanda parada vai para o responsavel; em revisao, para quem pediu", () => {
    const parada = tarefa({ updated_at: "2026-10-08T12:00:00Z" });
    const revisao = tarefa({ id: "t2", status: "revisao", updated_at: "2026-10-08T12:00:00Z" });
    const avisos = avisosDevidos(dados({ tarefas: [parada, revisao] }), so("parada"));
    expect(avisos.map(a => [a.ref.split("|")[0], a.user_id])).toEqual([["t1", "ana"], ["t2", "bia"]]);
  });

  it("aguardando o cliente nao conta como parada, conta como material pendente", () => {
    const t = tarefa({ aguardando_cliente: true, updated_at: "2026-10-08T12:00:00Z" });
    expect(avisosDevidos(dados({ tarefas: [t] }), so("parada"))).toHaveLength(0);
    expect(avisosDevidos(dados({ tarefas: [t] }), so("aguardando_cliente")).map(a => a.user_id).sort()).toEqual(["ana", "bia"]);
  });

  it("sobrecarga avisa os ADMs quando passa do limite", () => {
    const tarefas = Array.from({ length: 13 }, (_, i) => tarefa({ id: `t${i}` }));
    const avisos = avisosDevidos(dados({ tarefas }), so("sobrecarga"));
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ user_id: "adm", ref: "ana|2026-10-12" });
  });

  it("lembra a reuniao antes do horario e pede o registro depois de feita", () => {
    const hoje = tarefa({ categoria: "reuniao", prazo: "2026-10-12", prazo_hora: "10:30:00" });
    const feita = tarefa({ id: "t2", categoria: "reuniao", status: "concluida", concluida_at: "2026-10-12T11:00:00Z" });
    const avisos = avisosDevidos(dados({ tarefas: [hoje, feita] }), so("reunioes"));
    expect(avisos.filter(a => a.ref === "t1|2026-10-12|10:30:00").map(a => a.user_id).sort()).toEqual(["ana", "bia"]);
    expect(avisos.find(a => a.ref === "t2|registro")?.link).toBe("/agencia?registrar=t2");
  });

  it("cliente fora da meta avisa a carteira uma vez por semana", () => {
    const cliente = { id: "c1", name: "Loja", status: "active", created_at: "2026-01-01T00:00:00Z", alvo_resultados_mes: 300, alvo_custo_resultado: null };
    const metricas = Array.from({ length: 12 }, (_, i) => ({ client_id: "c1", date: `2026-10-${String(i + 1).padStart(2, "0")}`, spend: 50, messages: 2 }));
    const avisos = avisosDevidos(dados({ clientes: [cliente], metricas, carteira: [{ client_id: "c1", user_id: "ana" }] }), so("metas"));
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ user_id: "ana", ref: `c1|${semanaDe("2026-10-12")}` });
  });

  it("resumo diario so sai depois da hora e para quem tem o que fazer", () => {
    const t = tarefa({ prazo: "2026-10-12" });
    expect(avisosDevidos(dados({ tarefas: [t], minuto: 7 * 60 }), so("resumo_diario"))).toHaveLength(0);
    const avisos = avisosDevidos(dados({ tarefas: [t] }), so("resumo_diario"));
    expect(avisos.map(a => `${a.user_id}:${a.ref}`)).toEqual(["ana:2026-10-12", "adm:2026-10-12|gestao"]);
  });

  it("entrada de cliente propoe responsaveis e prazos e espera aprovacao", () => {
    const cliente = { id: "c1", name: "Loja", status: "active", created_at: "2026-10-10T12:00:00Z", alvo_resultados_mes: null, alvo_custo_resultado: null };
    const etapa = tarefa({ client_id: "c1", onboarding_fase: "acessos" });
    const cfg = (c: ChaveAutomacao) => c === "onboarding"
      ? configDe([{ chave: "onboarding", ativa: true, whatsapp: false, config: { responsaveis: { acessos: "ana", operacao: "bia" } } }], c)
      : { ...PADROES[c], ativa: false };
    const avisos = avisosDevidos(dados({ clientes: [cliente], tarefas: [etapa], faseResponsaveis: [{ client_id: "c1", fase: "acessos" }] }), cfg);
    const proposta = avisos.find(a => a.user_id === null)!;
    expect(proposta.exigeAprovacao).toBe(true);
    expect(proposta.acao).toEqual({
      responsaveis: [{ client_id: "c1", fase: "operacao", responsavel_id: "bia" }],
      prazos: [{ task_id: "t1", prazo: "2026-10-12" }],
    });
    expect(avisos.filter(a => a.user_id === "adm")).toHaveLength(1);
  });

  it("automacao desligada nao gera nada", () => {
    const t = tarefa({ prazo: "2026-10-01" });
    expect(avisosDevidos(dados({ tarefas: [t] }), so())).toHaveLength(0);
  });

  it("cada destino escolhe o proprio canal; quem esta em dois papeis fica com o mais forte", () => {
    const t = tarefa({ prazo: "2026-10-10" });
    const cfg = com("atrasadas", { destinos: { responsavel: "whatsapp", solicitante: "sino", adm: "sino" } });
    const avisos = avisosDevidos(dados({ tarefas: [t] }), cfg);
    expect(avisos.map(a => [a.user_id, a.whatsapp])).toEqual([["ana", true], ["bia", false], ["adm", false]]);
    const dono = tarefa({ prazo: "2026-10-10", assigned_to: "bia" });
    expect(avisosDevidos(dados({ tarefas: [dono] }), cfg).find(a => a.user_id === "bia")?.whatsapp).toBe(true);
  });

  it("outras pessoas recebem no canal escolhido para elas", () => {
    const t = tarefa({ prazo: "2026-10-10" });
    const cfg = com("atrasadas", { destinos: { responsavel: "nao", solicitante: "nao" }, copiar_para: ["adm"], copiar_canal: "whatsapp" });
    expect(avisosDevidos(dados({ tarefas: [t] }), cfg).map(a => [a.user_id, a.whatsapp])).toEqual([["adm", true]]);
  });

  it("gestor do cliente recebe; cliente sem carteira cai nos ADMs", () => {
    const t = tarefa({ prazo: "2026-10-10", client_id: "c1" });
    const cfg = com("atrasadas", { destinos: { responsavel: "nao", solicitante: "nao", gestor: "sino" } });
    expect(avisosDevidos(dados({ tarefas: [t], carteira: [{ client_id: "c1", user_id: "bia" }] }), cfg).map(a => a.user_id)).toEqual(["bia"]);
    expect(avisosDevidos(dados({ tarefas: [t] }), cfg).map(a => a.user_id)).toEqual(["adm"]);
  });

  it("atrasada cobra de novo a cada intervalo, com ref nova", () => {
    const t = tarefa({ prazo: "2026-10-12", prazo_hora: "06:00:00" });
    const refs = avisosDevidos(dados({ tarefas: [t] }), com("atrasadas", { repetir_horas: 2 })).map(a => a.ref);
    expect(new Set(refs)).toEqual(new Set(["t1|2026-10-12|2"]));
    const umaVez = avisosDevidos(dados({ tarefas: [t] }), so("atrasadas")).map(a => a.ref);
    expect(new Set(umaVez)).toEqual(new Set(["t1|2026-10-12"]));
  });

  it("parada aceita limite em horas", () => {
    const t = tarefa({ updated_at: "2026-10-12T08:00:00Z" });
    expect(avisosDevidos(dados({ tarefas: [t] }), com("parada", { horas: 4 }))).toHaveLength(1);
    expect(avisosDevidos(dados({ tarefas: [t] }), com("parada", { horas: 6 }))).toHaveLength(0);
  });

  it("criativo com horario conta a antecedencia em horas", () => {
    const t = tarefa({ categoria: "video", prazo: "2026-10-12", prazo_hora: "14:00:00" });
    expect(avisosDevidos(dados({ tarefas: [t] }), com("criativos_pendentes", { antecedencia_horas: 3 }))).toHaveLength(0);
    expect(avisosDevidos(dados({ tarefas: [t] }), com("criativos_pendentes", { antecedencia_horas: 4 }))).toHaveLength(1);
  });

  it("aviso de prazo em horas atravessa o dia", () => {
    const t = tarefa({ prazo: "2026-10-13", prazo_hora: "09:00:00" });
    const refs = avisosDevidos(dados({ tarefas: [t] }), com("prazo_proximo", { antecedencia_horas: 24 })).map(a => a.ref);
    expect(refs).toContain("t1|2026-10-13|09:00:00|antes");
  });

  it("demanda programada para depois de hoje nao gera aviso", () => {
    const t = tarefa({ prazo: "2026-10-10", inicia_em: "2026-10-15" });
    expect(avisosDevidos(dados({ tarefas: [t] }), so("atrasadas", "parada", "prazo_proximo"))).toHaveLength(0);
  });

  it("nova demanda vai so no WhatsApp, para responsavel e corresponsaveis, sem avisar quem criou", () => {
    const t = tarefa({ created_at: "2026-10-12T12:30:00Z", liberada_em: "2026-10-12T12:30:00Z", corresponsaveis: ["adm", "bia"] });
    const avisos = avisosDevidos(dados({ tarefas: [t] }), com("nova_demanda", {}));
    expect(avisos.map(a => a.user_id).sort()).toEqual(["adm", "ana"]);
    expect(avisos.every(a => a.whatsapp && a.semSino)).toBe(true);
    const antiga = tarefa({ liberada_em: "2026-10-10T12:00:00Z" });
    expect(avisosDevidos(dados({ tarefas: [antiga] }), com("nova_demanda", {}))).toHaveLength(0);
  });

  it("rotina sem baixa depois do limite cobra o responsavel com a fila dele", () => {
    const d = dados({ tarefas: [tarefa({})], rotinas: [rotina()], execucoesRotina: [] });
    const avisos = avisosDevidos(d, so("rotina_atrasada"));
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ user_id: "ana", ref: "r1|2026-10-12" });
    expect(avisos[0].corpo).toContain("1 demanda aberta");
    const feita = dados({ rotinas: [rotina()], execucoesRotina: [{ rotina_id: "r1", data_ref: "2026-10-12", done: true, status: "concluida", mover_para: null }] });
    expect(avisosDevidos(feita, so("rotina_atrasada"))).toHaveLength(0);
    expect(avisosDevidos(d, com("rotina_atrasada", { tolerancia_horas: 2 }))).toHaveLength(0);
  });

  it("rotina remanejada sai do dia de origem e entra no destino", () => {
    const d = dados({ rotinas: [rotina()], execucoesRotina: [{ rotina_id: "r1", data_ref: "2026-10-11", done: false, status: "pendente", mover_para: "2026-10-12" }] });
    expect(rotinasDoDia(d, "2026-10-12").map(o => o.data_ref).sort()).toEqual(["2026-10-11", "2026-10-12"]);
    expect(rotinasDoDia(d, "2026-10-11")).toHaveLength(0);
  });

  it("resumo e sobrecarga trazem a rotina do dia", () => {
    const d = dados({ rotinas: [rotina({ horario_limite: "16:00:00" })], execucoesRotina: [] });
    const seuDia = avisosDevidos(d, so("resumo_diario")).find(a => a.user_id === "ana");
    expect(seuDia?.corpo).toContain("1 rotina hoje");
    const tarefas = Array.from({ length: 13 }, (_, i) => tarefa({ id: `t${i}` }));
    const carga = avisosDevidos({ ...d, tarefas }, so("sobrecarga"))[0];
    expect(carga.corpo).toContain("1 rotina pendente hoje");
  });
});

describe("config gravada antes de quem recebe", () => {
  it("WhatsApp ligado vira WhatsApp em todo destino que recebia", () => {
    const c = normalizarConfig("atrasadas", { ativa: true, whatsapp: true, config: { avisar_solicitante: false, copiar_para: [] } });
    expect(c.config.destinos).toMatchObject({ responsavel: "whatsapp", solicitante: "nao", gestor: "nao" });
    expect(c.whatsapp).toBe(true);
  });

  it("prazo em dias vira horas", () => {
    expect(normalizarConfig("parada", { ativa: true, config: { dias: 5 } }).config.horas).toBe(120);
    expect(normalizarConfig("criativos_pendentes", { ativa: true, config: { dias_antes: 2 } }).config.antecedencia_horas).toBe(48);
  });

  it("destinatarios antigos viram outras pessoas no lugar dos ADMs", () => {
    const c = normalizarConfig("sobrecarga", { ativa: true, config: { destinatarios: ["ana"] } });
    expect(c.config.copiar_para).toEqual(["ana"]);
    expect((c.config.destinos as Record<string, string>).adm).toBe("nao");
  });

  it("front e servidor normalizam igual", () => {
    const linhas = [
      { ativa: true, whatsapp: true, config: { avisar_solicitante: false } },
      { ativa: false, whatsapp: false, config: { dias: 4, dias_antes: 1, destinatarios: ["x"], resumo_gestao: false } },
      { ativa: true, whatsapp: false, config: { destinos: { responsavel: "whatsapp" }, copiar_para: ["y"], copiar_canal: "whatsapp" } },
    ];
    for (const chave of Object.keys(PADROES) as ChaveAutomacao[]) {
      for (const l of linhas) expect(configEfetiva(l, chave)).toEqual(normalizarConfig(chave, l));
    }
  });
});

describe("catalogo da Central", () => {
  it("anda junto com os padroes do servidor", () => {
    expect(PADROES_AUTOMACAO).toEqual(PADROES);
  });
});
