import { describe, expect, it } from "vitest";
import type { Demanda } from "./demandas";
import { analisarGargalos, cargaDaEquipe, pipelineDeDemandas } from "./gargalos";

const AGORA = Date.parse("2026-10-12T13:00:00Z");

function demanda(p: Partial<Demanda>): Demanda {
  return {
    id: "d1", titulo: "Peça", descricao: null, client_id: null, status: "a_fazer", prioridade: "media", categoria: "outro",
    checklist: [], prazo: null, assigned_to: "ana", created_by: "bia", company_id: "e1", concluida_at: null,
    created_at: "2026-10-11T12:00:00Z", updated_at: "2026-10-12T12:00:00Z",
    ...p,
  };
}

const pessoas = [
  { id: "ana", nome: "Ana", role: "designer" },
  { id: "caio", nome: "Caio", role: "designer" },
  { id: "bia", nome: "Bia", role: "analyst" },
];

function analisar(demandas: Demanda[], atencao = []) {
  return analisarGargalos({ hoje: "2026-10-12", agoraMs: AGORA, demandas, pessoas, nomeCliente: id => (id === "c1" ? "Loja" : null), atencao });
}

describe("analisarGargalos", () => {
  it("junta criativos atrasados do mesmo cliente", () => {
    const g = analisar([
      demanda({ id: "a", client_id: "c1", categoria: "criativo", prazo: "2026-10-10" }),
      demanda({ id: "b", client_id: "c1", categoria: "video", prazo: "2026-10-11" }),
    ]).find(x => x.id === "criativos|c1");
    expect(g?.gravidade).toBe("alta");
    expect(g?.demandas).toEqual(["a", "b"]);
  });

  it("sugere passar demandas para o colega da mesma funcao com folga", () => {
    const muitas = Array.from({ length: 13 }, (_, i) => demanda({ id: `d${i}` }));
    const g = analisar(muitas).find(x => x.id === "sobrecarga|ana");
    expect(g?.sugestao).toContain("Caio");
  });

  it("separa demanda parada de entrega esperando revisao", () => {
    const ids = analisar([
      demanda({ id: "p", updated_at: "2026-10-05T12:00:00Z" }),
      demanda({ id: "r", status: "revisao", updated_at: "2026-10-05T12:00:00Z" }),
      demanda({ id: "c", aguardando_cliente: true, client_id: "c1", updated_at: "2026-10-05T12:00:00Z" }),
    ]).map(g => g.id);
    expect(ids).toEqual(expect.arrayContaining(["parada|ana", "revisao|bia", "material|c1"]));
    expect(ids).not.toContain("parada|null");
  });

  it("acusa onboarding aberto ha mais de uma semana", () => {
    const g = analisar([demanda({ client_id: "c1", onboarding_fase: "acessos", created_at: "2026-09-25T12:00:00Z" })]);
    expect(g[0]).toMatchObject({ id: "onboarding|c1", gravidade: "alta" });
  });

  it("traz cliente com custo acima da meta como gargalo de alta", () => {
    const g = analisar([], [{ id: "c1", name: "Loja", motivos: ["custo_acima"] }] as never);
    expect(g[0]).toMatchObject({ id: "meta|c1", gravidade: "alta", link: "/clients/c1" });
  });
});

describe("carga e pipeline", () => {
  it("conta abertas, atrasadas e que vencem logo por pessoa", () => {
    const carga = cargaDaEquipe([
      demanda({ id: "a", prazo: "2026-10-10" }),
      demanda({ id: "b", prazo: "2026-10-13" }),
      demanda({ id: "c", status: "concluida" }),
    ], "2026-10-12", "2026-10-13");
    expect(carga).toEqual([{ pessoa: "ana", abertas: 2, atrasadas: 1, vencemLogo: 1, emRevisao: 0 }]);
  });

  it("monta um setor por categoria com movimento", () => {
    const setores = pipelineDeDemandas([
      demanda({ id: "a", categoria: "criativo", status: "fazendo" }),
      demanda({ id: "b", categoria: "criativo", status: "concluida", concluida_at: "2026-10-12T10:00:00Z" }),
      demanda({ id: "c", categoria: "trafego", status: "concluida", concluida_at: "2026-10-01T10:00:00Z" }),
    ], "2026-10-12", "2026-10-12");
    expect(setores.map(s => [s.id, s.andamento, s.concluidasSemana])).toEqual([["criativo", 1, 1]]);
  });
});
