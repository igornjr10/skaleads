import { describe, expect, it } from "vitest";
import { eCampanhaDeMensagem, evolucaoSemanal, resumirCustoMensagem, segundaDaSemana } from "./custo-mensagem";

describe("eCampanhaDeMensagem", () => {
  it("conta campanha que gerou mensagem ou tem objetivo de mensagem", () => {
    expect(eCampanhaDeMensagem({ objective: "OUTCOME_ENGAGEMENT", messages: 10 })).toBe(true);
    expect(eCampanhaDeMensagem({ objective: "MESSAGES", messages: 0 })).toBe(true);
  });
  it("reconhecimento e engajamento sem conversa ficam fora", () => {
    expect(eCampanhaDeMensagem({ objective: "OUTCOME_AWARENESS", messages: 3 })).toBe(false);
    expect(eCampanhaDeMensagem({ objective: "OUTCOME_ENGAGEMENT", messages: 0 })).toBe(false);
  });
});

describe("resumirCustoMensagem", () => {
  const clientes = [
    { id: "a", name: "Alfa", alvo_custo_mensagem: 5 },
    { id: "b", name: "Beta", alvo_custo_mensagem: null },
  ];
  const campanhas = [
    { client_id: "a", objective: "OUTCOME_ENGAGEMENT", spend: 600, messages: 100 },
    { client_id: "a", objective: "OUTCOME_AWARENESS", spend: 400, messages: 0 },
    { client_id: "b", objective: "MESSAGES", spend: 300, messages: 100 },
  ];

  it("média geral = investimento das campanhas de mensagem ÷ mensagens", () => {
    const r = resumirCustoMensagem(campanhas, clientes);
    expect(r.investimento).toBe(900);
    expect(r.mensagens).toBe(200);
    expect(r.custoMedio).toBe(4.5);
    expect(r.mediaPorCliente).toBe(4.5);
  });

  it("por cliente, com meta e fatia de mensagens", () => {
    const r = resumirCustoMensagem(campanhas, clientes);
    const alfa = r.clientes.find(c => c.clientId === "a")!;
    expect(alfa.custo).toBe(6);
    expect(alfa.desvioPct).toBeCloseTo(20);
    expect(alfa.fatiaMensagens).toBe(0.6);
    expect(r.acimaDaMeta).toBe(1);
    expect(r.semMeta).toBe(1);
    expect(r.clientes[0].clientId).toBe("a");
  });

  it("cliente fora da lista (sem acesso) não entra", () => {
    const r = resumirCustoMensagem([...campanhas, { client_id: "x", objective: "MESSAGES", spend: 50, messages: 1 }], clientes);
    expect(r.clientes.map(c => c.clientId).sort()).toEqual(["a", "b"]);
  });
});

describe("evolucaoSemanal", () => {
  it("agrupa por semana só os clientes da série", () => {
    expect(segundaDaSemana("2026-10-15")).toBe("2026-10-12");
    const pontos = evolucaoSemanal([
      { client_id: "a", date: "2026-10-12", spend: 50, messages: 10 },
      { client_id: "a", date: "2026-10-18", spend: 50, messages: 10 },
      { client_id: "a", date: "2026-10-19", spend: 30, messages: 0 },
      { client_id: "z", date: "2026-10-12", spend: 999, messages: 1 },
    ], new Set(["a"]));
    expect(pontos).toEqual([
      { semana: "2026-10-12", investimento: 100, mensagens: 20, custo: 5 },
      { semana: "2026-10-19", investimento: 30, mensagens: 0, custo: null },
    ]);
  });
});
