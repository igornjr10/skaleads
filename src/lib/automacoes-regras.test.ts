import { describe, expect, it } from "vitest";
import {
  type ChaveAutomacao, type DadosOperacao, type Tarefa,
  PADROES, avisosDevidos, configDe, estaAtrasada, semanaDe,
} from "../../supabase/functions/_shared/automacoes.ts";
import { PADROES_AUTOMACAO } from "./automacoes";

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
});

describe("catalogo da Central", () => {
  it("anda junto com os padroes do servidor", () => {
    expect(PADROES_AUTOMACAO).toEqual(PADROES);
  });
});
