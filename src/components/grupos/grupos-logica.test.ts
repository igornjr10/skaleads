import { describe, expect, it } from "vitest";
import {
  FILTROS_PADRAO,
  SEM_RESPONSAVEL,
  contar,
  espera,
  filtrarLinhas,
  filtrosAtivos,
  iniciais,
  montarLinhas,
  ordenarLinhas,
  triagemMaisRecente,
  type ClienteGrupo,
  type Triagem,
} from "./grupos-logica";

const AGORA = new Date("2026-10-12T15:00:00Z").getTime();

function triagem(parcial: Partial<Triagem> & { client_id: string }): Triagem {
  return {
    id: Math.random().toString(),
    dia: "2026-10-12",
    mensagens: 3,
    participantes: 2,
    ultima_mensagem: "oi",
    ultima_de: "Ana",
    ultima_em: "2026-10-12T14:00:00Z",
    ultima_da_agencia: false,
    cobrancas: 0,
    perguntas_abertas: [],
    sinais: [],
    horas_sem_resposta: null,
    atencao: "ok",
    gerado_em: "2026-10-12T14:05:00Z",
    ...parcial,
  };
}

const clientes: ClienteGrupo[] = [
  { id: "a", name: "Ótica Sol", logo_url: null, whatsapp_group_jid: "g1" },
  { id: "b", name: "Padaria Pão", logo_url: null, whatsapp_group_jid: "g2" },
  { id: "c", name: "Clínica Zeta", logo_url: null, whatsapp_group_jid: null },
];
const grupos = [
  { id: "g1", subject: "Sol | Agência" },
  { id: "g2", subject: "Pão & Cia" },
  { id: "g9", subject: "Grupo solto" },
];
const triagens = triagemMaisRecente([
  triagem({ client_id: "a", dia: "2026-10-11", atencao: "ok" }),
  triagem({ client_id: "a", atencao: "urgente", horas_sem_resposta: 5 }),
  triagem({ client_id: "b", ultima_em: "2026-10-01T10:00:00Z", atencao: "atencao", horas_sem_resposta: 30 }),
]);
const responsaveis = new Map([["a", [{ id: "u1", nome: "João Gestor" }]]]);
const linhas = montarLinhas(clientes, triagens, grupos, responsaveis);

describe("montarLinhas", () => {
  it("separa vinculado, cliente sem grupo e grupo sem cliente", () => {
    expect(linhas.map(l => [l.chave, l.situacao])).toEqual([
      ["c:a", "vinculado"],
      ["c:b", "vinculado"],
      ["c:c", "sem_grupo"],
      ["g:g9", "sem_cliente"],
    ]);
    expect(linhas[0].nomeGrupo).toBe("Sol | Agência");
    expect(linhas[0].triagem?.atencao).toBe("urgente");
  });

  it("sem lista do WhatsApp nao inventa grupo sem cliente", () => {
    const so = montarLinhas(clientes, triagens, null, responsaveis);
    expect(so.some(l => l.situacao === "sem_cliente")).toBe(false);
    expect(so[0].nomeGrupo).toBeNull();
  });
});

describe("filtrarLinhas", () => {
  const todas = { ...FILTROS_PADRAO, situacao: "todas" as const };

  it("busca por grupo, cliente e responsavel ignorando acento", () => {
    expect(filtrarLinhas(linhas, { ...todas, busca: "otica" }, AGORA).map(l => l.chave)).toEqual(["c:a"]);
    expect(filtrarLinhas(linhas, { ...todas, busca: "& cia" }, AGORA).map(l => l.chave)).toEqual(["c:b"]);
    expect(filtrarLinhas(linhas, { ...todas, busca: "joao" }, AGORA).map(l => l.chave)).toEqual(["c:a"]);
  });

  it("filtra por responsavel e por sem responsavel", () => {
    expect(filtrarLinhas(linhas, { ...todas, responsavelId: "u1" }, AGORA).map(l => l.chave)).toEqual(["c:a"]);
    expect(filtrarLinhas(linhas, { ...todas, responsavelId: SEM_RESPONSAVEL }, AGORA).map(l => l.chave))
      .toEqual(["c:b", "c:c"]);
  });

  it("filtra por atividade", () => {
    const ativ = (atividade: typeof FILTROS_PADRAO.atividade) =>
      filtrarLinhas(linhas, { ...todas, atividade }, AGORA).map(l => l.chave);
    expect(ativ("recente")).toEqual(["c:a"]);
    expect(ativ("esperando")).toEqual(["c:a", "c:b"]);
    expect(ativ("urgente")).toEqual(["c:a"]);
    expect(ativ("sem_leitura")).toEqual([]);
  });

  it("padrao mostra so vinculados", () => {
    expect(filtrarLinhas(linhas, FILTROS_PADRAO, AGORA)).toHaveLength(2);
  });
});

describe("ordenarLinhas", () => {
  it("vinculado urgente primeiro, grupo sem cliente por ultimo", () => {
    const ordem = ordenarLinhas([...linhas].reverse()).map(l => l.chave);
    expect(ordem).toEqual(["c:a", "c:b", "c:c", "g:g9"]);
  });
});

describe("contar", () => {
  it("conta grupos e atividade", () => {
    expect(contar(linhas, true, AGORA)).toEqual({
      total: 3, vinculados: 2, semCliente: 1, semGrupo: 1, recentes: 1, esperando: 2,
    });
  });

  it("sem lista do WhatsApp o total fica desconhecido", () => {
    expect(contar(linhas, false, AGORA).semCliente).toBeNull();
  });
});

describe("auxiliares", () => {
  it("espera e iniciais", () => {
    expect(espera(3.5)).toBe("3,5h");
    expect(espera(50)).toBe("2 dias");
    expect(iniciais("Maria da Silva")).toBe("MS");
    expect(iniciais("")).toBe("?");
  });

  it("filtrosAtivos", () => {
    expect(filtrosAtivos(FILTROS_PADRAO)).toBe(false);
    expect(filtrosAtivos({ ...FILTROS_PADRAO, busca: "x" })).toBe(true);
  });
});
