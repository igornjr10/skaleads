import { describe, expect, it } from "vitest";
import {
  alcanceEstimado,
  analisarCampanhas,
  avaliarSaturacao,
  classificarObjetivo,
  compararSemanas,
  KPIS_POR_GRUPO,
  mediana,
  montarCarteira,
  referenciaPara,
  resultadoDaCampanha,
  resumirCliente,
  severidadeDaCampanha,
  type CampanhaEntrada,
  type DiaAnuncio,
} from "./analise-campanhas";

function camp(p: Partial<CampanhaEntrada> & { id: string }): CampanhaEntrada {
  return {
    client_id: "c1", name: p.id, status: "ACTIVE", objective: "OUTCOME_ENGAGEMENT",
    spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, conversions: 0, messages: 0,
    ...p,
  };
}

describe("classificarObjetivo", () => {
  it("engajamento com mensagens vira mensagens", () => {
    expect(classificarObjetivo("OUTCOME_ENGAGEMENT", 10)).toBe("mensagens");
    expect(classificarObjetivo("MESSAGES", 0)).toBe("mensagens");
  });
  it("engajamento sem mensagens fica em outros", () => {
    expect(classificarObjetivo("OUTCOME_ENGAGEMENT", 0)).toBe("outros");
  });
  it("reconhecimento nunca vira mensagens", () => {
    expect(classificarObjetivo("OUTCOME_AWARENESS", 5)).toBe("reconhecimento");
    expect(classificarObjetivo("REACH")).toBe("reconhecimento");
    expect(classificarObjetivo("BRAND_AWARENESS")).toBe("reconhecimento");
  });
  it("trafego e conversoes", () => {
    expect(classificarObjetivo("OUTCOME_TRAFFIC")).toBe("trafego");
    expect(classificarObjetivo("LINK_CLICKS")).toBe("trafego");
    expect(classificarObjetivo("OUTCOME_LEADS", 0, 3)).toBe("conversoes");
    expect(classificarObjetivo("OUTCOME_SALES")).toBe("conversoes");
    expect(classificarObjetivo("CONVERSIONS")).toBe("conversoes");
  });
  it("lead que puxa mais conversa que cadastro e lido como mensagens", () => {
    expect(classificarObjetivo("OUTCOME_LEADS", 20, 2)).toBe("mensagens");
  });
  it("trafego para o WhatsApp e mensagens", () => {
    expect(classificarObjetivo("OUTCOME_TRAFFIC", 8)).toBe("mensagens");
  });
  it("objetivo vazio cai em outros", () => {
    expect(classificarObjetivo(null)).toBe("outros");
  });
});

describe("KPIs por objetivo", () => {
  it("reconhecimento nao mostra custo por mensagem nem CPC", () => {
    expect(KPIS_POR_GRUPO.reconhecimento).not.toContain("custo_mensagem");
    expect(KPIS_POR_GRUPO.reconhecimento).not.toContain("cpc");
    expect(KPIS_POR_GRUPO.mensagens).toContain("custo_mensagem");
  });
  it("resultado da campanha segue o grupo", () => {
    const r = resultadoDaCampanha(camp({ id: "a", objective: "OUTCOME_TRAFFIC", spend: 100, clicks: 50, impressions: 5000 }));
    expect(r.grupo).toBe("trafego");
    expect(r.volume).toBe(50);
    expect(r.custo).toBe(2);
    expect(r.custoChave).toBe("cpc");
    const m = resultadoDaCampanha(camp({ id: "b", messages: 20, spend: 100 }));
    expect(m.custoChave).toBe("custo_mensagem");
    expect(m.custo).toBe(5);
  });
});

describe("referencias", () => {
  it("mediana", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });

  it("meta do cliente tem prioridade e nao e estimativa", () => {
    const carteira = montarCarteira([], []);
    const r = referenciaPara("custo_mensagem", "mensagens", { id: "c1", name: "X", alvo_custo_mensagem: 7 }, carteira);
    expect(r).toMatchObject({ valor: 7, origem: "meta", estimativa: false });
  });

  it("sem meta e sem carteira usa mercado do segmento, marcado como estimativa", () => {
    const r = referenciaPara("custo_mensagem", "mensagens", { id: "c1", name: "X", business_segment: "restaurante" }, montarCarteira([], []));
    expect(r.origem).toBe("mercado");
    expect(r.estimativa).toBe(true);
    expect(r.valor).toBe(5);
  });

  it("mediana da carteira so com amostra minima, separada por objetivo", () => {
    const campanhas = [
      camp({ id: "1", client_id: "a", spend: 100, messages: 10 }),
      camp({ id: "2", client_id: "b", spend: 100, messages: 20 }),
      camp({ id: "3", client_id: "c", spend: 100, messages: 5 }),
      camp({ id: "4", client_id: "a", objective: "OUTCOME_TRAFFIC", spend: 100, clicks: 10 }),
    ];
    const carteira = montarCarteira(campanhas, []);
    const r = referenciaPara("custo_mensagem", "mensagens", { id: "z", name: "Z" }, carteira);
    expect(r).toMatchObject({ valor: 10, origem: "carteira", estimativa: true });
    expect(referenciaPara("cpc", "trafego", { id: "z", name: "Z" }, carteira).origem).toBe("mercado");
  });

  it("mediana do segmento exige clientes distintos", () => {
    const clientes = ["a", "b", "c"].map(id => ({ id, name: id, business_segment: "clinica_saude" }));
    const campanhas = [
      camp({ id: "1", client_id: "a", spend: 100, messages: 4 }),
      camp({ id: "2", client_id: "b", spend: 100, messages: 5 }),
      camp({ id: "3", client_id: "c", spend: 100, messages: 10 }),
    ];
    const r = referenciaPara("custo_mensagem", "mensagens", clientes[0], montarCarteira(campanhas, clientes));
    expect(r.origem).toBe("segmento_carteira");
    expect(r.valor).toBe(20);

    const soUm = montarCarteira(campanhas.map(c => ({ ...c, client_id: "a" })), clientes);
    expect(referenciaPara("custo_mensagem", "mensagens", clientes[0], soUm).origem).toBe("carteira");
  });
});

describe("saturacao", () => {
  const hoje = "2026-10-12";
  function dias(ctrAnterior: number, ctrAtual: number): DiaAnuncio[] {
    const out: DiaAnuncio[] = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date(Date.UTC(2026, 9, 12 - i)).toISOString().slice(0, 10);
      const ctr = i <= 7 ? ctrAtual : ctrAnterior;
      out.push({ ad_id: "ad", date: d, impressions: 1000, clicks: Math.round(1000 * ctr / 100), spend: 10 });
    }
    return out;
  }

  it("compara a ultima semana com a anterior", () => {
    const s = compararSemanas(dias(2, 1), hoje);
    expect(s.ctrAnterior).toBeCloseTo(2);
    expect(s.ctrAtual).toBeCloseTo(1);
    expect(s.quedaCtrPct).toBeCloseTo(50);
    expect(s.impressoes).toBe(7000);
  });

  it("frequencia alta e CTR caindo = saturado", () => {
    const ad = { id: "ad", name: "Video", status: "ACTIVE", campaign_id: "x", frequency: 4.2 };
    expect(avaliarSaturacao(ad, compararSemanas(dias(2, 1), hoje))).toBe("severa");
    expect(avaliarSaturacao({ ...ad, frequency: 3.1 }, compararSemanas(dias(2, 1.5), hoje))).toBe("moderada");
  });

  it("frequencia baixa ou CTR estavel nao acusa", () => {
    const ad = { id: "ad", name: "Video", status: "ACTIVE", campaign_id: "x", frequency: 2 };
    expect(avaliarSaturacao(ad, compararSemanas(dias(2, 1), hoje))).toBeNull();
    expect(avaliarSaturacao({ ...ad, frequency: 5 }, compararSemanas(dias(2, 1.9), hoje))).toBeNull();
  });
});

describe("analisarCampanhas", () => {
  const hoje = "2026-10-12";
  const clientes = [{ id: "c1", name: "Pizzaria", business_segment: "restaurante", alvo_custo_mensagem: 5 }];

  it("custo por mensagem acima da meta", () => {
    const { achados } = analisarCampanhas({
      campanhas: [camp({ id: "m", spend: 300, messages: 30, impressions: 10000, clicks: 100 })],
      clientes, hoje,
    });
    expect(achados).toHaveLength(1);
    expect(achados[0]).toMatchObject({ tipo: "custo_alto", severidade: "critico" });
    expect(achados[0].referencia?.origem).toBe("meta");
  });

  it("gasto sem conversa", () => {
    const { achados } = analisarCampanhas({
      campanhas: [camp({ id: "m", objective: "MESSAGES", spend: 300, messages: 0 })],
      clientes, hoje,
    });
    expect(achados[0]).toMatchObject({ tipo: "gasto_sem_resultado", severidade: "critico" });
  });

  it("campanha barata com volume vira oportunidade", () => {
    const { achados } = analisarCampanhas({
      campanhas: [camp({ id: "m", spend: 200, messages: 80 })],
      clientes, hoje,
    });
    expect(achados[0]).toMatchObject({ tipo: "escalar", severidade: "oportunidade" });
  });

  it("reconhecimento nao e cobrado por CTR nem conversa", () => {
    const { achados } = analisarCampanhas({
      campanhas: [camp({ id: "r", objective: "OUTCOME_AWARENESS", spend: 500, impressions: 40000, clicks: 20, reach: 30000 })],
      clientes, hoje,
    });
    expect(achados.find(a => a.tipo === "ctr_baixo" || a.tipo === "gasto_sem_resultado")).toBeUndefined();
  });

  it("reconhecimento com frequencia alta acusa publico saturado", () => {
    const { achados } = analisarCampanhas({
      campanhas: [camp({ id: "r", objective: "REACH", spend: 200, impressions: 20000, reach: 3000 })],
      clientes, hoje,
    });
    expect(achados.find(a => a.tipo === "frequencia_alta")?.severidade).toBe("critico");
  });

  it("trafego com CTR baixo e CPC alto", () => {
    const { achados } = analisarCampanhas({
      campanhas: [camp({ id: "t", objective: "OUTCOME_TRAFFIC", spend: 300, impressions: 20000, clicks: 60 })],
      clientes, hoje,
    });
    const tipos = achados.map(a => a.tipo);
    expect(tipos).toContain("ctr_baixo");
    expect(tipos).toContain("custo_alto");
    expect(achados.every(a => a.referencia?.estimativa !== false)).toBe(true);
  });

  it("campanha pausada ou com pouco gasto nao e julgada", () => {
    const { achados } = analisarCampanhas({
      campanhas: [
        camp({ id: "p", status: "PAUSED", spend: 900, messages: 0, objective: "MESSAGES" }),
        camp({ id: "q", spend: 20, messages: 1 }),
      ],
      clientes, hoje,
    });
    expect(achados).toHaveLength(0);
  });

  it("criativo saturado aparece ligado ao anuncio", () => {
    const diasAnuncios: DiaAnuncio[] = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date(Date.UTC(2026, 9, 12 - i)).toISOString().slice(0, 10);
      diasAnuncios.push({ ad_id: "ad1", date: d, impressions: 1000, clicks: i <= 7 ? 8 : 20, spend: 10 });
    }
    const { campanhas } = analisarCampanhas({
      campanhas: [camp({ id: "m", spend: 100, messages: 20 })],
      clientes, hoje,
      anuncios: [{ id: "ad1", name: "Carrossel", status: "ACTIVE", campaign_id: "m", frequency: 4.5 }],
      diasAnuncios,
    });
    const sat = campanhas[0].achados.find(a => a.tipo === "criativo_saturado");
    expect(sat?.anuncioId).toBe("ad1");
    expect(sat?.severidade).toBe("critico");
    expect(severidadeDaCampanha(campanhas[0].achados)).toBe("critico");
  });
});

describe("alcanceEstimado", () => {
  it("divide impressoes pela frequencia de cada anuncio", () => {
    const r = alcanceEstimado([{ impressions: 3000, frequency: 3 }, { impressions: 2000, frequency: 2 }, { impressions: 10, frequency: 0 }]);
    expect(r.alcance).toBe(2000);
    expect(r.frequencia).toBe(2.5);
  });
  it("sem frequencia nao inventa alcance", () => {
    expect(alcanceEstimado([{ impressions: 100, frequency: null }]).alcance).toBeNull();
  });
});

describe("resumirCliente", () => {
  it("junta visitas ao perfil, custo por mensagem e o ultimo financeiro informado", () => {
    const campanhas = [
      camp({ id: "m", spend: 100, messages: 20 }),
      camp({ id: "t", objective: "OUTCOME_TRAFFIC", spend: 50, clicks: 100 }),
      camp({ id: "o", client_id: "c2", spend: 999, messages: 1 }),
    ];
    const dias = [
      { client_id: "c1", date: "2026-10-01", spend: 40, messages: 5, profile_visits: 60 },
      { client_id: "c1", date: "2026-09-20", spend: 60, messages: 5, profile_visits: 40 },
      { client_id: "c1", date: "2026-08-10", spend: 500, messages: 5, profile_visits: 999 },
    ];
    const financeiro = [
      { client_id: "c1", mes: "2026-08-01", faturamento: 2000, investimento_manual: null, custos_efetivos: null },
      { client_id: "c1", mes: "2026-10-01", faturamento: null, investimento_manual: null, custos_efetivos: null },
    ];
    const r = resumirCliente("c1", campanhas, dias, financeiro, "2026-10-12");
    expect(r.investido).toBe(150);
    expect(r.custoMensagem).toBe(5);
    expect(r.visitasPerfil).toBe(100);
    expect(r.custoVisitaEstimado).toBe(0.5);
    expect(r.financeiro?.mes).toBe("2026-08-01");
    expect(r.financeiro?.investimento).toBe(500);
    expect(r.financeiro?.roas).toBe(4);
    expect(r.financeiro?.estimado).toBe(true);
  });

  it("sem faturamento informado nao ha financeiro", () => {
    expect(resumirCliente("c1", [], [], [], "2026-10-12").financeiro).toBeNull();
  });
});
