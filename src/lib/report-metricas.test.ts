import { describe, expect, it } from "vitest";
import {
  formatarValorMetrica,
  linhasDeMetricas,
  metricasDoModelo,
  metricasParaOLegado,
  normalizarMetricas,
  resultadosDoResumo,
  type ResumoMetricas,
} from "./report-metricas";

const resumo: ResumoMetricas = {
  spend: 1000,
  impressions: 50000,
  clicks: 500,
  ctr: 1,
  cpc: 2,
  cpm: 20,
  revenue: 0,
  roas: 0,
  messagesStarted: 40,
  phoneCalls: 5,
  directions: 3,
  leads: 2,
  instagramProfileVisits: 0,
};

describe("linhasDeMetricas", () => {
  it("respeita a escolha e a ordem", () => {
    const linhas = linhasDeMetricas(resumo, ["costPerMessage", "spend", "xpto", "spend"]);
    expect(linhas.map((l) => l.key)).toEqual(["costPerMessage", "spend"]);
    expect(linhas[0].valor).toBe("R$ 25,00");
  });

  it("custo sem base vira traco, nao infinito", () => {
    expect(linhasDeMetricas(resumo, ["costPerProfileVisit"])[0].valor).toBe("-");
  });

  it("resultado soma mensagens, ligacoes, rotas e leads", () => {
    expect(resultadosDoResumo(resumo)).toBe(50);
    expect(linhasDeMetricas(resumo, ["costPerResult"])[0].valor).toBe("R$ 20,00");
  });

  it("sem escolha usa o padrao antigo", () => {
    expect(linhasDeMetricas(resumo, []).map((l) => l.key)).toEqual(["spend", "impressions", "clicks", "roas", "ctr"]);
  });
});

describe("formatarValorMetrica", () => {
  it("formatos", () => {
    expect(formatarValorMetrica("pct", 1.234)).toBe("1,23%");
    expect(formatarValorMetrica("multiplo", 3)).toBe("3,00x");
    expect(formatarValorMetrica("numero", 1234.4)).toBe("1.234");
    expect(formatarValorMetrica("moeda", null)).toBe("-");
  });
});

describe("modelo do cliente", () => {
  it("prefere report_metrics e cai para o vocabulario antigo", () => {
    expect(metricasDoModelo({ report_metrics: ["leads"], metrics: ["spend"] })).toEqual(["leads"]);
    expect(metricasDoModelo({ metrics: ["spend", "messages", "profileVisits", "nada"] })).toEqual([
      "spend",
      "messagesStarted",
      "instagramProfileVisits",
    ]);
    expect(metricasDoModelo(null)).toBeNull();
    expect(metricasDoModelo({ metrics: [] })).toBeNull();
  });

  it("traduz de volta so o que o envio rapido conhece", () => {
    expect(metricasParaOLegado(["spend", "costPerMessage", "messagesStarted"])).toEqual(["spend", "messages"]);
  });

  it("normaliza listas do banco", () => {
    expect(normalizarMetricas("spend")).toEqual([]);
    expect(normalizarMetricas(["ctr", "ctr", 3])).toEqual(["ctr"]);
  });
});
