import { describe, expect, it } from "vitest";
import {
  type AulaAcademia, type ModuloAcademia, type ProgressoAula,
  alternarIndice, checklistDeTexto, concluidasDe, formatarDuracao, lerChecklist, lerIndices, mover, ordenarPorOrdem,
  paraAula, paraModulo, paraProgresso, progressoDaEquipe, progressoDoModulo, progressoGeral, proximaOrdem, tabelaAusente,
  urlDeEmbed, vizinhas,
} from "./academia";

function aula(p: Partial<AulaAcademia>): AulaAcademia {
  return {
    id: "a1", modulo_id: "m1", titulo: "Aula", descricao: null, tipo: "video", url: null, conteudo: null,
    duracao_min: null, checklist: [], ordem: 1, created_at: "2026-10-01T00:00:00Z", ...p,
  };
}

function modulo(p: Partial<ModuloAcademia>): ModuloAcademia {
  return { id: "m1", titulo: "Módulo", descricao: null, categoria: "trafego", ordem: 1, created_at: "2026-10-01T00:00:00Z", ...p };
}

function prog(p: Partial<ProgressoAula>): ProgressoAula {
  return { aula_id: "a1", user_id: "u1", concluida_em: null, checklist_feitos: [], updated_at: "2026-10-05T00:00:00Z", ...p };
}

describe("urlDeEmbed", () => {
  it("YouTube watch, youtu.be, shorts e embed", () => {
    expect(urlDeEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(urlDeEmbed("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(urlDeEmbed("https://youtube.com/shorts/abc_DEF-123")).toBe("https://www.youtube.com/embed/abc_DEF-123");
    expect(urlDeEmbed("https://m.youtube.com/watch?v=xyz")).toBe("https://www.youtube.com/embed/xyz");
    expect(urlDeEmbed("https://www.youtube.com/embed/xyz")).toBe("https://www.youtube.com/embed/xyz");
  });

  it("Vimeo, com e sem hash privado", () => {
    expect(urlDeEmbed("https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789");
    expect(urlDeEmbed("https://vimeo.com/123456789/abcdef1234")).toBe("https://player.vimeo.com/video/123456789?h=abcdef1234");
    expect(urlDeEmbed("https://player.vimeo.com/video/42")).toBe("https://player.vimeo.com/video/42");
  });

  it("Drive vira /preview", () => {
    expect(urlDeEmbed("https://drive.google.com/file/d/1AbC_x-9/view?usp=sharing")).toBe("https://drive.google.com/file/d/1AbC_x-9/preview");
    expect(urlDeEmbed("https://drive.google.com/open?id=XYZ")).toBe("https://drive.google.com/file/d/XYZ/preview");
    expect(urlDeEmbed("https://drive.google.com/drive/folders/abc")).toBeNull();
  });

  it("Docs e Slides viram /preview", () => {
    expect(urlDeEmbed("https://docs.google.com/document/d/DOC1/edit#heading")).toBe("https://docs.google.com/document/d/DOC1/preview");
    expect(urlDeEmbed("https://docs.google.com/presentation/d/SL1/edit?usp=sharing")).toBe("https://docs.google.com/presentation/d/SL1/preview");
  });

  it("PDF direto embute; link generico e lixo nao", () => {
    expect(urlDeEmbed("https://site.com/manual.pdf")).toBe("https://site.com/manual.pdf");
    expect(urlDeEmbed("https://notion.so/pagina")).toBeNull();
    expect(urlDeEmbed("javascript:alert(1)")).toBeNull();
    expect(urlDeEmbed("não é url")).toBeNull();
    expect(urlDeEmbed(null)).toBeNull();
  });
});

describe("checklist", () => {
  it("le jsonb com seguranca", () => {
    expect(lerChecklist(["a", " b ", "", 3, null])).toEqual(["a", "b"]);
    expect(lerChecklist({})).toEqual([]);
    expect(lerIndices([2, 0, 2, -1, 1.5, "3"])).toEqual([0, 2]);
  });

  it("um item por linha, sem marcadores", () => {
    expect(checklistDeTexto("- Sei abrir o gerenciador\n\n* Sei ler o CPM\r\n  • Sei pausar  ")).toEqual([
      "Sei abrir o gerenciador", "Sei ler o CPM", "Sei pausar",
    ]);
  });

  it("alterna indice", () => {
    expect(alternarIndice([0, 2], 1)).toEqual([0, 1, 2]);
    expect(alternarIndice([0, 2], 2)).toEqual([0]);
  });
});

describe("ordenacao", () => {
  it("ordena por ordem, depois criacao", () => {
    const r = ordenarPorOrdem([
      aula({ id: "c", ordem: 2 }),
      aula({ id: "b", ordem: 1, created_at: "2026-10-02T00:00:00Z" }),
      aula({ id: "a", ordem: 1, created_at: "2026-10-01T00:00:00Z" }),
    ]);
    expect(r.map(x => x.id)).toEqual(["a", "b", "c"]);
  });

  it("mover devolve so o que mudou e renumera", () => {
    const itens = [aula({ id: "a", ordem: 1 }), aula({ id: "b", ordem: 2 }), aula({ id: "c", ordem: 3 })];
    expect(mover(itens, "c", -1)).toEqual([{ id: "c", ordem: 2 }, { id: "b", ordem: 3 }]);
    expect(mover(itens, "a", -1)).toEqual([]);
    expect(mover(itens, "c", 1)).toEqual([]);
    const grupo = [aula({ id: "a", ordem: 3 }), aula({ id: "b", ordem: 8 })];
    expect(mover(grupo, "a", 1)).toEqual([{ id: "a", ordem: 8 }, { id: "b", ordem: 3 }]);
    const repetidos = [aula({ id: "a", ordem: 0 }), aula({ id: "b", ordem: 0, created_at: "2026-10-02T00:00:00Z" })];
    expect(mover(repetidos, "a", 1)).toEqual([{ id: "b", ordem: 1 }, { id: "a", ordem: 2 }]);
  });

  it("proxima ordem", () => {
    expect(proximaOrdem([])).toBe(1);
    expect(proximaOrdem([{ ordem: 3 }, { ordem: 7 }])).toBe(8);
  });

  it("vizinhas dentro do modulo", () => {
    const aulas = [
      aula({ id: "a", ordem: 1 }), aula({ id: "b", ordem: 2 }), aula({ id: "c", ordem: 3 }),
      aula({ id: "x", modulo_id: "m2", ordem: 1 }),
    ];
    expect(vizinhas(aulas, "b")).toMatchObject({ anterior: { id: "a" }, proxima: { id: "c" } });
    expect(vizinhas(aulas, "a").anterior).toBeNull();
    expect(vizinhas(aulas, "x")).toEqual({ anterior: null, proxima: null });
  });
});

describe("progresso", () => {
  const aulas = [aula({ id: "a" }), aula({ id: "b" }), aula({ id: "c", modulo_id: "m2" })];
  const progresso = [
    prog({ aula_id: "a", user_id: "u1", concluida_em: "2026-10-06T00:00:00Z" }),
    prog({ aula_id: "b", user_id: "u1", concluida_em: null, updated_at: "2026-10-08T00:00:00Z" }),
    prog({ aula_id: "apagada", user_id: "u1", concluida_em: "2026-10-09T00:00:00Z", updated_at: "2026-10-09T00:00:00Z" }),
    prog({ aula_id: "c", user_id: "u2", concluida_em: "2026-10-07T00:00:00Z" }),
  ];

  it("por modulo e geral", () => {
    const c = concluidasDe(progresso, "u1");
    expect(progressoDoModulo(aulas, "m1", c)).toEqual({ concluidas: 1, total: 2, pct: 50 });
    expect(progressoDoModulo(aulas, "m3", c)).toEqual({ concluidas: 0, total: 0, pct: 0 });
    expect(progressoGeral(aulas, c)).toEqual({ concluidas: 1, total: 3, pct: 33 });
  });

  it("por pessoa, com ultima atividade ignorando aula apagada", () => {
    const modulos = [modulo({ id: "m1" }), modulo({ id: "m2" })];
    const r = progressoDaEquipe([{ id: "u1" }, { id: "u2" }, { id: "u3" }], modulos, aulas, progresso);
    expect(r[0].geral.pct).toBe(33);
    expect(r[0].ultimaAtividade).toBe("2026-10-08T00:00:00Z");
    expect(r[1].porModulo.m2).toEqual({ concluidas: 1, total: 1, pct: 100 });
    expect(r[1].ultimaAtividade).toBe("2026-10-07T00:00:00Z");
    expect(r[2]).toMatchObject({ geral: { pct: 0 }, ultimaAtividade: null });
  });
});

describe("formatarDuracao", () => {
  it("minutos e horas", () => {
    expect(formatarDuracao(null)).toBeNull();
    expect(formatarDuracao(45)).toBe("45 min");
    expect(formatarDuracao(60)).toBe("1h");
    expect(formatarDuracao(95)).toBe("1h35");
  });
});

describe("linhas do banco", () => {
  it("normaliza tipo, categoria e jsonb", () => {
    expect(paraAula({
      id: "a", modulo_id: "m", titulo: "t", descricao: null, tipo: "estranho", url: null, conteudo: null,
      duracao_min: null, checklist: ["x", 1], ordem: 1, created_at: "",
    })).toMatchObject({ tipo: "link", checklist: ["x"] });
    expect(paraModulo({ id: "m", titulo: "t", descricao: null, categoria: "?", ordem: 1, created_at: "" }).categoria).toBe("outro");
    expect(paraProgresso({ aula_id: "a", user_id: "u", concluida_em: null, checklist_feitos: null, updated_at: "" }).checklist_feitos).toEqual([]);
  });

  it("detecta tabela ausente", () => {
    expect(tabelaAusente({ code: "PGRST205" })).toBe(true);
    expect(tabelaAusente({ code: "42P01" })).toBe(true);
    expect(tabelaAusente({ code: "42501" })).toBe(false);
    expect(tabelaAusente(null)).toBe(false);
  });
});
