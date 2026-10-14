import { describe, expect, it } from "vitest";
import type { CampanhaEntrada } from "./analise-campanhas";
import { atencaoDoCliente, melhorCampanha, montarPainel, rankingDeCampanhas } from "./painel-clientes";

function camp(p: Partial<CampanhaEntrada>): CampanhaEntrada {
  return {
    id: Math.random().toString(36).slice(2), client_id: "c1", name: "x", status: "ACTIVE", objective: null,
    spend: 0, impressions: 1000, clicks: 10, ctr: 1, cpc: 1, cpm: 10, conversions: 0, messages: 0, ...p,
  };
}

describe("melhorCampanha", () => {
  it("prefere resultado de negocio a clique, mesmo com clique mais barato", () => {
    const m = melhorCampanha([
      camp({ id: "t", objective: "OUTCOME_TRAFFIC", spend: 100, clicks: 400 }),
      camp({ id: "m", objective: "OUTCOME_ENGAGEMENT", spend: 200, messages: 20 }),
    ]);
    expect(m?.id).toBe("m");
    expect(m?.objetivo).toBe("Mensagens");
    expect(m?.custo).toBe(10);
  });

  it("no mesmo objetivo, menor custo por resultado vence", () => {
    const m = melhorCampanha([
      camp({ id: "a", objective: "OUTCOME_ENGAGEMENT", spend: 300, messages: 20 }),
      camp({ id: "b", objective: "OUTCOME_ENGAGEMENT", spend: 100, messages: 20 }),
    ]);
    expect(m?.id).toBe("b");
  });

  it("campanha com gasto irrisorio nao rouba o posto", () => {
    const m = melhorCampanha([
      camp({ id: "grande", objective: "OUTCOME_ENGAGEMENT", spend: 500, messages: 50 }),
      camp({ id: "trocado", objective: "OUTCOME_ENGAGEMENT", spend: 5, messages: 2 }),
    ]);
    expect(m?.id).toBe("grande");
  });

  it("sem resultado nenhum nao ha melhor", () => {
    expect(melhorCampanha([camp({ spend: 100, clicks: 0, messages: 0 })])).toBeNull();
    expect(melhorCampanha([])).toBeNull();
  });

  it("ranking poe a melhor primeiro e esconde as sem gasto", () => {
    const r = rankingDeCampanhas([
      camp({ id: "cara", objective: "OUTCOME_ENGAGEMENT", spend: 900, messages: 30 }),
      camp({ id: "boa", objective: "OUTCOME_ENGAGEMENT", spend: 100, messages: 30 }),
      camp({ id: "parada", spend: 0 }),
    ]);
    expect(r.map(x => x.c.id)).toEqual(["boa", "cara"]);
    expect(r[0].melhor).toBe(true);
  });
});

describe("atencaoDoCliente", () => {
  const base = {
    cliente: { id: "c1", name: "A", alvo_custo_resultado: null },
    investido: 100, resultados: 10, custoPorResultado: 10,
    investidoAntes: 100, resultadosAntes: 10, custoAntes: 10, melhor: null,
  };

  it("tudo normal nao gera alerta", () => {
    expect(atencaoDoCliente(base)).toEqual([]);
  });
  it("investindo sem resultado e grave", () => {
    expect(atencaoDoCliente({ ...base, resultados: 0, custoPorResultado: null })[0]).toMatchObject({ gravidade: "alta" });
  });
  it("parou de veicular so acusa se veiculava antes", () => {
    expect(atencaoDoCliente({ ...base, investido: 0, resultados: 0, custoPorResultado: null })[0].texto).toBe("Parou de veicular");
    expect(atencaoDoCliente({ ...base, investido: 0, investidoAntes: 0, resultados: 0, custoPorResultado: null })).toEqual([]);
  });
  it("custo acima da meta e alta de custo", () => {
    const itens = atencaoDoCliente({ ...base, cliente: { ...base.cliente, alvo_custo_resultado: 10 }, custoPorResultado: 14 });
    expect(itens.map(i => i.texto)).toEqual(["Custo acima da meta", "Custo subiu 40%"]);
  });
  it("queda de resultados", () => {
    expect(atencaoDoCliente({ ...base, resultados: 6, custoPorResultado: 100 / 6 }).map(i => i.texto)).toContain("Resultados caíram 40%");
  });
});

describe("montarPainel", () => {
  it("separa periodo atual do anterior e ordena quem precisa de atencao primeiro", () => {
    const linhas = montarPainel(
      [{ id: "ok", name: "Ok" }, { id: "ruim", name: "Ruim" }],
      [
        { client_id: "ok", date: "2026-10-10", spend: 100, messages: 10 },
        { client_id: "ok", date: "2026-10-01", spend: 100, messages: 10 },
        { client_id: "ruim", date: "2026-10-10", spend: 50, messages: 0 },
      ],
      [],
      "2026-10-08",
    );
    expect(linhas.map(l => l.cliente.id)).toEqual(["ruim", "ok"]);
    const ok = linhas[1];
    expect(ok).toMatchObject({ investido: 100, resultados: 10, custoPorResultado: 10, investidoAntes: 100, resultadosAntes: 10 });
  });
});
