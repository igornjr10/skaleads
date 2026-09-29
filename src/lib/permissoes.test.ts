import { describe, expect, it } from "vitest";
import { MODULOS, moduloDaRota, modulosEfetivos, modulosPadrao, veTodosOsClientes } from "./permissoes";

describe("modulosEfetivos", () => {
  it("usa o padrao do papel quando nao ha personalizacao", () => {
    expect(modulosEfetivos("designer", null)).toEqual(modulosPadrao("designer"));
    expect(modulosEfetivos("designer", null)).not.toContain("financeiro");
  });

  it("respeita a lista personalizada, mesmo tirando modulo do padrao", () => {
    expect(modulosEfetivos("analyst", ["campanhas", "dashboard"])).toEqual(["dashboard", "campanhas"]);
  });

  it("ignora chaves que nao sao modulo", () => {
    expect(modulosEfetivos("analyst", ["campanhas", "nao-existe"])).toEqual(["campanhas"]);
  });

  it("admin e owner sempre veem tudo, mesmo com lista gravada", () => {
    const todos = MODULOS.map(m => m.key);
    expect(modulosEfetivos("admin", ["dashboard"])).toEqual(todos);
    expect(modulosEfetivos("owner", [])).toEqual(todos);
  });

  it("papel desconhecido nao ganha nada", () => {
    expect(modulosEfetivos(null, null)).toEqual([]);
    expect(modulosEfetivos("qualquer", null)).toEqual([]);
  });
});

describe("moduloDaRota", () => {
  it("acha o modulo pela rota e pelas subrotas", () => {
    expect(moduloDaRota("/financeiro")).toBe("financeiro");
    expect(moduloDaRota("/clients/abc/audit")).toBe("clientes");
    expect(moduloDaRota("/alerts/new")).toBe("alertas");
    expect(moduloDaRota("/alert-events")).toBe("alertas");
  });

  it("nao confunde prefixo de palavra com subrota", () => {
    expect(moduloDaRota("/clientsx")).toBeNull();
  });

  it("configuracoes e rotas sem modulo ficam livres", () => {
    expect(moduloDaRota("/settings")).toBeNull();
    expect(moduloDaRota("/")).toBeNull();
  });
});

describe("veTodosOsClientes", () => {
  it("so admin e owner veem a carteira inteira", () => {
    expect(veTodosOsClientes("admin")).toBe(true);
    expect(veTodosOsClientes("owner")).toBe(true);
    expect(veTodosOsClientes("analyst")).toBe(false);
    expect(veTodosOsClientes("designer")).toBe(false);
  });
});
