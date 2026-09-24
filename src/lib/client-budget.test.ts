import { describe, expect, it } from "vitest";
import { computeBudgetStatus } from "./client-budget";

// 17 de setembro: 17 dias corridos de 30, faltando 13 para fechar o mes.
const dia17 = new Date(2026, 8, 17, 12, 0, 0);

describe("computeBudgetStatus", () => {
  it("mede autonomia: quantos dias o saldo ainda paga no ritmo atual", () => {
    // Gasto 340 em 17 dias = R$ 20/dia. Saldo 300 paga 15 dias, e faltam 13.
    const status = computeBudgetStatus({ spent: 340, balance: 300 }, dia17);

    expect(status.dailyAvg).toBeCloseTo(20, 2);
    expect(status.runwayDays).toBeCloseTo(15, 2);
    expect(status.coversMonth).toBe(true);
    expect(status.level).toBe("onTrack");
  });

  // O caso que derrubou a metrica anterior: a FM Veiculos aparecia com 103% da
  // verba consumida tendo R$ 820 em caixa, porque entrara no mes com R$ 946 de
  // saldo virado que o aporte do mes nao enxerga.
  //
  // A autonomia nao a inocenta — ela realmente vai apertar — mas troca um
  // diagnostico falso ("gastou mais do que tinha") por um verdadeiro e
  // acionavel: no ritmo de R$ 91/dia, R$ 820 pagam 9 dos 13 dias que faltam.
  it("troca o falso estouro por um aperto real e mensuravel", () => {
    const status = computeBudgetStatus(
      { spent: 1550.02, deposited: 1500, depositCount: 1, balance: 820.83 },
      dia17
    );

    expect(status.dailyAvg).toBeCloseTo(91.18, 2);
    expect(Math.floor(status.runwayDays!)).toBe(9);
    expect(status.coversMonth).toBe(false);
    expect(status.level).toBe("ahead");
    expect(status.label).toBe("Aperta no fim do mes");
  });

  it("avisa quando o saldo nao cobre o resto do mes", () => {
    // R$ 20/dia com R$ 100 em caixa paga 5 dias contra os 13 que faltam.
    const status = computeBudgetStatus({ spent: 340, balance: 100 }, dia17);

    expect(status.runwayDays).toBeCloseTo(5, 2);
    expect(status.coversMonth).toBe(false);
    expect(status.level).toBe("over");
    expect(status.label).toBe("Vai faltar saldo");
  });

  it("separa o aperto do estouro", () => {
    // 10 dias de autonomia para 13 restantes: aperta, mas da para esticar.
    const status = computeBudgetStatus({ spent: 340, balance: 200 }, dia17);

    expect(status.level).toBe("ahead");
    expect(status.label).toBe("Aperta no fim do mes");
  });

  it("sem saldo lido, pede sincronizacao em vez de mostrar numero errado", () => {
    const status = computeBudgetStatus({ spent: 435.58, balance: null }, dia17);

    expect(status.balance).toBeNull();
    expect(status.runwayDays).toBeNull();
    expect(status.label).toBe("Saldo nao lido");
    expect(status.hint).toContain("Sincronize");
  });

  it("nao calcula ritmo em conta que ainda nao gastou", () => {
    const status = computeBudgetStatus({ spent: 0, balance: 1000 }, dia17);

    expect(status.level).toBe("idle");
    expect(status.runwayDays).toBeNull();
  });

  it("acusa saldo baixo abaixo de R$ 50", () => {
    expect(computeBudgetStatus({ spent: 100, balance: 14.07 }, dia17).lowBalance).toBe(true);
    expect(computeBudgetStatus({ spent: 100, balance: 50 }, dia17).lowBalance).toBe(false);
    // Ausencia de saldo nao e saldo zero: conta pos-paga nao pode virar alarme.
    expect(computeBudgetStatus({ spent: 100, balance: null }, dia17).lowBalance).toBe(false);
  });

  it("guarda o aporte do mes como informacao, sem usar de teto", () => {
    const status = computeBudgetStatus(
      { spent: 392.12, deposited: 700, depositCount: 1, balance: 687.24 },
      dia17
    );

    expect(status.deposited).toBe(700);
    expect(status.depositCount).toBe(1);
    // O que decide o nivel e a autonomia, nao a razao gasto/aporte.
    expect(status.runwayDays).toBeCloseTo(687.24 / (392.12 / 17), 2);
  });

  it("sugere o diario que distribui o saldo pelos dias que faltam", () => {
    const status = computeBudgetStatus({ spent: 340, balance: 260 }, dia17);
    expect(status.dailySuggested).toBeCloseTo(20, 2);
  });
});
