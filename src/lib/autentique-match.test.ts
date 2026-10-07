import { describe, it, expect } from "vitest";
import {
  acharCliente,
  statusDoDocumento,
  normalizar,
  acharIdDoDocumento,
  montarLinha,
} from "../../supabase/functions/_shared/autentique.ts";

const CARTEIRA = [
  { id: "hertz", name: "HERTZ" },
  { id: "mare", name: "MARÉ" },
  { id: "marefit", name: "MARE FIT" },
  { id: "ernesto", name: "ERNESTO VEÍCULOS" },
  { id: "jj", name: "JJ VEICULOS" },
];

function assinatura(over: Partial<Record<"viewed" | "signed" | "rejected", string>>) {
  return {
    public_id: "x",
    name: "Fulano",
    email: "f@x.com",
    viewed: over.viewed ? { created_at: over.viewed } : null,
    signed: over.signed ? { created_at: over.signed } : null,
    rejected: over.rejected ? { created_at: over.rejected } : null,
  };
}

describe("normalizar", () => {
  it("tira acento e pontuacao", () => {
    expect(normalizar("ERNESTO VEÍCULOS")).toBe("ernesto veiculos");
    expect(normalizar("Contrato - MARÉ (2026).pdf")).toBe("contrato mare 2026 pdf");
  });
});

describe("acharCliente", () => {
  it("acha o cliente pelo nome no titulo do documento", () => {
    expect(acharCliente("Contrato de prestacao - HERTZ", CARTEIRA)).toBe("hertz");
  });

  it("ignora acento dos dois lados", () => {
    expect(acharCliente("CONTRATO ERNESTO VEICULOS 2026", CARTEIRA)).toBe("ernesto");
  });

  it("prefere o nome mais especifico quando um cabe dentro do outro", () => {
    // "mare" cabe em "mare fit": sem o desempate, o contrato da MARE FIT iria
    // para a MARE.
    expect(acharCliente("Contrato MARE FIT", CARTEIRA)).toBe("marefit");
    expect(acharCliente("Contrato MARE", CARTEIRA)).toBe("mare");
  });

  it("nao chuta quando nao reconhece", () => {
    expect(acharCliente("Aditivo contratual 2026", CARTEIRA)).toBeNull();
    expect(acharCliente("", CARTEIRA)).toBeNull();
  });
});

describe("statusDoDocumento", () => {
  it("so e assinado quando todo mundo assinou", () => {
    expect(
      statusDoDocumento([assinatura({ signed: "2026-09-01T10:00:00Z" }), assinatura({ viewed: "2026-09-02T10:00:00Z" })]).status
    ).toBe("pendente");
  });

  it("usa a data da ultima assinatura, que e quando o contrato fechou", () => {
    const r = statusDoDocumento([
      assinatura({ signed: "2026-09-01T10:00:00Z" }),
      assinatura({ signed: "2026-09-05T10:00:00Z" }),
    ]);
    expect(r.status).toBe("assinado");
    expect(r.assinadoEm).toBe("2026-09-05T10:00:00Z");
  });

  it("recusa de um trava o documento mesmo com os outros assinados", () => {
    expect(
      statusDoDocumento([
        assinatura({ signed: "2026-09-01T10:00:00Z" }),
        assinatura({ rejected: "2026-09-02T10:00:00Z" }),
      ]).status
    ).toBe("recusado");
  });

  it("documento sem signatario nao conta como assinado", () => {
    expect(statusDoDocumento([]).status).toBe("pendente");
  });
});

describe("acharIdDoDocumento", () => {
  // Formatos copiados da doc de webhooks da Autentique.
  it("evento de documento traz o documento em event.data.object", () => {
    const payload = {
      event: {
        type: "document.updated",
        data: { object: { id: "89c7d2ab31f9f5a13b3d20ecf53319af387e54d240ae7be993", object: "document" } },
      },
    };
    expect(acharIdDoDocumento(payload)).toBe("89c7d2ab31f9f5a13b3d20ecf53319af387e54d240ae7be993");
  });

  it("evento de assinatura traz o id do documento em event.data.document", () => {
    const payload = {
      event: {
        type: "signature.accepted",
        data: {
          public_id: "f8911dcd-dfcd-11ef-9465-42010a2b610e",
          object: "signature",
          document: "f48a8b465d02dd87559e08f06c41e3b6d548c4d7ad835eb0f",
        },
      },
    };
    expect(acharIdDoDocumento(payload)).toBe("f48a8b465d02dd87559e08f06c41e3b6d548c4d7ad835eb0f");
  });

  it("nao confunde o id da assinatura com o do documento", () => {
    const payload = { event: { type: "signature.viewed", data: { object: { id: "sig-1", object: "signature", document: "doc-1" } } } };
    expect(acharIdDoDocumento(payload)).toBe("doc-1");
  });

  it("evento de membro nao tem documento", () => {
    expect(acharIdDoDocumento({ event: { type: "member.created", data: { object: { object: "member" } } } })).toBeNull();
    expect(acharIdDoDocumento({})).toBeNull();
  });
});

describe("montarLinha", () => {
  it("monta a linha com cliente casado e signatarios", () => {
    const linha = montarLinha(
      {
        id: "doc-1",
        name: "Contrato HERTZ",
        created_at: "2026-09-01T10:00:00Z",
        signatures: [assinatura({ signed: "2026-09-02T10:00:00Z" })],
        files: { original: "o.pdf", signed: "s.pdf" },
      },
      CARTEIRA
    );
    expect(linha.client_id).toBe("hertz");
    expect(linha.status).toBe("assinado");
    expect(linha.signatarios[0].assinado_em).toBe("2026-09-02T10:00:00Z");
  });
});
