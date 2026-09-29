import { describe, expect, it } from "vitest";
import {
  type Atividade, type Etapa, type Lead,
  contagemPorEtapa, followUpPendente, funilAcumulado, motivosDePerda, posicaoEntre,
  produtividadePorPessoa, reuniaoFutura, reuniaoHoje, taxaDeGanho,
} from "./comercial";

const etapas: Etapa[] = [
  { id: "e1", funil_id: "f", nome: "Lead", posicao: 1, tipo: "aberta" },
  { id: "e2", funil_id: "f", nome: "Reunião", posicao: 2, tipo: "aberta" },
  { id: "e3", funil_id: "f", nome: "Proposta", posicao: 3, tipo: "aberta" },
  { id: "eg", funil_id: "f", nome: "Fechado", posicao: 4, tipo: "ganho" },
  { id: "ep", funil_id: "f", nome: "Perdido", posicao: 5, tipo: "perdido" },
];

function lead(parcial: Partial<Lead>): Lead {
  return {
    id: Math.random().toString(36).slice(2), funil_id: "f", etapa_id: "e1", client_id: null, empresa: null,
    contato_nome: "x", cargo: null, telefone: null, whatsapp: null, instagram: null, email: null, segmento: null,
    cidade: null, origem: null, canal: "sdr", responsavel_id: null, closer_id: null, valor_estimado: null,
    proximo_contato_em: null, reuniao_em: null, motivo_perda: null, observacoes: null, ganho_em: null,
    perdido_em: null, convertido_client_id: null, posicao: 0, created_by: null, created_at: "2026-09-01T00:00:00Z",
    ...parcial,
  };
}

function atividade(autor: string, tipo: string, quando = "2026-09-20T12:00:00Z"): Atividade {
  return { id: Math.random().toString(36).slice(2), lead_id: "l", autor_id: autor, tipo, canal: null, descricao: null, created_at: quando };
}

describe("funil", () => {
  const leads = [
    lead({ etapa_id: "e1" }), lead({ etapa_id: "e1" }), lead({ etapa_id: "e2" }),
    lead({ etapa_id: "e3" }), lead({ etapa_id: "eg", ganho_em: "2026-09-10" }),
    lead({ etapa_id: "ep", perdido_em: "2026-09-10" }),
  ];

  it("conta por etapa na ordem do funil", () => {
    expect(contagemPorEtapa(etapas, leads).map(c => c.total)).toEqual([2, 1, 1, 1, 1]);
  });

  it("acumulado: quem chegou pelo menos ate cada etapa, sem os perdidos", () => {
    expect(funilAcumulado(etapas, leads)).toEqual([
      { nome: "Lead", total: 5 },
      { nome: "Reunião", total: 3 },
      { nome: "Proposta", total: 2 },
      { nome: "Fechado", total: 1 },
    ]);
  });

  it("taxa de ganho so entre os encerrados", () => {
    expect(taxaDeGanho(leads)).toBe(0.5);
    expect(taxaDeGanho([lead({})])).toBeNull();
  });
});

describe("agenda do lead", () => {
  const agora = new Date("2026-09-20T15:00:00");
  it("follow-up de hoje ou atrasado esta pendente; de amanha nao", () => {
    expect(followUpPendente(lead({ proximo_contato_em: "2026-09-20T23:00:00" }), agora)).toBe(true);
    expect(followUpPendente(lead({ proximo_contato_em: "2026-09-18T10:00:00" }), agora)).toBe(true);
    expect(followUpPendente(lead({ proximo_contato_em: "2026-09-21T09:00:00" }), agora)).toBe(false);
  });
  it("lead encerrado nao cobra follow-up", () => {
    expect(followUpPendente(lead({ proximo_contato_em: "2026-09-18T10:00:00", ganho_em: "2026-09-19" }), agora)).toBe(false);
  });
  it("reuniao de hoje e futura", () => {
    expect(reuniaoHoje(lead({ reuniao_em: "2026-09-20T09:00:00" }), agora)).toBe(true);
    expect(reuniaoFutura(lead({ reuniao_em: "2026-09-22T09:00:00" }), agora)).toBe(true);
    expect(reuniaoFutura(lead({ reuniao_em: "2026-09-20T18:00:00" }), agora)).toBe(false);
  });
});

describe("produtividadePorPessoa", () => {
  it("separa por autor e so conta o periodo", () => {
    const mapa = produtividadePorPessoa([
      atividade("ana", "ligacao"),
      atividade("ana", "ligacao_nao_atendida"),
      atividade("ana", "mensagem"),
      atividade("ana", "nota"),
      atividade("ana", "etapa"),
      atividade("ana", "reuniao_marcada"),
      atividade("ana", "mensagem", "2026-08-01T00:00:00Z"),
      atividade("bia", "proposta"),
    ], new Date("2026-09-01T00:00:00Z"));
    expect(mapa.get("ana")).toMatchObject({
      contatos: 4, ligacoes: 2, ligacoesAtendidas: 1, mensagens: 1, reunioesMarcadas: 1,
    });
    expect(mapa.get("bia")).toMatchObject({ contatos: 1, propostas: 1 });
  });
});

describe("motivosDePerda", () => {
  it("agrupa e ordena, com os sem motivo juntos", () => {
    expect(motivosDePerda([
      lead({ perdido_em: "x", motivo_perda: "Preço" }),
      lead({ perdido_em: "x", motivo_perda: "Preço" }),
      lead({ perdido_em: "x", motivo_perda: null }),
      lead({ motivo_perda: "Preço" }),
    ])).toEqual([{ motivo: "Preço", total: 2 }, { motivo: "Sem motivo informado", total: 1 }]);
  });
});

describe("posicaoEntre", () => {
  it("cabe entre dois, antes do primeiro e depois do ultimo", () => {
    expect(posicaoEntre(1, 2)).toBe(1.5);
    expect(posicaoEntre(null, 3)).toBe(2);
    expect(posicaoEntre(3, null)).toBe(4);
    expect(posicaoEntre(null, null)).toBe(0);
  });
});
