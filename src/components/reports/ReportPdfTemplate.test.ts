import { describe, expect, it } from "vitest";
import { PALETA_PADRAO, PALETAS_SUGERIDAS, temaDaPaleta } from "@/lib/identidade-relatorio";
import { estilosDo } from "./ReportPdfTemplate";

const cores = (estilos: unknown) => new Set((JSON.stringify(estilos).match(/#[0-9a-f]{6}/gi) ?? []).map((c) => c.toLowerCase()));

describe("estilos do PDF do painel", () => {
  it("o azul antigo fixo nao aparece mais em nenhum tema", () => {
    for (const p of [PALETA_PADRAO, PALETAS_SUGERIDAS[1].paleta]) {
      expect(cores(estilosDo(temaDaPaleta(p))).has("#2563eb")).toBe(false);
    }
  });

  it("tema vermelho pinta com o vermelho e sem tons do azul", () => {
    const vermelho = PALETAS_SUGERIDAS[1].paleta;
    const usadas = cores(estilosDo(temaDaPaleta(vermelho)));
    expect(usadas.has(vermelho.primaria)).toBe(true);
    const azul = temaDaPaleta(PALETA_PADRAO);
    expect(Object.values(azul).filter((v) => usadas.has(v) && v !== "#ffffff")).toEqual([]);
  });
});
