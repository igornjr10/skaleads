import { describe, expect, it } from "vitest";
import { eTelaInterna, telaDeCima } from "./navegacao";

describe("eTelaInterna", () => {
  it("tela do menu nao e interna", () => {
    expect(eTelaInterna("/clients")).toBe(false);
    expect(eTelaInterna("/demandas/")).toBe(false);
  });

  it("detalhe e subtela sao internas", () => {
    expect(eTelaInterna("/clients/abc")).toBe(true);
    expect(eTelaInterna("/clients/abc/reports")).toBe(true);
  });
});

describe("telaDeCima", () => {
  it("sobe um nivel", () => {
    expect(telaDeCima("/clients/abc")).toBe("/clients");
    expect(telaDeCima("/clients/abc/reports")).toBe("/clients/abc");
  });

  it("alertas voltam para a lista", () => {
    expect(telaDeCima("/alerts/new")).toBe("/alerts");
    expect(telaDeCima("/alerts/abc/edit")).toBe("/alerts");
  });

  it("primeiro nivel cai no dashboard", () => {
    expect(telaDeCima("/clients")).toBe("/dashboard");
  });
});
