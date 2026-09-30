import { describe, expect, it } from "vitest";
import { avaliarMeta, type MetricaDiaria } from "./metas";

function dias(qtd: number, por: Partial<MetricaDiaria>, mes = "2026-09"): MetricaDiaria[] {
  return Array.from({ length: qtd }, (_, i) => ({
    date: `${mes}-${String(i + 1).padStart(2, "0")}`,
    spend: 0,
    ...por,
  }));
}

describe("avaliarMeta", () => {
  it("sem alvo nao julga", () => {
    const a = avaliarMeta({ alvo_resultados_mes: null, alvo_custo_resultado: null }, dias(10, { spend: 50, leads: 1 }), "2026-09-10");
    expect(a.situacao).toBe("sem_meta");
    expect(a.resultados).toBe(10);
  });

  it("projeta o ritmo do mes e acusa quando fica abaixo", () => {
    // 2/dia em 30 dias = 60 projetados, contra 100 combinados
    const a = avaliarMeta({ alvo_resultados_mes: 100, alvo_custo_resultado: null }, dias(10, { spend: 20, messages: 2 }), "2026-09-10");
    expect(a.projecao).toBe(60);
    expect(a.resultadosAbaixo).toBe(true);
    expect(a.situacao).toBe("abaixo");
  });

  it("soma mensagens, ligacoes, rotas e leads como resultado", () => {
    const a = avaliarMeta({ alvo_resultados_mes: 120, alvo_custo_resultado: 10 }, dias(10, { spend: 40, messages: 1, calls: 1, directions: 1, leads: 1 }), "2026-09-10");
    expect(a.resultados).toBe(40);
    expect(a.custoPorResultado).toBe(10);
    expect(a.situacao).toBe("no_ritmo");
  });

  it("tolera ficar um pouco abaixo da meta", () => {
    const a = avaliarMeta({ alvo_resultados_mes: 100, alvo_custo_resultado: null }, dias(10, { spend: 20, leads: 3 }), "2026-09-10");
    expect(a.projecao).toBe(90);
    expect(a.situacao).toBe("no_ritmo");
  });

  it("acusa custo acima do alvo", () => {
    const a = avaliarMeta({ alvo_resultados_mes: null, alvo_custo_resultado: 10 }, dias(10, { spend: 30, leads: 2 }), "2026-09-10");
    expect(a.custoPorResultado).toBe(15);
    expect(a.custoAcima).toBe(true);
  });

  it("sem resultado so acusa custo depois de gastar tres resultados", () => {
    const pouco = avaliarMeta({ alvo_resultados_mes: null, alvo_custo_resultado: 20 }, dias(6, { spend: 5 }), "2026-09-06");
    expect(pouco.custoAcima).toBe(false);
    const muito = avaliarMeta({ alvo_resultados_mes: null, alvo_custo_resultado: 20 }, dias(6, { spend: 15 }), "2026-09-06");
    expect(muito.custoAcima).toBe(true);
  });

  it("nos primeiros dias mostra a meta mas nao acusa", () => {
    const a = avaliarMeta({ alvo_resultados_mes: 100, alvo_custo_resultado: null }, dias(3, { spend: 20 }), "2026-09-03");
    expect(a.situacao).toBe("cedo");
    expect(a.resultadosAbaixo).toBe(false);
  });

  it("ignora dias de outro mes e do futuro", () => {
    const a = avaliarMeta(
      { alvo_resultados_mes: 10, alvo_custo_resultado: null },
      [...dias(31, { spend: 100, leads: 50 }, "2026-08"), ...dias(20, { spend: 1, leads: 1 })],
      "2026-09-10",
    );
    expect(a.resultados).toBe(10);
    expect(a.gasto).toBe(10);
  });
});
