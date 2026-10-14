import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import {
  type Demanda,
  agruparPorResponsavel,
  atalhosDeInicio,
  cargaPorPessoa,
  estaProgramada,
  diasDaSemana,
  diasDoMes,
  estaAtrasada,
  estaCom,
  idsDosClientes,
  ordenarPorPrazo,
  progressoChecklist,
  progressoClientes,
  type VinculosDemandas,
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

describe("vinculos de demanda", () => {
  const v: VinculosDemandas = {
    disponivel: true,
    clientes: new Map([["t1", [{ client_id: "a", feito: true }, { client_id: "b", feito: false }]]]),
    corresponsaveis: new Map([["t1", ["u2"]]]),
  };

  it("varios clientes vem da lista; um so vem de client_id", () => {
    expect(idsDosClientes({ id: "t1", client_id: null }, v)).toEqual(["a", "b"]);
    expect(idsDosClientes({ id: "t2", client_id: "c" }, v)).toEqual(["c"]);
    expect(idsDosClientes({ id: "t2", client_id: null }, v)).toEqual([]);
  });

  it("corresponsavel tambem esta com a demanda", () => {
    expect(estaCom({ id: "t1", assigned_to: "u1" }, "u2", v)).toBe(true);
    expect(estaCom({ id: "t1", assigned_to: "u1" }, "u1", v)).toBe(true);
    expect(estaCom({ id: "t1", assigned_to: "u1" }, "u3", v)).toBe(false);
    expect(estaCom({ id: "t1", assigned_to: "u1" }, undefined, v)).toBe(false);
  });

  it("progresso por cliente", () => {
    expect(progressoClientes({ id: "t1" }, v)).toEqual({ feitos: 1, total: 2 });
    expect(progressoClientes({ id: "t2" }, v)).toEqual({ feitos: 0, total: 0 });
  });
});

describe("estaProgramada", () => {
  it("inicio no futuro e aberta", () => {
    expect(estaProgramada({ status: "a_fazer", inicia_em: "2026-10-16" }, "2026-10-14")).toBe(true);
  });
  it("chega no dia de inicio", () => {
    expect(estaProgramada({ status: "a_fazer", inicia_em: "2026-10-14" }, "2026-10-14")).toBe(false);
  });
  it("sem inicio ou concluida nao e programada", () => {
    expect(estaProgramada({ status: "a_fazer", inicia_em: null }, "2026-10-14")).toBe(false);
    expect(estaProgramada({ status: "concluida", inicia_em: "2026-10-20" }, "2026-10-14")).toBe(false);
  });
});

describe("atalhosDeInicio", () => {
  it("amanha, daqui a 2 dias e a proxima segunda", () => {
    const [agora, amanha, dois, segunda] = atalhosDeInicio(new Date(2026, 9, 14)); // quarta
    expect(agora.data).toBeNull();
    expect(amanha.data).toBe("2026-10-15");
    expect(dois.data).toBe("2026-10-16");
    expect(segunda.data).toBe("2026-10-19");
  });
});

describe("cargaPorPessoa", () => {
  const hoje = "2026-10-14";
  const v: VinculosDemandas = {
    disponivel: true,
    clientes: new Map(),
    corresponsaveis: new Map([["c1", ["bia"]]]),
  };
  const lista = [
    demanda({ id: "a1", assigned_to: "ana", prazo: "2026-10-10" }),
    demanda({ id: "a2", assigned_to: "ana", prazo: hoje, status: "revisao" }),
    demanda({ id: "c1", assigned_to: "ana", prazo: "2026-10-20" }),
    demanda({ id: "p1", assigned_to: "bia", inicia_em: "2026-10-16" }),
    demanda({ id: "x1", assigned_to: "bia", status: "concluida" }),
    demanda({ id: "s1", assigned_to: null }),
  ];
  const carga = cargaPorPessoa(lista, v, hoje);
  const de = (id: string | null) => carga.find(c => c.id === id)!;

  it("conta atrasadas, de hoje e em revisao; corresponsavel tambem carrega", () => {
    expect(de("ana")).toMatchObject({ atrasadas: 1, hoje: 1, revisao: 1, programadas: 0 });
    expect(de("ana").abertas.map(d => d.id)).toEqual(["a1", "a2", "c1"]);
    expect(de("bia").abertas.map(d => d.id)).toEqual(["c1"]);
  });
  it("programada soma a parte e concluida nao entra", () => {
    expect(de("bia").programadas).toBe(1);
  });
  it("sem responsavel vai para a chave null; quem tem atrasada vem primeiro", () => {
    expect(de(null).abertas.map(d => d.id)).toEqual(["s1"]);
    expect(carga[0].id).toBe("ana");
  });
});
