import { describe, expect, it } from "vitest";
import { agruparConversas, type MensagemWa } from "./useConversas";

function msg(parcial: Partial<MensagemWa>): MensagemWa {
  return {
    id: Math.random().toString(36).slice(2), company_id: "c", lead_id: null, chave: "551188887777",
    telefone: null, nome_contato: null, messageid: null, direcao: "entrada", tipo: "text", texto: "oi",
    origem: "contato", status: null, autor_id: null, enviada_em: "2026-09-29T10:00:00Z", lida_em: null,
    ...parcial,
  };
}

describe("agruparConversas", () => {
  it("uma conversa por chave, mais recente primeiro, contando nao lidas so de entrada", () => {
    const conversas = agruparConversas([
      msg({ chave: "A", enviada_em: "2026-09-29T10:00:00Z", nome_contato: "Ana" }),
      msg({ chave: "A", enviada_em: "2026-09-29T10:05:00Z", direcao: "saida", origem: "manual" }),
      msg({ chave: "A", enviada_em: "2026-09-29T10:01:00Z", lida_em: "2026-09-29T10:02:00Z" }),
      msg({ chave: "B", enviada_em: "2026-09-29T11:00:00Z", lead_id: "lead-b" }),
    ]);
    expect(conversas.map(c => c.chave)).toEqual(["B", "A"]);
    const a = conversas[1];
    expect(a.naoLidas).toBe(1);
    expect(a.nome).toBe("Ana");
    expect(a.ultima.direcao).toBe("saida");
    expect(conversas[0].leadId).toBe("lead-b");
  });

  it("herda o lead de qualquer mensagem da conversa (a primeira pode ter chegado antes do cadastro)", () => {
    const [c] = agruparConversas([
      msg({ enviada_em: "2026-09-29T10:00:00Z", lead_id: null }),
      msg({ enviada_em: "2026-09-29T10:10:00Z", lead_id: "lead-x" }),
    ]);
    expect(c.leadId).toBe("lead-x");
  });
});
