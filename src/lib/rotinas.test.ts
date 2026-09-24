import { describe, it, expect } from "vitest";
import {
  descreverRegra,
  diaEfetivoDoMes,
  isoLocal,
  ocorrenciasNoIntervalo,
  venceEm,
} from "./rotinas";

const diaria = { periodicidade: "diaria", dias_semana: null, dia_mes: null };
const todaSegunda = { periodicidade: "semanal", dias_semana: [1], dia_mes: null };
const segQuaSex = { periodicidade: "semanal", dias_semana: [1, 3, 5], dia_mes: null };
const todoDia31 = { periodicidade: "mensal", dias_semana: null, dia_mes: 31 };
const todoDia5 = { periodicidade: "mensal", dias_semana: null, dia_mes: 5 };

describe("venceEm", () => {
  it("rotina diaria vence em qualquer data", () => {
    expect(venceEm(diaria, new Date(2026, 8, 16))).toBe(true);
    expect(venceEm(diaria, new Date(2026, 8, 20))).toBe(true);
  });

  it("rotina semanal vence so no dia da semana escolhido", () => {
    // 2026-09-14 e uma segunda; 2026-09-15, terca.
    expect(venceEm(todaSegunda, new Date(2026, 8, 14))).toBe(true);
    expect(venceEm(todaSegunda, new Date(2026, 8, 15))).toBe(false);
  });

  it("rotina mensal vence no dia do mes escolhido", () => {
    expect(venceEm(todoDia5, new Date(2026, 8, 5))).toBe(true);
    expect(venceEm(todoDia5, new Date(2026, 8, 6))).toBe(false);
  });

  it("dia 31 desliza para o ultimo dia nos meses curtos", () => {
    // Fevereiro de 2026 tem 28 dias: a ocorrencia cai no dia 28, nao some.
    expect(venceEm(todoDia31, new Date(2026, 1, 28))).toBe(true);
    expect(venceEm(todoDia31, new Date(2026, 1, 27))).toBe(false);
    // Abril tem 30.
    expect(venceEm(todoDia31, new Date(2026, 3, 30))).toBe(true);
    // Em mes de 31 dias continua no 31.
    expect(venceEm(todoDia31, new Date(2026, 4, 31))).toBe(true);
    expect(venceEm(todoDia31, new Date(2026, 4, 30))).toBe(false);
  });
});

describe("diaEfetivoDoMes", () => {
  it("nao passa do tamanho do mes", () => {
    expect(diaEfetivoDoMes(31, new Date(2026, 1, 10))).toBe(28);
    expect(diaEfetivoDoMes(31, new Date(2024, 1, 10))).toBe(29); // bissexto
    expect(diaEfetivoDoMes(15, new Date(2026, 1, 10))).toBe(15);
  });
});

describe("isoLocal", () => {
  it("usa o fuso local, nao UTC", () => {
    // 23h de 16/09 no fuso local: toISOString() devolveria 17/09 em BRT.
    expect(isoLocal(new Date(2026, 8, 16, 23, 30))).toBe("2026-09-16");
  });

  it("preenche mes e dia com zero a esquerda", () => {
    expect(isoLocal(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
});

describe("ocorrenciasNoIntervalo", () => {
  it("lista todos os dias para rotina diaria, inclusive as pontas", () => {
    const datas = ocorrenciasNoIntervalo(diaria, new Date(2026, 8, 14), new Date(2026, 8, 16));
    expect(datas).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
  });

  it("lista so as segundas numa janela de duas semanas", () => {
    const datas = ocorrenciasNoIntervalo(todaSegunda, new Date(2026, 8, 14), new Date(2026, 8, 27));
    expect(datas).toEqual(["2026-09-14", "2026-09-21"]);
  });

  it("devolve vazio quando a rotina nao vence na janela", () => {
    const datas = ocorrenciasNoIntervalo(todoDia5, new Date(2026, 8, 10), new Date(2026, 8, 20));
    expect(datas).toEqual([]);
  });
});

describe("descreverRegra", () => {
  it("descreve cada periodicidade em portugues", () => {
    expect(descreverRegra(diaria)).toBe("Todo dia");
    expect(descreverRegra(todaSegunda)).toBe("Toda segunda");
    expect(descreverRegra(todoDia5)).toBe("Todo dia 5 do mês");
  });
});

describe("rotina semanal com varios dias", () => {
  // O caso que motivou o array: conferir conta de cliente as segundas, quartas
  // e sextas exigia tres rotinas iguais, e a aderencia ficava repartida.
  it("vence em cada dia marcado e so neles", () => {
    const semana = [
      { data: new Date(2026, 8, 20), dia: "domingo", esperado: false },
      { data: new Date(2026, 8, 21), dia: "segunda", esperado: true },
      { data: new Date(2026, 8, 22), dia: "terca", esperado: false },
      { data: new Date(2026, 8, 23), dia: "quarta", esperado: true },
      { data: new Date(2026, 8, 24), dia: "quinta", esperado: false },
      { data: new Date(2026, 8, 25), dia: "sexta", esperado: true },
      { data: new Date(2026, 8, 26), dia: "sabado", esperado: false },
    ];

    for (const { data, dia, esperado } of semana) {
      expect(venceEm(segQuaSex, data), dia).toBe(esperado);
    }
  });

  it("gera uma ocorrencia por dia marcado no intervalo", () => {
    const datas = ocorrenciasNoIntervalo(segQuaSex, new Date(2026, 8, 21), new Date(2026, 8, 27));
    expect(datas).toEqual(["2026-09-21", "2026-09-23", "2026-09-25"]);
  });

  it("descreve os dias de forma legivel", () => {
    expect(descreverRegra(segQuaSex)).toBe("Seg, Qua e Sex");
    expect(descreverRegra(todaSegunda)).toBe("Toda segunda");
  });

  // Array vazio faria a rotina nunca vencer em silencio; o CHECK do banco
  // tambem barra, mas a tela nao pode depender disso para nao enganar.
  it("nao vence com lista vazia nem nula", () => {
    const vazia = { periodicidade: "semanal", dias_semana: [], dia_mes: null };
    const nula = { periodicidade: "semanal", dias_semana: null, dia_mes: null };
    expect(venceEm(vazia, new Date(2026, 8, 21))).toBe(false);
    expect(venceEm(nula, new Date(2026, 8, 21))).toBe(false);
    expect(descreverRegra(vazia)).toBe("Semanal");
  });

  it("sete dias marcados e o mesmo que todo dia", () => {
    const todos = { periodicidade: "semanal", dias_semana: [0, 1, 2, 3, 4, 5, 6], dia_mes: null };
    expect(descreverRegra(todos)).toBe("Todo dia");
    expect(venceEm(todos, new Date(2026, 8, 20))).toBe(true);
  });
});
