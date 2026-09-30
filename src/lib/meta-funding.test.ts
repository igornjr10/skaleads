import { describe, expect, it } from "vitest";
import {
  parseBalanceCents,
  parseFundingActivity,
  reconcileCharges,
  summarizeDeposits,
} from "./meta-funding";

describe("parseBalanceCents", () => {
  it("le o formato que a Meta devolveu na conta da BLITZ STORE", () => {
    expect(parseBalanceCents("Saldo disponivel (R$689,05 BRL)")).toBe(68905);
  });

  it("entende milhar em pt-BR", () => {
    expect(parseBalanceCents("Saldo disponivel (R$1.229,91 BRL)")).toBe(122991);
  });

  it("entende o mesmo valor em en-US", () => {
    expect(parseBalanceCents("Available balance ($1,229.91 USD)")).toBe(122991);
  });

  it("aceita valor sem casa decimal", () => {
    expect(parseBalanceCents("Saldo disponivel (R$700 BRL)")).toBe(70000);
  });

  // O risco real: `display_string` e o mesmo campo para cartao, e um numero
  // solto ali viraria saldo.
  it("ignora cartao de credito", () => {
    expect(parseBalanceCents("Visa *1234")).toBeNull();
    expect(parseBalanceCents("Mastercard ***** 4821")).toBeNull();
  });

  it("devolve null sem texto", () => {
    expect(parseBalanceCents(null)).toBeNull();
    expect(parseBalanceCents("")).toBeNull();
  });
});

describe("parseFundingActivity", () => {
  it("le o deposito com o valor em `amount`", () => {
    const event = parseFundingActivity({
      event_type: "funding_event_successful",
      event_time: "2026-09-16T14:24:13+0000",
      extra_data: '{"action":67,"amount":70000,"currency":"BRL","fee":0,"network_id":"PIX","provider_amount":70000,"type":""}',
    });

    expect(event).toMatchObject({
      eventType: "funding_event_successful",
      amountCents: 70000,
      currency: "BRL",
      networkId: "PIX",
    });
    expect(event?.eventTime).toBe("2026-09-16T14:24:13.000Z");
  });

  it("le a cobranca com o valor em `new_value`", () => {
    const event = parseFundingActivity({
      event_type: "ad_account_billing_charge",
      event_time: "2026-09-17T09:41:04+0000",
      extra_data: '{"currency":"BRL","new_value":2502,"transaction_id":"28725883637101217","action":67,"type":"payment_amount"}',
    });

    expect(event).toMatchObject({
      eventType: "ad_account_billing_charge",
      amountCents: 2502,
      transactionId: "28725883637101217",
    });
  });

  it("descarta evento que nao e dinheiro", () => {
    expect(
      parseFundingActivity({
        event_type: "update_ad_run_status",
        event_time: "2026-09-16T21:30:15+0000",
        extra_data: '{"old_value":"Analise pendente","new_value":"Ativo"}',
      })
    ).toBeNull();
  });

  it("descarta evento de dinheiro sem valor utilizavel", () => {
    expect(
      parseFundingActivity({
        event_type: "funding_event_successful",
        event_time: "2026-09-16T14:24:13+0000",
        extra_data: "{}",
      })
    ).toBeNull();
  });
});

describe("summarizeDeposits", () => {
  const now = new Date("2026-09-17T12:00:00Z");

  it("soma so o que entrou no mes corrente", () => {
    const summary = summarizeDeposits(
      [
        { eventType: "funding_event_successful", eventTime: "2026-09-16T14:24:13Z", amountCents: 70000, networkId: "PIX" },
        { eventType: "funding_event_successful", eventTime: "2026-09-02T10:00:00Z", amountCents: 30000, networkId: "PIX" },
        { eventType: "funding_event_successful", eventTime: "2026-08-20T10:00:00Z", amountCents: 50000, networkId: "PIX" },
        { eventType: "ad_account_billing_charge", eventTime: "2026-09-17T09:41:04Z", amountCents: 2502, networkId: null },
      ],
      now
    );

    expect(summary.depositedThisMonth).toBe(1000);
    expect(summary.depositCount).toBe(2);
    expect(summary.lastDepositAmount).toBe(700);
    expect(summary.lastDepositNetwork).toBe("PIX");
  });

  it("devolve zero sem aporte", () => {
    const summary = summarizeDeposits([], now);
    expect(summary.depositedThisMonth).toBe(0);
    expect(summary.lastDepositAt).toBeNull();
  });
});

describe("reconcileCharges", () => {
  // Numeros reais da BLITZ STORE: a cobranca da manha cobre o gasto da vespera.
  const charges = [
    { eventType: "ad_account_billing_charge" as const, eventTime: "2026-09-15T09:32:57Z", amountCents: 3112 },
    { eventType: "ad_account_billing_charge" as const, eventTime: "2026-09-14T09:36:48Z", amountCents: 2504 },
  ];

  it("casa a cobranca com o gasto do dia anterior", () => {
    const rows = reconcileCharges(charges, { "2026-09-14": 31.07, "2026-09-13": 25.06 });

    expect(rows[0]).toMatchObject({ chargeDate: "2026-09-15", spendDate: "2026-09-14", suspicious: false });
    expect(rows[1]).toMatchObject({ chargeDate: "2026-09-14", spendDate: "2026-09-13", suspicious: false });
    expect(Math.abs(rows[0].diff)).toBeLessThan(0.1);
  });

  it("acusa dia faltando no sync", () => {
    const rows = reconcileCharges(charges, { "2026-09-13": 25.06 });

    expect(rows[0].suspicious).toBe(true);
    expect(rows[0].reportedSpend).toBe(0);
    expect(rows[1].suspicious).toBe(false);
  });

  it("ignora aporte na conferencia", () => {
    const rows = reconcileCharges(
      [{ eventType: "funding_event_successful", eventTime: "2026-09-16T14:24:13Z", amountCents: 70000 }],
      {}
    );
    expect(rows).toHaveLength(0);
  });
});
