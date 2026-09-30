import { describe, expect, it } from "vitest";
import { chaveTelefone, formatarTelefone, preencherModelo } from "./whatsapp";

describe("chaveTelefone", () => {
  it("casa as formas do mesmo celular (com e sem 55, com e sem o 9, JID)", () => {
    const esperado = "551188887777";
    for (const t of ["(11) 98888-7777", "11988887777", "1188887777", "551188887777", "+55 11 98888-7777", "5511988887777@s.whatsapp.net"]) {
      expect(chaveTelefone(t)).toBe(esperado);
    }
  });
  // 11 digitos sem pais e sempre lido como Brasil (DDD + celular): e o caso
  // de uma agencia brasileira. Estrangeiro precisa vir com o codigo do pais.
  it("numero estrangeiro com codigo do pais passa inteiro; curto demais vira null", () => {
    expect(chaveTelefone("+44 20 7946 0958")).toBe("442079460958");
    expect(chaveTelefone("1234")).toBeNull();
    expect(chaveTelefone(null)).toBeNull();
  });
});

describe("preencherModelo", () => {
  const lead = { contato_nome: "Maria Souza", empresa: "Padaria X", cidade: "Campinas", segmento: null };
  it("preenche as variaveis conhecidas", () => {
    expect(preencherModelo("Oi {nome}, tudo bem? Vi a {empresa} em {cidade}.", lead))
      .toBe("Oi Maria, tudo bem? Vi a Padaria X em Campinas.");
    expect(preencherModelo("{nome_completo}", lead)).toBe("Maria Souza");
  });
  it("variavel vazia nao deixa espaco sobrando antes da pontuacao", () => {
    expect(preencherModelo("Voce trabalha com {segmento}, certo?", lead)).toBe("Voce trabalha com, certo?");
    expect(preencherModelo("Oi {nome} !", { ...lead, contato_nome: "" })).toBe("Oi!");
  });
  it("chave desconhecida fica como esta (erro de digitacao aparece no preview)", () => {
    expect(preencherModelo("Oi {nomee}", lead)).toBe("Oi {nomee}");
  });
});

describe("formatarTelefone", () => {
  it("formata celular e fixo brasileiros", () => {
    expect(formatarTelefone("5511988887777")).toBe("(11) 98888-7777");
    expect(formatarTelefone("1133334444")).toBe("(11) 3333-4444");
    expect(formatarTelefone("442079460958")).toBe("442079460958");
  });
});
