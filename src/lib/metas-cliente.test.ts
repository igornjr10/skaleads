import { describe, expect, it } from "vitest";
import { METAS_VAZIAS, compararMetas, temAlgumaMeta } from "./metas-cliente";

const real = { gasto: 720, mensagens: 100, visitasPerfil: 300, cliques: 400, faturamento: null };

describe("compararMetas", () => {
  it("exemplo da especificação: meta R$ 5, atual R$ 7,20 → 44% acima", () => {
    const [c] = compararMetas({ ...METAS_VAZIAS, alvo_custo_mensagem: 5 }, real, 15, 30);
    expect(c.atual).toBeCloseTo(7.2);
    expect(Math.round(c.desvioPct!)).toBe(44);
    expect(c.status).toBe("fora");
    expect(c.resumo).toBe("44% acima da meta");
    expect(c.sugestoes.length).toBeGreaterThan(0);
  });

  it("custo abaixo da meta fica ok, sem sugestões", () => {
    const [c] = compararMetas({ ...METAS_VAZIAS, alvo_custo_mensagem: 10 }, real, 15, 30);
    expect(c.status).toBe("ok");
    expect(c.sugestoes).toEqual([]);
  });

  it("até 10% acima é atenção", () => {
    const [c] = compararMetas({ ...METAS_VAZIAS, alvo_custo_mensagem: 6.8 }, real, 15, 30);
    expect(c.status).toBe("atencao");
  });

  it("volume projeta para o fim do mês", () => {
    const [c] = compararMetas({ ...METAS_VAZIAS, alvo_mensagens_mes: 300 }, real, 15, 30);
    expect(c.atual).toBe(200);
    expect(c.projetado).toBe(true);
    expect(c.status).toBe("fora");
    expect(c.resumo).toBe("Projeção 33% abaixo da meta");
  });

  it("volume nos primeiros dias é cedo para julgar", () => {
    const [c] = compararMetas({ ...METAS_VAZIAS, alvo_mensagens_mes: 300 }, real, 3, 30);
    expect(c.status).toBe("cedo");
  });

  it("ROAS e faturamento pedem faturamento informado", () => {
    const lista = compararMetas({ ...METAS_VAZIAS, alvo_roas: 4, alvo_faturamento_mes: 10000 }, real, 15, 30);
    expect(lista.every(c => c.status === "sem_dado")).toBe(true);
    const [roas] = compararMetas({ ...METAS_VAZIAS, alvo_roas: 4 }, { ...real, faturamento: 3600 }, 15, 30);
    expect(roas.atual).toBe(5);
    expect(roas.status).toBe("ok");
  });

  it("limite de investimento compara a projeção de gasto", () => {
    const [c] = compararMetas({ ...METAS_VAZIAS, limite_investimento_mes: 1200 }, real, 15, 30);
    expect(c.atual).toBe(1440);
    expect(c.status).toBe("fora");
    expect(c.resumo).toContain("20% acima do limite");
  });

  it("sem nenhuma mensagem e gasto alto acusa", () => {
    const [c] = compararMetas({ ...METAS_VAZIAS, alvo_custo_mensagem: 5 }, { ...real, mensagens: 0 }, 15, 30);
    expect(c.status).toBe("fora");
    expect(c.atual).toBeNull();
  });

  it("metas vazias não geram linhas", () => {
    expect(compararMetas(METAS_VAZIAS, real, 15, 30)).toEqual([]);
    expect(temAlgumaMeta(METAS_VAZIAS)).toBe(false);
    expect(temAlgumaMeta({ ...METAS_VAZIAS, alvo_cpc: 1 })).toBe(true);
  });
});
