import { describe, expect, it } from "vitest";
import { buscarTudo } from "./buscar-tudo";

describe("buscarTudo", () => {
  it("junta paginas ate a ultima vir incompleta", async () => {
    const fonte = Array.from({ length: 7 }, (_, i) => i);
    const pedidos: [number, number][] = [];
    const tudo = await buscarTudo(async (de, ate) => {
      pedidos.push([de, ate]);
      return { data: fonte.slice(de, ate + 1), error: null };
    }, 3);
    expect(tudo).toEqual(fonte);
    expect(pedidos).toEqual([[0, 2], [3, 5], [6, 8]]);
  });

  it("pagina cheia no fim pede mais uma e para no vazio", async () => {
    let chamadas = 0;
    const tudo = await buscarTudo(async (de, ate) => {
      chamadas += 1;
      return { data: [1, 2, 3, 4].slice(de, ate + 1), error: null };
    }, 2);
    expect(tudo).toEqual([1, 2, 3, 4]);
    expect(chamadas).toBe(3);
  });

  it("propaga o erro", async () => {
    await expect(buscarTudo(async () => ({ data: null, error: new Error("falhou") }))).rejects.toThrow("falhou");
  });
});
