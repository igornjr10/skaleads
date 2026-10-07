import { describe, it, expect } from "vitest";
import { montarPipelineSetores, ocorrenciasNoPeriodo, SEM_SETOR, type RotinaDoSetor } from "./pipeline-setores";

function rotina(over: Partial<RotinaDoSetor>): RotinaDoSetor {
  return {
    id: "r1",
    titulo: "Subir campanhas",
    equipe_id: "trafego",
    assigned_to: "ana",
    client_id: null,
    prioridade: "moderada",
    horario_limite: null,
    ativa: true,
    periodicidade: "diaria",
    dias_semana: null,
    dia_mes: null,
    data_pontual: null,
    ...over,
  };
}

const SETORES = [
  { id: "trafego", nome: "Tráfego", ordem: 1 },
  { id: "design", nome: "Design", ordem: 2 },
];

// 2026-10-05 e segunda-feira.
describe("ocorrenciasNoPeriodo", () => {
  it("diaria vence todo dia do periodo", () => {
    expect(ocorrenciasNoPeriodo([rotina({})], [], "2026-10-05", "2026-10-11")).toHaveLength(7);
  });

  it("le o status da baixa daquele dia e assume pendente sem baixa", () => {
    const lista = ocorrenciasNoPeriodo(
      [rotina({})],
      [{ rotina_id: "r1", data_ref: "2026-10-07", status: "andamento", mover_para: null }],
      "2026-10-07",
      "2026-10-08",
    );
    expect(lista.map((o) => o.status)).toEqual(["andamento", "pendente"]);
  });

  it("remanejada sai do dia original e entra no dia novo", () => {
    const semanal = rotina({ periodicidade: "semanal", dias_semana: [1] });
    const exec = [{ rotina_id: "r1", data_ref: "2026-10-05", status: "pendente" as const, mover_para: "2026-10-07" }];
    expect(ocorrenciasNoPeriodo([semanal], exec, "2026-10-05", "2026-10-05")).toHaveLength(0);
    const hoje = ocorrenciasNoPeriodo([semanal], exec, "2026-10-07", "2026-10-07");
    expect(hoje).toHaveLength(1);
    expect(hoje[0]).toMatchObject({ dataRef: "2026-10-05", dia: "2026-10-07" });
  });

  it("ignora rotina inativa", () => {
    expect(ocorrenciasNoPeriodo([rotina({ ativa: false })], [], "2026-10-07", "2026-10-07")).toHaveLength(0);
  });
});

describe("montarPipelineSetores", () => {
  it("conta por status e lista os responsaveis do setor", () => {
    const rotinas = [
      rotina({ id: "r1", assigned_to: "ana" }),
      rotina({ id: "r2", assigned_to: "bia" }),
      rotina({ id: "r3", equipe_id: "design", assigned_to: "caio" }),
    ];
    const exec = [{ rotina_id: "r1", data_ref: "2026-10-07", status: "concluida" as const, mover_para: null }];
    const [trafego, design] = montarPipelineSetores(SETORES, ocorrenciasNoPeriodo(rotinas, exec, "2026-10-07", "2026-10-07"));
    expect(trafego).toMatchObject({ nome: "Tráfego", pendente: 1, andamento: 0, concluida: 1, total: 2 });
    expect(trafego.responsaveis.sort()).toEqual(["ana", "bia"]);
    expect(design).toMatchObject({ total: 1, responsaveis: ["caio"] });
  });

  it("setor vazio aparece zerado; sem setor so quando tem rotina", () => {
    const so = montarPipelineSetores(SETORES, []);
    expect(so.map((s) => s.id)).toEqual(["trafego", "design"]);

    const comSolta = montarPipelineSetores(
      SETORES,
      ocorrenciasNoPeriodo([rotina({ equipe_id: null })], [], "2026-10-07", "2026-10-07"),
    );
    expect(comSolta.at(-1)).toMatchObject({ id: SEM_SETOR, total: 1 });
  });

  it("rotina de equipe excluida cai em sem setor", () => {
    const lista = montarPipelineSetores(SETORES, ocorrenciasNoPeriodo([rotina({ equipe_id: "apagada" })], [], "2026-10-07", "2026-10-07"));
    expect(lista.find((s) => s.id === SEM_SETOR)?.total).toBe(1);
  });
});
