import { describe, expect, it } from "vitest";
import { escolherCriativoDestaque, itensDoTexto, lerSugestaoDaIA, temAnalise } from "./report-analise";
import type { ReportAd } from "./report-types";

function ad(name: string, spend: number, ctr: number, cpc = 1): ReportAd {
  return { name, spend, impressions: 1000, clicks: 10, previewUrl: null, creativeType: "image", ctr, cpc, cpm: 10, status: "ACTIVE" };
}

describe("escolherCriativoDestaque", () => {
  it("pega o maior CTR entre os que levaram verba relevante", () => {
    const d = escolherCriativoDestaque([ad("grande", 900, 1.2), ad("medio", 80, 2.5), ad("ruido", 3, 9)]);
    expect(d?.name).toBe("medio");
    expect(d?.reason).toContain("2,50%");
  });

  it("desempata pelo menor CPC", () => {
    expect(escolherCriativoDestaque([ad("caro", 100, 2, 3), ad("barato", 100, 2, 1)])?.name).toBe("barato");
  });

  it("sem gasto nao tem destaque", () => {
    expect(escolherCriativoDestaque([ad("a", 0, 5)])).toBeNull();
    expect(escolherCriativoDestaque([])).toBeNull();
  });
});

describe("itensDoTexto", () => {
  it("quebra por linha e tira marcadores", () => {
    expect(itensDoTexto("- um\n* dois\n\n• três\n1. quatro\n2) cinco")).toEqual(["um", "dois", "três", "quatro", "cinco"]);
  });

  it("temAnalise ignora campos so com espaco", () => {
    expect(temAnalise({ highlights: "  \n " })).toBe(false);
    expect(temAnalise({ nextSteps: "subir verba" })).toBe(true);
    expect(temAnalise(undefined)).toBe(false);
  });
});

describe("lerSugestaoDaIA", () => {
  it("le o JSON mesmo cercado de markdown", () => {
    const r = lerSugestaoDaIA('Aqui vai:\n```json\n{"destaques":["CPA caiu 20%"],"atencao":["saldo baixo"],"proximos_passos":["novo criativo","subir verba"]}\n```');
    expect(r).toEqual({ highlights: "CPA caiu 20%", attention: "saldo baixo", nextSteps: "novo criativo\nsubir verba" });
  });

  it("devolve null quando nao ha JSON util", () => {
    expect(lerSugestaoDaIA("nao sei")).toBeNull();
    expect(lerSugestaoDaIA("{quebrado")).toBeNull();
    expect(lerSugestaoDaIA('{"outra":"coisa"}')).toBeNull();
  });
});
