import { describe, expect, it } from "vitest";
import { LIMITES_PADRAO, estimativaDeEnvio } from "./whatsapp-fila";

describe("estimativaDeEnvio", () => {
  it("poucas mensagens: minutos no mesmo dia", () => {
    expect(estimativaDeEnvio(10, LIMITES_PADRAO)).toBe("10 mensagens: cerca de 6 min de envio, dentro do horário das 8h às 20h.");
  });

  it("acima do teto diario: divide em dias", () => {
    expect(estimativaDeEnvio(400, LIMITES_PADRAO)).toBe("400 mensagens: até 150 por dia, então leva cerca de 3 dias (envia das 8h às 20h, todos os dias).");
  });

  it("janela curta vira o gargalo antes do teto", () => {
    // 1h de janela / (60s * 1.1) = 54 por dia, menos que o teto de 150
    const r = estimativaDeEnvio(100, { limite_diario: 150, intervalo_seg: 60, hora_inicio: 9, hora_fim: 10 });
    expect(r).toContain("até 54 por dia");
    expect(r).toContain("2 dias");
  });

  it("nada a enviar: texto vazio", () => {
    expect(estimativaDeEnvio(0, LIMITES_PADRAO)).toBe("");
  });
});
