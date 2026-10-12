import { describe, expect, it } from "vitest";
import {
  dataValida,
  diasNoIntervalo,
  hojeEmSaoPaulo,
  normalizarPeriodo,
  periodoDoModelo,
  resolverPeriodo,
} from "./report-periodo";

describe("resolverPeriodo", () => {
  const hoje = "2026-10-12"; // segunda-feira

  it("ultimos N dias termina ontem e tem N dias", () => {
    const p = resolverPeriodo({ tipo: "ultimos_dias", dias: 7 }, hoje);
    expect(p).toMatchObject({ start: "2026-10-05", end: "2026-10-11" });
    expect(diasNoIntervalo(p.start, p.end)).toBe(7);
    expect(p.label).toBe("Últimos 7 dias (05/10/2026 a 11/10/2026)");
  });

  it("aceita quantidade livre de dias e limita a 365", () => {
    const livre = resolverPeriodo({ tipo: "ultimos_dias", dias: 45 }, hoje);
    expect(diasNoIntervalo(livre.start, livre.end)).toBe(45);
    const grande = resolverPeriodo({ tipo: "ultimos_dias", dias: 5000 }, hoje);
    expect(diasNoIntervalo(grande.start, grande.end)).toBe(365);
  });

  it("ontem", () => {
    expect(resolverPeriodo({ tipo: "ontem" }, hoje)).toEqual({ start: "2026-10-11", end: "2026-10-11", label: "Ontem (11/10/2026)" });
  });

  it("semana passada vai de segunda a domingo", () => {
    expect(resolverPeriodo({ tipo: "semana_anterior" }, hoje)).toMatchObject({ start: "2026-10-05", end: "2026-10-11" });
    expect(resolverPeriodo({ tipo: "semana_anterior" }, "2026-10-18")).toMatchObject({ start: "2026-10-05", end: "2026-10-11" });
  });

  it("mes passado cruza a virada de ano", () => {
    expect(resolverPeriodo({ tipo: "mes_anterior" }, "2026-01-05")).toMatchObject({ start: "2025-12-01", end: "2025-12-31" });
    expect(resolverPeriodo({ tipo: "mes_anterior" }, "2026-03-01")).toMatchObject({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("este mes vai do dia 1 ate hoje", () => {
    expect(resolverPeriodo({ tipo: "mes_atual" }, hoje)).toMatchObject({ start: "2026-10-01", end: "2026-10-12" });
  });

  it("intervalo invertido e corrigido", () => {
    expect(resolverPeriodo({ tipo: "intervalo", inicio: "2026-09-30", fim: "2026-09-01" }, hoje)).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
      label: "01/09/2026 a 30/09/2026",
    });
  });
});

describe("normalizarPeriodo", () => {
  it("rejeita lixo e datas impossiveis", () => {
    expect(normalizarPeriodo(null)).toBeNull();
    expect(normalizarPeriodo({ tipo: "xpto" })).toBeNull();
    expect(normalizarPeriodo({ tipo: "intervalo", inicio: "2026-02-30", fim: "2026-03-01" })).toBeNull();
    expect(dataValida("2026-02-28")).toBe(true);
  });

  it("corrige dias fora da faixa", () => {
    expect(normalizarPeriodo({ tipo: "ultimos_dias", dias: 0 })).toEqual({ tipo: "ultimos_dias", dias: 1 });
    expect(normalizarPeriodo({ tipo: "ultimos_dias", dias: "21" })).toEqual({ tipo: "ultimos_dias", dias: 21 });
  });
});

describe("periodoDoModelo", () => {
  it("le o formato novo e o antigo", () => {
    expect(periodoDoModelo({ periodo: { tipo: "mes_anterior" }, period: "7d" })).toEqual({ tipo: "mes_anterior" });
    expect(periodoDoModelo({ period: "14d" })).toEqual({ tipo: "ultimos_dias", dias: 14 });
    expect(periodoDoModelo({})).toBeNull();
  });
});

describe("hojeEmSaoPaulo", () => {
  it("usa UTC-3", () => {
    expect(hojeEmSaoPaulo(new Date("2026-10-12T02:00:00Z"))).toBe("2026-10-11");
    expect(hojeEmSaoPaulo(new Date("2026-10-12T04:00:00Z"))).toBe("2026-10-12");
  });
});
