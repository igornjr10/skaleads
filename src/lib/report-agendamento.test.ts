import { describe, expect, it } from "vitest";
import {
  campoCasa,
  cronValido,
  descreverCron,
  lerCron,
  montarCron,
  periodoPadraoDaFrequencia,
  proximaExecucao,
  venceNestaHora,
} from "./report-agendamento";

describe("montarCron / lerCron", () => {
  it("ida e volta de cada frequencia", () => {
    const casos = [
      { frequencia: "diaria", diasSemana: [1], diasMes: [1], hora: 8 },
      { frequencia: "semanal", diasSemana: [1, 3, 5], diasMes: [1], hora: 9 },
      { frequencia: "quinzenal", diasSemana: [1], diasMes: [1, 15], hora: 10 },
      { frequencia: "mensal", diasSemana: [1], diasMes: [5, 20], hora: 18 },
    ] as const;
    for (const caso of casos) {
      const cron = montarCron({ ...caso, diasSemana: [...caso.diasSemana], diasMes: [...caso.diasMes] });
      expect(lerCron(cron)).toMatchObject({ frequencia: caso.frequencia, hora: caso.hora });
    }
    expect(montarCron({ frequencia: "semanal", diasSemana: [5, 1, 1], diasMes: [], hora: 9 })).toBe("0 9 * * 1,5");
  });

  it("le os presets antigos da tela", () => {
    expect(lerCron("0 9 * * 1")).toMatchObject({ frequencia: "semanal", diasSemana: [1], hora: 9 });
    expect(lerCron("0 9 1,15 * *")).toMatchObject({ frequencia: "quinzenal" });
    expect(lerCron("0 9 1 * *")).toMatchObject({ frequencia: "mensal", diasMes: [1] });
  });

  it("o que nao reconhece vira personalizado", () => {
    expect(lerCron("0 9 * * 1-5")).toMatchObject({ frequencia: "personalizada", cron: "0 9 * * 1-5" });
    expect(lerCron("lixo")).toMatchObject({ frequencia: "personalizada" });
  });
});

describe("descreverCron", () => {
  it("texto legivel", () => {
    expect(descreverCron("0 9 * * 1")).toBe("Toda segunda às 9h");
    expect(descreverCron("0 9 * * 1,3")).toBe("Toda segunda e quarta às 9h");
    expect(descreverCron("0 7 * * *")).toBe("Todo dia às 7h");
    expect(descreverCron("0 9 1 * *")).toBe("Todo dia 1 do mês às 9h");
  });
});

describe("venceNestaHora", () => {
  it("compara hora, dia e dia da semana", () => {
    const segunda9h = { hora: 9, diaMes: 12, mes: 10, diaSemana: 1 };
    expect(venceNestaHora("0 9 * * 1", segunda9h)).toBe(true);
    expect(venceNestaHora("0 10 * * 1", segunda9h)).toBe(false);
    expect(venceNestaHora("0 9 * * 1-5", segunda9h)).toBe(true);
    expect(venceNestaHora("0 9 12 * *", segunda9h)).toBe(true);
    expect(venceNestaHora("0 9 * * 7", { ...segunda9h, diaSemana: 0 })).toBe(true);
  });

  it("campo invalido nao dispara", () => {
    expect(campoCasa("abc", 1)).toBe(false);
    expect(cronValido("0 9 * *")).toBe(false);
    expect(cronValido("0 9 * * 1-5")).toBe(true);
  });
});

describe("proximaExecucao", () => {
  it("acha a proxima segunda as 9h de Sao Paulo", () => {
    // domingo 11/10/2026 15:30 em Sao Paulo
    const prox = proximaExecucao("0 9 * * 1", new Date("2026-10-11T18:30:00Z"));
    expect(prox?.toISOString()).toBe("2026-10-12T12:00:00.000Z");
  });

  it("cron invalido devolve null", () => {
    expect(proximaExecucao("x")).toBeNull();
  });
});

describe("periodoPadraoDaFrequencia", () => {
  it("janela coerente com a frequencia", () => {
    expect(periodoPadraoDaFrequencia("0 9 * * *")).toEqual({ tipo: "ontem" });
    expect(periodoPadraoDaFrequencia("0 9 * * 1")).toEqual({ tipo: "ultimos_dias", dias: 7 });
    expect(periodoPadraoDaFrequencia("0 9 1 * *")).toEqual({ tipo: "mes_anterior" });
  });
});
