import { describe, expect, it } from "vitest";
import { ruleToHuman, type AlertRule } from "./alert-engine";

function regra(metric: string, comparator = "gte", value: number | string = 80): AlertRule {
  return {
    conditions: [{ metric, comparator, value, period: "30d", entityType: "CLIENT" } as never],
    logic: "AND",
  };
}

describe("ruleToHuman", () => {
  it("le o saldo em reais e no agora", () => {
    expect(ruleToHuman(regra("balance", "lt", 50))).toBe(
      "Saldo na conta Meta menor que 50 (agora)"
    );
  });

  it("respeita o periodo das metricas que tem recorte de tempo", () => {
    expect(ruleToHuman(regra("ctr", "lt", 1))).toBe("CTR menor que 1 (30 dias)");
  });

  // Duas metricas de verba ja foram aposentadas: `budget` em 17/09/2026, por
  // depender do valor digitado a mao, e `budget_pct` em 18/09/2026, por dividir
  // o gasto do mes pelo aporte do mes e ignorar o saldo que veio virado do mes
  // anterior — a FM Veiculos aparecia com 103% da verba tendo R$ 820 em caixa.
  // Alerta salvo com qualquer uma delas ainda existe no banco, e a tela precisa
  // dizer o que ha de errado em vez de escrever "undefined".
  it.each(["budget", "budget_pct"])("nomeia a metrica aposentada %s em vez de escrever undefined", (metrica) => {
    const texto = ruleToHuman(regra(metrica));
    expect(texto).not.toContain("undefined");
    expect(texto).toContain(`Métrica desconhecida (${metrica})`);
  });
});
