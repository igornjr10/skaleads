import { describe, expect, it } from "vitest";
import { ensureAdsScope, matchScore, suggestByName } from "@/lib/meta-connect";

describe("ensureAdsScope", () => {
  it("passa quando ads_read veio", () => {
    expect(() => ensureAdsScope(["public_profile", "ads_read"])).not.toThrow();
  });

  it("passa quando so ads_management veio", () => {
    expect(() => ensureAdsScope(["ads_management"])).not.toThrow();
  });

  it("barra lista vazia, que antes passava batido e virava erro 200 na sync", () => {
    expect(() => ensureAdsScope([])).toThrow(/nenhuma permissao/i);
  });

  it("lista sem ads_read diz o que a Meta concedeu", () => {
    expect(() => ensureAdsScope(["public_profile", "pages_show_list"])).toThrow(/pages_show_list/);
  });
});

describe("matchScore", () => {
  it("ignora o ruido de prefixo e sufixo da nomenclatura das contas", () => {
    expect(matchScore("MARE", "CA - MARE (PIX)")).toBe(1);
  });

  it("nao confunde cliente parecido com outro mais especifico", () => {
    expect(matchScore("MARE", "CA - MARE FIT")).toBeLessThan(matchScore("MARE", "CA - MARE (PIX)"));
  });

  it("e indiferente a acento e caixa", () => {
    expect(matchScore("Colorê", "CA - COLORE (PIX)")).toBe(1);
  });

  it("da zero para nomes sem palavra em comum", () => {
    expect(matchScore("BLITZ STORE", "CA - SANTO CHEIRO")).toBe(0);
  });

  it("nao casa so pelo ruido compartilhado", () => {
    expect(matchScore("Loja do Ze", "CA - LOJA (PIX)")).toBe(0);
  });
});

describe("suggestByName", () => {
  const contas = [
    { id: "act_1", name: "CA - MARE (PIX)" },
    { id: "act_2", name: "CA - BLITZ STORE" },
    { id: "act_3", name: "CA - SANTO CHEIRO" },
  ];

  it("escolhe a conta do cliente", () => {
    expect(suggestByName("BLITZ STORE", contas, (c) => c.name)?.id).toBe("act_2");
  });

  it("devolve null quando nada alcanca o minimo, em vez de chutar", () => {
    expect(suggestByName("FM VEICULOS", contas, (c) => c.name)).toBeNull();
  });
});
