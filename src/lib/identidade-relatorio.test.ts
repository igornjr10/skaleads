import { describe, expect, it } from "vitest";
import {
  type Assessoria,
  PALETA_PADRAO,
  PALETAS_SUGERIDAS,
  localDoCliente,
  normalizarNome,
  paletaDe,
  pendenciasDoCliente,
  reconhecerAssessoria,
  reconhecerCliente,
  resolverAssessoria,
  temaDaPaleta,
} from "./identidade-relatorio";

const vermelho = PALETAS_SUGERIDAS[1].paleta;

const marketing: Assessoria = {
  id: "mkt", nome: "Midsam Marketing", aliases: ["Mid Marketing"], logo_url: "https://x/mkt.png",
  cor_primaria: PALETA_PADRAO.primaria, cor_secundaria: PALETA_PADRAO.secundaria, cor_destaque: PALETA_PADRAO.destaque,
  cor_fundo: PALETA_PADRAO.fundo, cor_texto: PALETA_PADRAO.texto,
};
const log: Assessoria = {
  id: "log", nome: "Midsam Log", aliases: ["Mid Log", "MidLog"], logo_url: null,
  cor_primaria: vermelho.primaria, cor_secundaria: vermelho.secundaria, cor_destaque: vermelho.destaque,
  cor_fundo: vermelho.fundo, cor_texto: vermelho.texto,
};
const todas = [marketing, log];

describe("normalizarNome", () => {
  it("tira acento, caixa e pontuacao", () => {
    expect(normalizarNome("  Mídsam   LOG! ")).toBe("midsam log");
  });
});

describe("reconhecerAssessoria", () => {
  it("pelo nome oficial ou alias, sem acento e caixa", () => {
    expect(reconhecerAssessoria("relatório da MID LOG de setembro", todas)).toEqual({ tipo: "unico", item: log });
    expect(reconhecerAssessoria("Midsam Marketing", todas)).toEqual({ tipo: "unico", item: marketing });
    expect(reconhecerAssessoria("pela midlog", todas)).toEqual({ tipo: "unico", item: log });
  });
  it("so palavra inteira: 'logo' e 'Midsam' sozinho nao casam", () => {
    expect(reconhecerAssessoria("mande a logo da Midsam", todas)).toEqual({ tipo: "nenhum" });
  });
  it("as duas citadas e ambiguo", () => {
    expect(reconhecerAssessoria("Mid Log ou Mid Marketing?", todas).tipo).toBe("ambiguo");
  });
});

describe("resolverAssessoria", () => {
  it("1) escolhida para o relatorio vence o vinculo do cliente", () => {
    const r = resolverAssessoria({ assessorias: todas, escolhidaId: "log", doClienteId: "mkt" });
    expect(r).toMatchObject({ origem: "escolhida", conflito: null });
    expect(r.assessoria?.id).toBe("log");
  });
  it("2) sem escolha, vale o vinculo do cliente", () => {
    expect(resolverAssessoria({ assessorias: todas, doClienteId: "mkt" }).assessoria?.id).toBe("mkt");
  });
  it("3) sem escolha nem vinculo, o texto reconhecido", () => {
    const r = resolverAssessoria({ assessorias: todas, texto: "relatorio Mid Log" });
    expect(r).toMatchObject({ origem: "texto" });
    expect(r.assessoria?.id).toBe("log");
  });
  it("4) nada seguro: pendente, com as candidatas quando o texto cita varias", () => {
    expect(resolverAssessoria({ assessorias: todas }).origem).toBe("pendente");
    const r = resolverAssessoria({ assessorias: todas, texto: "mid log ou mid marketing" });
    expect(r.origem).toBe("pendente");
    expect(r.candidatas.map((a) => a.id).sort()).toEqual(["log", "mkt"]);
  });
  it("texto que contradiz a selecao vira conflito, sem trocar sozinho", () => {
    const r = resolverAssessoria({ assessorias: todas, doClienteId: "mkt", texto: "esse e da Mid Log" });
    expect(r.assessoria?.id).toBe("mkt");
    expect(r.conflito?.id).toBe("log");
  });
  it("vinculo apontando para assessoria apagada cai para o texto", () => {
    expect(resolverAssessoria({ assessorias: todas, doClienteId: "sumiu", texto: "mid log" }).assessoria?.id).toBe("log");
  });
});

describe("tema", () => {
  const azul = temaDaPaleta(paletaDe(marketing));
  const verm = temaDaPaleta(paletaDe(log));

  it("marketing e azul e delivery e vermelho, inclusive nos tons derivados", () => {
    const [r, , b] = [1, 3, 5].map((i) => parseInt(azul.capa1.slice(i, i + 2), 16));
    expect(b).toBeGreaterThan(r);
    for (const cor of [verm.primaria, verm.capa1, verm.capa2, verm.forte, verm.tinta]) {
      const [rr, , bb] = [1, 3, 5].map((i) => parseInt(cor.slice(i, i + 2), 16));
      expect(rr).toBeGreaterThan(bb);
    }
  });
  it("trocar de assessoria nao deixa nenhum tom do tema anterior", () => {
    const valoresAzuis = new Set(Object.values(azul));
    expect(Object.values(verm).filter((v) => valoresAzuis.has(v) && v !== "#ffffff")).toEqual([]);
  });
  it("cor invalida no cadastro cai na do padrao, uma a uma", () => {
    expect(paletaDe({ cor_primaria: "vermelho", cor_secundaria: "#ABCDEF" })).toMatchObject({
      primaria: PALETA_PADRAO.primaria,
      secundaria: "#abcdef",
    });
  });
});

describe("cliente", () => {
  const clientes = [
    { id: "1", name: "Pizzaria Bella", nome_relatorio: null },
    { id: "2", name: "Pizzaria Bella Vista", nome_relatorio: null },
    { id: "3", name: "Hamburgueria Zé", nome_relatorio: "Zé Burger" },
  ];
  it("reconhece pelo nome ou pelo nome do relatorio, sem acento", () => {
    expect(reconhecerCliente("relatorio do ze burger", clientes)).toMatchObject({ tipo: "unico", item: { id: "3" } });
  });
  it("nomes que se contem viram ambiguo, nunca palpite", () => {
    expect(reconhecerCliente("relatorio da Pizzaria Bella Vista", clientes).tipo).toBe("ambiguo");
  });
  it("lista exatamente o que falta e monta o local", () => {
    const c = { id: "1", name: "A", logo_url: null, city: "Campinas", state: "sp", business_segment: null, assessoria_id: null };
    expect(pendenciasDoCliente(c, log)).toEqual([
      "Logo do cliente não cadastrada",
      "Segmento não cadastrado",
      "Assessoria responsável não vinculada",
      "Logo da assessoria Midsam Log não cadastrada",
    ]);
    expect(localDoCliente(c)).toBe("Campinas/SP");
  });
});
