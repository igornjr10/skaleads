import { describe, expect, it } from "vitest";
import { calcularFinanceiro, inicioDoMes, referenciaDoSegmento } from "./financeiro-cliente";

const base = { faturamento: 10000, investimentoManual: null, investimentoMeta: 2000, custosEfetivos: null, custoOperacionalPct: 30 };

describe("calcularFinanceiro", () => {
  it("ROAS, ROI e margem com custo estimado em 30% do faturamento", () => {
    const r = calcularFinanceiro(base);
    expect(r.roas).toBe(5);
    expect(r.custosOperacionais).toBe(3000);
    expect(r.custoTotal).toBe(5000);
    expect(r.lucro).toBe(5000);
    expect(r.roi).toBe(100);
    expect(r.margem).toBe(50);
    expect(r.estimado).toBe(true);
    expect(r.investimentoFonte).toBe("meta");
  });

  it("custo efetivo e investimento manual substituem as estimativas", () => {
    const r = calcularFinanceiro({ ...base, investimentoManual: 2500, custosEfetivos: 4000 });
    expect(r.investimento).toBe(2500);
    expect(r.roas).toBe(4);
    expect(r.lucro).toBe(3500);
    expect(r.roi).toBeCloseTo((3500 / 6500) * 100);
    expect(r.estimado).toBe(false);
    expect(r.custosFonte).toBe("efetivo");
  });

  it("sem faturamento nao inventa ROAS nem ROI", () => {
    const r = calcularFinanceiro({ ...base, faturamento: null });
    expect(r.roas).toBeNull();
    expect(r.roi).toBeNull();
    expect(r.lucro).toBeNull();
  });

  it("sem investimento nao divide por zero", () => {
    const r = calcularFinanceiro({ ...base, investimentoMeta: 0 });
    expect(r.roas).toBeNull();
  });
});

describe("referenciaDoSegmento", () => {
  it("acha pelo texto livre do segmento", () => {
    expect(referenciaDoSegmento("Clínica odontológica")?.label).toBe("Saúde e estética");
    expect(referenciaDoSegmento("Hamburgueria")?.label).toBe("Alimentação");
    expect(referenciaDoSegmento("algo novo")).toBeNull();
    expect(referenciaDoSegmento(null)).toBeNull();
  });
});

it("inicioDoMes", () => {
  expect(inicioDoMes("2026-10-12")).toBe("2026-10-01");
});
