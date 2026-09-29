import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import {
  type Demanda,
  agruparPorResponsavel,
  diasDaSemana,
  diasDoMes,
  estaAtrasada,
  ordenarPorPrazo,
  progressoChecklist,
} from "./demandas";

function demanda(parcial: Partial<Demanda>): Demanda {
  return {
    id: Math.random().toString(36).slice(2),
    titulo: "x",
    descricao: null,
    client_id: null,
    status: "a_fazer",
    prioridade: "media",
    categoria: "outro",
    checklist: [],
    prazo: null,
    assigned_to: null,
    created_by: null,
    company_id: null,
    concluida_at: null,
    created_at: "2026-09-01T00:00:00Z",
    ...parcial,
  };
}

describe("estaAtrasada", () => {
  it("prazo no passado e ainda aberta", () => {
    expect(estaAtrasada({ status: "fazendo", prazo: "2026-09-10" }, "2026-09-11")).toBe(true);
  });
  it("prazo hoje nao e atraso", () => {
    expect(estaAtrasada({ status: "fazendo", prazo: "2026-09-11" }, "2026-09-11")).toBe(false);
  });
  it("concluida nunca atrasa; aprovada ainda pode atrasar", () => {
    expect(estaAtrasada({ status: "concluida", prazo: "2026-09-01" }, "2026-09-11")).toBe(false);
    expect(estaAtrasada({ status: "aprovado", prazo: "2026-09-01" }, "2026-09-11")).toBe(true);
  });
  it("sem prazo nao atrasa", () => {
    expect(estaAtrasada({ status: "a_fazer", prazo: null }, "2026-09-11")).toBe(false);
  });
});

describe("progressoChecklist", () => {
  it("conta feitos e total", () => {
    expect(progressoChecklist([
      { id: "1", texto: "a", feito: true },
      { id: "2", texto: "b", feito: false },
    ])).toEqual({ feitos: 1, total: 2 });
  });
  it("aguenta null e valor que nao e lista", () => {
    expect(progressoChecklist(null)).toEqual({ feitos: 0, total: 0 });
    expect(progressoChecklist({} as never)).toEqual({ feitos: 0, total: 0 });
  });
});

describe("ordenarPorPrazo", () => {
  it("prazo mais cedo primeiro, sem prazo no fim, urgencia desempata", () => {
    const lista = [
      demanda({ titulo: "sem prazo", prazo: null }),
      demanda({ titulo: "dia 20 media", prazo: "2026-09-20", prioridade: "media" }),
      demanda({ titulo: "dia 20 urgente", prazo: "2026-09-20", prioridade: "urgente" }),
      demanda({ titulo: "dia 10", prazo: "2026-09-10" }),
    ];
    expect(ordenarPorPrazo(lista).map(d => d.titulo)).toEqual([
      "dia 10", "dia 20 urgente", "dia 20 media", "sem prazo",
    ]);
  });
});

describe("agruparPorResponsavel", () => {
  it("separa por pessoa e junta as sem responsavel em null", () => {
    const grupos = agruparPorResponsavel([
      demanda({ assigned_to: "joao", prazo: "2026-09-20" }),
      demanda({ assigned_to: "pedro" }),
      demanda({ assigned_to: "joao", prazo: "2026-09-10" }),
      demanda({ assigned_to: null }),
    ]);
    expect(grupos.get("joao")?.map(d => d.prazo)).toEqual(["2026-09-10", "2026-09-20"]);
    expect(grupos.get("pedro")).toHaveLength(1);
    expect(grupos.get(null)).toHaveLength(1);
  });
});

describe("calendario", () => {
  it("mes em semanas cheias de segunda a domingo", () => {
    const dias = diasDoMes(new Date(2026, 8, 15)); // setembro/2026 comeca numa terca
    expect(dias.length % 7).toBe(0);
    expect(format(dias[0], "yyyy-MM-dd")).toBe("2026-08-31");
    expect(format(dias.at(-1)!, "yyyy-MM-dd")).toBe("2026-10-04");
  });
  it("semana comeca na segunda", () => {
    const dias = diasDaSemana(new Date(2026, 8, 17)); // quinta
    expect(dias.map(d => format(d, "yyyy-MM-dd"))).toEqual([
      "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20",
    ]);
  });
});
