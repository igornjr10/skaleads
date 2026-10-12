import { describe, expect, it } from "vitest";
import {
  acharPessoaPorNome, agruparPorDia, aguardaRegistro, dataUtcCompacta, deInputLocal, descricaoDaDemanda,
  duracaoLegivel, gerarIcs, juntarDecisoes, limparTranscricao, linkGoogleAgenda, nomeDoArquivoIcs,
  normalizarPrazo, paraAcoes, paraInputLocal, paraResumo, rotuloDoDia, separarReunioes, tituloDaDemanda,
} from "./reunioes";

describe("datas do calendario", () => {
  it("formata em UTC compacto", () => {
    expect(dataUtcCompacta(new Date("2026-10-12T13:05:09.123Z"))).toBe("20261012T130509Z");
  });

  it("monta o link do Google Agenda com inicio e fim em UTC", () => {
    const url = new URL(linkGoogleAgenda({
      titulo: "Alinhamento & metas",
      inicio: "2026-10-12T13:00:00.000Z",
      duracao_min: 45,
      detalhes: "Pauta: verba",
      local: "https://meet.google.com/abc-defg-hij",
    }));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Alinhamento & metas");
    expect(url.searchParams.get("dates")).toBe("20261012T130000Z/20261012T134500Z");
    expect(url.searchParams.get("details")).toBe("Pauta: verba");
    expect(url.searchParams.get("location")).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("omite detalhes e local vazios", () => {
    const url = new URL(linkGoogleAgenda({ titulo: "X", inicio: "2026-10-12T13:00:00Z", duracao_min: 60 }));
    expect(url.searchParams.has("details")).toBe(false);
    expect(url.searchParams.has("location")).toBe(false);
  });

  it("gera .ics com escape e linhas dobradas", () => {
    const ics = gerarIcs({
      uid: "r1@hub",
      titulo: "Reunião, mensal; cliente",
      inicio: "2026-10-12T13:00:00Z",
      duracao_min: 90,
      detalhes: `Linha 1\nLinha 2 ${"x".repeat(100)}`,
      local: "Sala 2",
    }, new Date("2026-10-01T00:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261012T130000Z");
    expect(ics).toContain("DTEND:20261012T143000Z");
    expect(ics).toContain("DTSTAMP:20261001T000000Z");
    expect(ics).toContain("SUMMARY:Reunião\\, mensal\\; cliente");
    expect(ics).toContain("DESCRIPTION:Linha 1\\nLinha 2");
    expect(ics).toContain("\r\n ");
    for (const linha of ics.split("\r\n")) expect(new TextEncoder().encode(linha).length).toBeLessThanOrEqual(75);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("nome de arquivo sem acento nem simbolo", () => {
    expect(nomeDoArquivoIcs("Reunião: Ótica São João!")).toBe("reuniao-otica-sao-joao.ics");
    expect(nomeDoArquivoIcs("###")).toBe("reuniao.ics");
  });

  it("ida e volta do datetime-local", () => {
    const iso = deInputLocal("2026-10-12T09:30");
    expect(iso).not.toBeNull();
    expect(paraInputLocal(iso!)).toBe("2026-10-12T09:30");
    expect(deInputLocal("")).toBeNull();
  });

  it("duracao legivel", () => {
    expect(duracaoLegivel(30)).toBe("30 min");
    expect(duracaoLegivel(60)).toBe("1h");
    expect(duracaoLegivel(90)).toBe("1h30");
  });
});

describe("agenda", () => {
  const agora = new Date(2026, 9, 12, 10, 0);
  const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
  const base = { duracao_min: 60 };

  it("separa proximas (agendadas que nao acabaram) do historico", () => {
    const lista = [
      { id: "a", status: "agendada" as const, inicio: local(13, 9), ...base },
      { id: "b", status: "agendada" as const, inicio: local(12, 9, 30), ...base },
      { id: "c", status: "agendada" as const, inicio: local(11, 9), ...base },
      { id: "d", status: "realizada" as const, inicio: local(10, 9), ...base },
      { id: "e", status: "cancelada" as const, inicio: local(14, 9), ...base },
    ];
    const { proximas, historico } = separarReunioes(lista, agora);
    expect(proximas.map(r => r.id)).toEqual(["b", "a"]);
    expect(historico.map(r => r.id)).toEqual(["e", "c", "d"]);
  });

  it("agendada que ja passou aguarda registro", () => {
    expect(aguardaRegistro({ status: "agendada", inicio: local(11, 9), duracao_min: 60 }, agora)).toBe(true);
    expect(aguardaRegistro({ status: "realizada", inicio: local(11, 9), duracao_min: 60 }, agora)).toBe(false);
    expect(aguardaRegistro({ status: "agendada", inicio: local(12, 9, 30), duracao_min: 60 }, agora)).toBe(false);
  });

  it("agrupa por dia local marcando hoje", () => {
    const grupos = agruparPorDia([
      { inicio: local(12, 8) }, { inicio: local(12, 23, 30) }, { inicio: local(13, 0, 15) },
    ], agora);
    expect(grupos.map(g => [g.dia, g.itens.length, g.hoje, g.rotulo])).toEqual([
      ["2026-10-12", 2, true, "Hoje"],
      ["2026-10-13", 1, false, "Amanhã"],
    ]);
  });

  it("rotulo de dia distante traz a data", () => {
    expect(rotuloDoDia("2026-10-11", agora)).toBe("Ontem");
    expect(rotuloDoDia("2026-10-20", agora)).toMatch(/20/);
    expect(rotuloDoDia("2027-01-05", agora)).toMatch(/2027/);
  });
});

describe("transcricao", () => {
  it("limpa VTT com vozes, tags e repeticao", () => {
    const vtt = `WEBVTT
Kind: captions

NOTE comentario qualquer

1
00:00:01.000 --> 00:00:03.000 align:start
<v Ana>Bom dia, <b>pessoal</b>.</v>

2
00:00:03.500 --> 00:00:05.000
<v Ana>Vamos falar da verba.</v>

00:00:05.000 --> 00:00:07.000
<v.loud Bruno>Fechado &amp; combinado.</v>

00:00:07.000 --> 00:00:08.000
<v.loud Bruno>Fechado &amp; combinado.</v>
`;
    expect(limparTranscricao(vtt)).toBe("Ana: Bom dia, pessoal. Vamos falar da verba.\nBruno: Fechado & combinado.");
  });

  it("limpa SRT", () => {
    const srt = "1\r\n00:00:01,000 --> 00:00:02,500\r\nPrimeira fala\r\ncontinua\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nSegunda\r\n";
    expect(limparTranscricao(srt)).toBe("Primeira fala continua Segunda");
  });

  it("texto comum volta como veio", () => {
    expect(limparTranscricao("﻿  Ana: oi\r\nBruno: ola  ")).toBe("Ana: oi\nBruno: ola");
  });
});

describe("acoes e demandas", () => {
  it("le acoes do jsonb descartando lixo", () => {
    const acoes = paraAcoes([
      { id: "1", texto: "Subir campanha", responsavel_id: "u1", prazo: "2026-10-20", feito: true, task_id: "t1" },
      { texto: "Sem id", prazo: "amanha" },
      { foo: "bar" },
      null,
    ]);
    expect(acoes).toHaveLength(2);
    expect(acoes[0]).toEqual({ id: "1", texto: "Subir campanha", responsavel_id: "u1", prazo: "2026-10-20", feito: true, task_id: "t1" });
    expect(acoes[1].id).toBeTruthy();
    expect(acoes[1].prazo).toBeNull();
    expect(acoes[1].feito).toBe(false);
    expect(paraAcoes("x")).toEqual([]);
  });

  it("descricao aponta para a reuniao", () => {
    const d = descricaoDaDemanda({ texto: "Enviar proposta" }, { id: "r9", titulo: "Mensal", inicio: "2026-10-12T15:00:00Z" }, { cliente: "Loja X", origem: "https://app" });
    expect(d).toContain("Enviar proposta");
    expect(d).toContain('"Mensal"');
    expect(d).toContain("com Loja X");
    expect(d).toContain("https://app/reunioes?reuniao=r9");
  });

  it("titulo da demanda corta na palavra", () => {
    expect(tituloDaDemanda("  curto  ")).toBe("curto");
    const t = tituloDaDemanda("palavra ".repeat(30), 50);
    expect(t.length).toBeLessThanOrEqual(50);
    expect(t.endsWith("…")).toBe(true);
  });

  it("junta decisoes sem repetir", () => {
    expect(juntarDecisoes("- Aumentar verba", ["aumentar verba", "Trocar criativo", " "])).toBe("- Aumentar verba\n- Trocar criativo");
    expect(juntarDecisoes(null, ["A"])).toBe("- A");
  });

  it("normaliza prazo sugerido", () => {
    expect(normalizarPrazo("2026-10-15")).toBe("2026-10-15");
    expect(normalizarPrazo("5/1/2027")).toBe("2027-01-05");
    expect(normalizarPrazo("semana que vem")).toBeNull();
    expect(normalizarPrazo(null)).toBeNull();
  });

  it("acha pessoa pelo nome sugerido", () => {
    const pessoas = [{ id: "1", nome: "João Silva" }, { id: "2", nome: "Maria Souza" }, { id: "3", nome: "Maria Lima" }];
    expect(acharPessoaPorNome("joao silva", pessoas)).toBe("1");
    expect(acharPessoaPorNome("João", pessoas)).toBe("1");
    expect(acharPessoaPorNome("Maria", pessoas)).toBeNull();
    expect(acharPessoaPorNome(null, pessoas)).toBeNull();
  });

  it("le resposta da IA tolerando forma errada", () => {
    expect(paraResumo(null)).toEqual({ resumo: "", decisoes: [], acoes: [], pendencias: [] });
    const r = paraResumo({ resumo: "ok", decisoes: ["a", 1], acoes: [{ texto: "x", responsavel_sugerido: "Ana" }, { y: 1 }], pendencias: "z" });
    expect(r.decisoes).toEqual(["a"]);
    expect(r.acoes).toEqual([{ texto: "x", responsavel_sugerido: "Ana", prazo_sugerido: null }]);
    expect(r.pendencias).toEqual([]);
  });
});
