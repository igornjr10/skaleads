import { describe, expect, it } from "vitest";
import { PALETA_PADRAO, PALETAS_SUGERIDAS, temaDaPaleta } from "./identidade-relatorio";
import { METRICAS_VAZIAS, criarBloco, montarRelatorioHtml, normalizarRelatorio, type RelatorioDados } from "./relatorio-html";

function relatorio(parcial: Partial<RelatorioDados> = {}): RelatorioDados {
  const resumo = criarBloco("resumo");
  resumo.texto = "Mês com **recorde** de pedidos";
  return {
    agencia: { nome: "Midsam Log", logo_url: null },
    cliente: { nome: "Pizzaria", logo_url: null },
    local: "Campinas/SP",
    periodo: "Setembro de 2026",
    manchete: "Manchete",
    subtitulo: "",
    metricas: { ...METRICAS_VAZIAS, alcance: 1000, custo_por_mensagem: 2 },
    blocos: [criarBloco("numeros"), resumo],
    ...parcial,
  };
}

const hexDoHtml = (html: string) => new Set((html.match(/#[0-9a-f]{6}/gi) ?? []).map((h) => h.toLowerCase()));

describe("montarRelatorioHtml com identidade", () => {
  const vermelho = PALETAS_SUGERIDAS[1].paleta;
  const azul = temaDaPaleta(PALETA_PADRAO);

  it("identidade vermelha pinta capa, destaques e resumo sem nenhum tom do azul", () => {
    const html = montarRelatorioHtml(relatorio({
      identidade: { assessoria_id: "log", nome: "Midsam Log", logo_url: null, paleta: vermelho },
    }));
    const cores = hexDoHtml(html);
    expect(cores.has(vermelho.primaria)).toBe(true);
    const azuis = Object.values(azul).filter((v) => v.startsWith("#") && cores.has(v));
    expect(azuis).toEqual([]);
  });

  it("relatorio salvo antes das assessorias abre no azul de sempre", () => {
    const antigo = normalizarRelatorio({ ...relatorio(), identidade: undefined });
    expect(antigo.identidade).toBeUndefined();
    expect(hexDoHtml(montarRelatorioHtml(antigo)).has(PALETA_PADRAO.primaria)).toBe(true);
  });

  it("a identidade gravada sobrevive a salvar e reabrir", () => {
    const identidade = { assessoria_id: "log", nome: "Midsam Log", logo_url: "https://x/log.png", paleta: vermelho };
    const reaberto = normalizarRelatorio(JSON.parse(JSON.stringify(relatorio({ identidade }))));
    expect(reaberto.identidade).toEqual(identidade);
  });
});
