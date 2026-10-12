import { describe, expect, it } from "vitest";
import {
  FILTROS_INICIAIS, contarPorCategoria, detectarPlataforma, embedDoYoutube, faltaMigration, filtrarIdeias,
  idDoYoutube, normalizarTags, normalizarUrl, rotuloCategoria, rotuloPlataforma, rotuloTipo, sugerirTipoPorUrl,
  tipoDoArquivo, type IdeiaFiltravel,
} from "./biblioteca";

describe("normalizarUrl", () => {
  it("completa o protocolo e recusa texto que nao e link", () => {
    expect(normalizarUrl("instagram.com/p/abc")).toBe("https://instagram.com/p/abc");
    expect(normalizarUrl("  https://site.com.br/x ")).toBe("https://site.com.br/x");
    expect(normalizarUrl("ideia boa")).toBeNull();
    expect(normalizarUrl("")).toBeNull();
  });
});

describe("detectarPlataforma", () => {
  it.each([
    ["https://www.instagram.com/reel/Cx123/", "instagram"],
    ["https://vm.tiktok.com/ZM123/", "tiktok"],
    ["https://www.tiktok.com/@perfil/video/123", "tiktok"],
    ["https://youtu.be/dQw4w9WgXcQ", "youtube"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://www.facebook.com/ads/library/?id=1", "facebook"],
    ["https://fb.watch/abc", "facebook"],
    ["https://drive.google.com/file/d/123/view", "drive"],
    ["https://docs.google.com/presentation/d/123", "drive"],
    ["https://br.pinterest.com/pin/123", "pinterest"],
    ["https://pin.it/abc", "pinterest"],
    ["https://concorrente.com.br/oferta", "site"],
    ["nao e link", "outro"],
  ])("%s -> %s", (url, esperado) => {
    expect(detectarPlataforma(url)).toBe(esperado);
  });

  it("nao confunde dominio parecido", () => {
    expect(detectarPlataforma("https://notinstagram.com/x")).toBe("site");
  });
});

describe("idDoYoutube", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=x", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("%s", (url, id) => {
    expect(idDoYoutube(url)).toBe(id);
  });

  it("devolve null fora do YouTube ou sem id valido", () => {
    expect(idDoYoutube("https://www.youtube.com/@canal")).toBeNull();
    expect(idDoYoutube("https://vimeo.com/123")).toBeNull();
    expect(idDoYoutube(null)).toBeNull();
  });

  it("monta o embed", () => {
    expect(embedDoYoutube("dQw4w9WgXcQ")).toContain("/embed/dQw4w9WgXcQ");
  });
});

describe("sugerirTipoPorUrl", () => {
  it("reconhece reels, shorts e story", () => {
    expect(sugerirTipoPorUrl("https://instagram.com/reel/abc")).toBe("reels");
    expect(sugerirTipoPorUrl("https://instagram.com/stories/x/1")).toBe("story");
    expect(sugerirTipoPorUrl("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("reels");
    expect(sugerirTipoPorUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe("video");
    expect(sugerirTipoPorUrl("https://instagram.com/p/abc")).toBeNull();
  });
});

describe("rotulos e arquivos", () => {
  it("traduz valores e cai em Outro", () => {
    expect(rotuloPlataforma("drive")).toBe("Google Drive");
    expect(rotuloTipo("carrossel")).toBe("Carrossel");
    expect(rotuloCategoria("organico")).toBe("Orgânico");
    expect(rotuloCategoria("xyz")).toBe("Outro");
  });

  it("classifica arquivo por mime ou extensao", () => {
    expect(tipoDoArquivo("image/png")).toBe("imagem");
    expect(tipoDoArquivo("video/mp4")).toBe("video");
    expect(tipoDoArquivo(null, "clip.MOV")).toBe("video");
    expect(tipoDoArquivo("application/pdf", "a.pdf")).toBe("outro");
  });

  it("normaliza tags", () => {
    expect(normalizarTags("Black Friday, #oferta;  oferta\nUGC")).toEqual(["black friday", "oferta", "ugc"]);
  });
});

describe("filtrarIdeias", () => {
  const base: IdeiaFiltravel = {
    titulo: "", descricao: null, tags: [], client_id: null, plataforma: "site",
    tipo_criativo: "outro", categoria: "anuncio", favorita: false, created_by: null,
  };
  const ideias = [
    { ...base, titulo: "Gancho de promoção", tags: ["oferta"], client_id: "c1", plataforma: "instagram", favorita: true, created_by: "u1" },
    { ...base, titulo: "Vlog bastidores", categoria: "storytelling", plataforma: "youtube", tipo_criativo: "video", created_by: "u2" },
    { ...base, titulo: "Carrossel educativo", descricao: "dicas de saúde", categoria: "organico", client_id: "c2", tipo_criativo: "carrossel" },
  ];
  const nomes: Record<string, string> = { c1: "Clínica Sorriso", c2: "Academia Forte" };
  const opcoes = { usuarioId: "u1", nomeDoCliente: (id: string) => nomes[id] };

  it("sem filtro devolve tudo", () => {
    expect(filtrarIdeias(ideias, FILTROS_INICIAIS, opcoes)).toHaveLength(3);
  });

  it("busca em titulo, descricao, tags e cliente, sem acento", () => {
    const busca = (b: string) => filtrarIdeias(ideias, { ...FILTROS_INICIAIS, busca: b }, opcoes).map(i => i.titulo);
    expect(busca("promocao")).toEqual(["Gancho de promoção"]);
    expect(busca("SAUDE")).toEqual(["Carrossel educativo"]);
    expect(busca("oferta")).toEqual(["Gancho de promoção"]);
    expect(busca("clinica")).toEqual(["Gancho de promoção"]);
    expect(busca("academia dicas")).toEqual(["Carrossel educativo"]);
  });

  it("filtra por cliente, sem cliente, plataforma, tipo, categoria, favoritas e minhas", () => {
    const f = (x: Partial<typeof FILTROS_INICIAIS>) => filtrarIdeias(ideias, { ...FILTROS_INICIAIS, ...x }, opcoes).length;
    expect(f({ cliente: "c1" })).toBe(1);
    expect(f({ cliente: "sem" })).toBe(1);
    expect(f({ plataforma: "youtube" })).toBe(1);
    expect(f({ tipo: "carrossel" })).toBe(1);
    expect(f({ categoria: "storytelling" })).toBe(1);
    expect(f({ soFavoritas: true })).toBe(1);
    expect(f({ soMinhas: true })).toBe(1);
  });

  it("conta por categoria so as que tem ideia", () => {
    expect(contarPorCategoria(ideias).map(c => [c.valor, c.total])).toEqual([
      ["anuncio", 1], ["storytelling", 1], ["organico", 1],
    ]);
  });
});

describe("faltaMigration", () => {
  it("reconhece tabela ausente", () => {
    expect(faltaMigration({ code: "42P01", message: 'relation "public.ideias" does not exist' })).toBe(true);
    expect(faltaMigration({ code: "PGRST205", message: "Could not find the table 'public.ideias' in the schema cache" })).toBe(true);
    expect(faltaMigration({ code: "42501", message: "permission denied" })).toBe(false);
    expect(faltaMigration(null)).toBe(false);
  });
});
