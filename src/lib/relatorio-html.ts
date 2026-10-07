// Relatorio de performance em HTML unico (sem JS, CSS inline, imagem embutida)
// para mandar ao cliente como arquivo, abrir no celular ou virar PDF. A capa e
// fixa; o corpo e uma lista de blocos que o gestor monta, edita e reordena.
// A IA (Edge Function relatorio-ia) so preenche os blocos padrao a partir de prints.

export interface MetricasRelatorio {
  investimento: number | null;
  alcance: number | null;
  impressoes: number | null;
  cliques: number | null;
  mensagens: number | null;
  visitas_pagina: number | null;
  custo_por_clique: number | null;
  custo_por_mensagem: number | null;
}

export type TipoBloco = "numeros" | "criativo" | "resumo" | "texto" | "prints" | "dados";

interface BlocoBase {
  id: string;
  olho: string;
  titulo: string;
  texto: string;
}

export interface Print {
  src: string;
  legenda: string;
}

export interface LinhaDado {
  rotulo: string;
  valor: string;
}

export type Bloco =
  | (BlocoBase & { tipo: "numeros" })
  | (BlocoBase & {
      tipo: "criativo";
      imagem: string | null;
      alcance: number | null;
      mensagens: number | null;
      custo_por_mensagem: number | null;
    })
  | (BlocoBase & { tipo: "resumo" })
  | (BlocoBase & { tipo: "texto" })
  | (BlocoBase & { tipo: "prints"; imagens: Print[] })
  | (BlocoBase & { tipo: "dados"; linhas: LinhaDado[] });

export type BlocoDo<T extends TipoBloco> = Extract<Bloco, { tipo: T }>;

export interface RelatorioDados {
  agencia: { nome: string; logo_url: string | null };
  cliente: { nome: string; logo_url: string | null };
  local: string;
  periodo: string;
  manchete: string;
  subtitulo: string;
  metricas: MetricasRelatorio;
  blocos: Bloco[];
}

export const METRICAS_VAZIAS: MetricasRelatorio = {
  investimento: null,
  alcance: null,
  impressoes: null,
  cliques: null,
  mensagens: null,
  visitas_pagina: null,
  custo_por_clique: null,
  custo_por_mensagem: null,
};

export const MODELOS_DE_BLOCO: Array<{ chave: string; rotulo: string; descricao: string; criar: () => Bloco }> = [
  {
    chave: "prints",
    rotulo: "Prints",
    descricao: "Gerenciador de Anúncios, Instagram, Google, CRM...",
    criar: () => ({ id: novoId(), tipo: "prints", olho: "Prints", titulo: "Gerenciador de Anúncios", texto: "", imagens: [] }),
  },
  {
    chave: "dados",
    rotulo: "Dados complementares",
    descricao: "Tabela de rótulo e valor (vendas, agendamentos...)",
    criar: () => ({
      id: novoId(),
      tipo: "dados",
      olho: "Dados complementares",
      titulo: "Outros números do período",
      texto: "",
      linhas: [{ rotulo: "", valor: "" }],
    }),
  },
  {
    chave: "analise",
    rotulo: "Análise",
    descricao: "Texto livre com a leitura do período",
    criar: () => ({ id: novoId(), tipo: "texto", olho: "Análise", titulo: "O que os números mostram", texto: "" }),
  },
  {
    chave: "observacoes",
    rotulo: "Observações",
    descricao: "Pontos de atenção, combinados, avisos",
    criar: () => ({ id: novoId(), tipo: "texto", olho: "Observações", titulo: "Pontos de atenção", texto: "" }),
  },
  {
    chave: "proximos",
    rotulo: "Próximos passos",
    descricao: "O que vai ser feito no próximo período",
    criar: () => ({ id: novoId(), tipo: "texto", olho: "Próximos passos", titulo: "O que vamos fazer agora", texto: "" }),
  },
  {
    chave: "numeros",
    rotulo: "Números do período",
    descricao: "Cards de alcance, custos e investimento",
    criar: () => ({ id: novoId(), tipo: "numeros", olho: "Visão geral", titulo: "Principais números do período", texto: "" }),
  },
  {
    chave: "criativo",
    rotulo: "Criativo campeão",
    descricao: "Imagem do anúncio e seus resultados",
    criar: () => ({
      id: novoId(),
      tipo: "criativo",
      olho: "Criativo campeão do período",
      titulo: "O criativo que mais gerou conversas no WhatsApp",
      texto: "",
      imagem: null,
      alcance: null,
      mensagens: null,
      custo_por_mensagem: null,
    }),
  },
  {
    chave: "resumo",
    rotulo: "Resumo em destaque",
    descricao: "Faixa azul com o recado principal",
    criar: () => ({ id: novoId(), tipo: "resumo", olho: "Resumo", titulo: "", texto: "" }),
  },
];

export function criarBloco(chave: string): Bloco {
  return MODELOS_DE_BLOCO.find((m) => m.chave === chave)!.criar();
}

export function novoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** A IA erra o formato as vezes; normaliza e completa os custos que dao para calcular. */
export function metricasDaIA(bruto: unknown): MetricasRelatorio {
  const m = (bruto ?? {}) as Record<string, unknown>;
  const r: MetricasRelatorio = {
    investimento: numero(m.investimento),
    alcance: numero(m.alcance),
    impressoes: numero(m.impressoes),
    cliques: numero(m.cliques),
    mensagens: numero(m.mensagens),
    visitas_pagina: numero(m.visitas_pagina),
    custo_por_clique: numero(m.custo_por_clique),
    custo_por_mensagem: numero(m.custo_por_mensagem),
  };
  if (r.custo_por_clique == null && r.investimento && r.cliques) r.custo_por_clique = r.investimento / r.cliques;
  if (r.custo_por_mensagem == null && r.investimento && r.mensagens) r.custo_por_mensagem = r.investimento / r.mensagens;
  return r;
}

/** Blocos padrao preenchidos pela IA: numeros, criativo campeao (se houver) e resumo. */
export function blocosDaIA(ia: Record<string, unknown>, prints: string[]): Bloco[] {
  const numeros = criarBloco("numeros");
  numeros.texto = texto(ia.visao_geral);
  const blocos: Bloco[] = [numeros];

  if (ia.criativo && typeof ia.criativo === "object") {
    const c = ia.criativo as Record<string, unknown>;
    const indice = numero(c.print);
    const criativo = criarBloco("criativo") as BlocoDo<"criativo">;
    criativo.texto = texto(c.descricao);
    criativo.imagem = indice != null && prints[indice] ? prints[indice] : null;
    criativo.alcance = numero(c.alcance);
    criativo.mensagens = numero(c.mensagens);
    criativo.custo_por_mensagem = numero(c.custo_por_mensagem);
    blocos.push(criativo);
  }

  if (texto(ia.resumo)) {
    const resumo = criarBloco("resumo");
    resumo.texto = texto(ia.resumo);
    blocos.push(resumo);
  }
  return blocos;
}

/** Abre relatorio salvo em qualquer versao: a primeira guardava visao_geral/criativo/resumo soltos. */
export function normalizarRelatorio(bruto: unknown): RelatorioDados {
  const d = (bruto ?? {}) as Record<string, any>;
  let blocos: Bloco[];
  if (Array.isArray(d.blocos)) {
    blocos = d.blocos.map((b: Record<string, unknown>) => ({ ...criarBlocoDoTipo(b.tipo as TipoBloco), ...b }) as Bloco);
  } else {
    blocos = blocosDaIA(
      { visao_geral: d.visao_geral, resumo: d.resumo, criativo: d.criativo && { ...d.criativo, descricao: d.criativo.descricao } },
      [],
    );
    const criativo = blocos.find((b) => b.tipo === "criativo") as BlocoDo<"criativo"> | undefined;
    if (criativo) criativo.imagem = d.criativo?.imagem ?? null;
  }
  return {
    agencia: d.agencia ?? { nome: "Agência", logo_url: null },
    cliente: d.cliente ?? { nome: "Cliente", logo_url: null },
    local: d.local ?? "",
    periodo: d.periodo ?? "",
    manchete: d.manchete ?? "",
    subtitulo: d.subtitulo ?? "",
    metricas: { ...METRICAS_VAZIAS, ...(d.metricas ?? {}) },
    blocos,
  };
}

function criarBlocoDoTipo(tipo: TipoBloco): Bloco {
  const chave = { texto: "analise" }[tipo as "texto"] ?? tipo;
  return MODELOS_DE_BLOCO.find((m) => m.chave === chave)?.criar() ?? criarBloco("analise");
}

const virgula = (n: number, casas: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

export function fmtCompacto(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${virgula(n / 1_000_000, 1).replace(/,0$/, "")} mi`;
  if (n >= 1000) return `${virgula(n / 1000, 1).replace(/,0$/, "")} mil`;
  return virgula(n, 0);
}

export function fmtReais(n: number | null): string {
  return n == null ? "—" : `R$ ${virgula(n, 2)}`;
}

export function fmtInteiro(n: number | null): string {
  return n == null ? "—" : virgula(n, 0);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function comDestaques(s: string): string {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<span class="hl">$1</span>');
}

/** Paragrafos separados por linha; linhas com "- " ou "• " viram lista. */
function paragrafos(s: string): string {
  const saida: string[] = [];
  let itens: string[] = [];
  const fecharLista = () => {
    if (itens.length) saida.push(`<ul>${itens.map((i) => `<li>${comDestaques(i)}</li>`).join("")}</ul>`);
    itens = [];
  };
  for (const linha of s.split("\n").map((l) => l.trim())) {
    const item = linha.match(/^[-•*]\s+(.*)$/);
    if (item) {
      itens.push(item[1]);
      continue;
    }
    fecharLista();
    if (linha) saida.push(`<p>${comDestaques(linha)}</p>`);
  }
  fecharLista();
  return saida.join("");
}

function iniciais(nome: string): string {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f1b33;background:#fff;-webkit-font-smoothing:antialiased}
h1,h2,.num,.marca,.resumo p{font-family:Sora,Inter,system-ui,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:0 28px}
.hero{position:relative;overflow:hidden;color:#fff;background:radial-gradient(120% 80% at 10% 20%,#0d3fa3 0%,#0a2a6e 38%,#071633 75%)}
.hero:before{content:"";position:absolute;right:-180px;top:20px;width:520px;height:420px;border:34px solid rgba(255,255,255,.06);border-radius:50%}
.topo{position:relative;background:rgba(3,10,30,.55);border-bottom:1px solid rgba(255,255,255,.06)}
.topo .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:20px;padding-bottom:20px}
.marca{display:flex;align-items:center;gap:12px;font-weight:700;font-size:15px;letter-spacing:.02em;text-transform:uppercase}
.marca .logo{width:36px;height:36px;border-radius:9px;background:#1757d6;display:grid;place-items:center;overflow:hidden;font-size:13px}
.marca .logo img{width:100%;height:100%;object-fit:cover}
.topo .dir{display:flex;align-items:center;gap:12px}
.pill{border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:7px 14px;font-size:13px;white-space:nowrap}
.avatar{width:34px;height:34px;border-radius:50%;border:2px solid rgba(255,255,255,.8);overflow:hidden;display:grid;place-items:center;font-size:11px;font-weight:700;background:#0b1f4d}
.avatar img{width:100%;height:100%;object-fit:cover}
.hero-corpo{position:relative;padding-top:64px;padding-bottom:72px}
.para{display:inline-block;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);border-radius:999px;padding:9px 18px;font-size:15px}
.para b{font-family:Sora,Inter,sans-serif;margin-left:4px}
.local{margin-top:26px;font-size:13px;font-weight:600;color:#c9d6ef}
.hero h1{margin-top:14px;font-size:24px;line-height:1.3;font-weight:700}
.hero .sub{margin-top:14px;max-width:520px;color:#d7e1f5;font-size:16px;line-height:1.55}
.vidro{margin-top:44px;display:grid;grid-template-columns:1fr 1fr;border-radius:14px;overflow:hidden;background:rgba(255,255,255,.12);backdrop-filter:blur(8px)}
.vidro div{padding:20px 18px;border-right:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08)}
.vidro div:nth-child(2n){border-right:0}
.vidro .num{display:block;font-size:20px;font-weight:700}
.vidro small{display:block;margin-top:6px;font-size:12px;color:#d7e1f5}
section.bloco{padding:56px 0}
section.alt{background:#f3f7fd}
section.cont{padding-top:0}
section.fim{padding-bottom:56px}
section.meio{padding-bottom:0}
.olho{font-size:12px;font-weight:600;color:#1f5fd1}
h2{margin-top:10px;font-size:22px;font-weight:700;color:#0f1b33;line-height:1.3}
.intro{margin-top:14px;color:#56637a;font-size:16px;line-height:1.6;max-width:560px}
.intro p+p,.intro ul+p,.intro p+ul{margin-top:10px}
.intro ul{padding-left:0;list-style:none}
.intro li{position:relative;padding-left:18px;margin-top:6px}
.intro li:before{content:"";position:absolute;left:2px;top:.62em;width:7px;height:7px;border-radius:50%;background:#1f5fd1}
.intro .hl{color:#173b8c;font-weight:600}
.texto .intro{max-width:none}
.cards{margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:16px}
.card{border:1px solid #e3e8f1;border-radius:16px;padding:24px 20px;background:#fff}
.card .num{display:block;font-size:24px;font-weight:700;color:#173b8c}
.card .rot{display:block;margin-top:10px;font-size:14px;color:#4a566d}
.card .exp{display:block;margin-top:8px;font-size:12px;line-height:1.5;color:#8a94a6}
.lista{margin-top:16px;border:1px solid #e3e8f1;border-radius:16px;overflow:hidden;background:#fff}
.lista div{padding:18px 18px;border-bottom:1px solid #e3e8f1}
.lista div:last-child{border-bottom:0}
.lista small{display:block;font-size:13px;color:#56637a}
.lista b{display:block;margin-top:4px;font-family:Sora,Inter,sans-serif;font-size:16px}
.dados .lista{margin-top:28px}
.campeao{text-align:center}
.campeao .intro{margin-left:auto;margin-right:auto}
.campeao h2{max-width:600px;margin-left:auto;margin-right:auto}
.tela{margin:32px auto 0;width:280px;max-width:100%;aspect-ratio:9/16;border-radius:18px;overflow:hidden;background:#0f1b33;box-shadow:0 24px 50px rgba(15,27,51,.18)}
.tela img{width:100%;height:100%;object-fit:cover;display:block}
.mini{margin:20px auto 0;display:flex;justify-content:center;gap:10px;flex-wrap:wrap}
.mini div{width:86px;min-height:96px;text-align:left;border:1px solid #e3e8f1;border-radius:10px;background:#fff;padding:12px 8px}
.mini .num{display:block;font-size:16px;font-weight:700;color:#173b8c}
.mini small{display:block;margin-top:6px;font-size:11px;line-height:1.35;color:#56637a}
figure{margin-top:28px}
figure img{display:block;width:100%;height:auto;border-radius:14px;border:1px solid #e3e8f1;box-shadow:0 14px 34px rgba(15,27,51,.10);background:#fff}
figcaption{margin-top:10px;font-size:13px;line-height:1.5;color:#56637a;text-align:center}
.resumo{background:linear-gradient(160deg,#0b3a97 0%,#0a2a6e 55%,#081d4d 100%);color:#fff;text-align:center;padding:56px 0 64px}
.resumo .olho{color:#7fb0ff}
.resumo h2{color:#fff}
.resumo p.txt{margin-top:16px;font-size:22px;line-height:1.5;font-weight:600}
.resumo .hl{color:#6fa8ff}
footer{padding:28px 0;text-align:center;font-size:12px;color:#8a94a6}
@media (max-width:520px){
  .wrap{padding:0 18px}
  .topo .pill{display:none}
  .hero-corpo{padding-top:40px;padding-bottom:48px}
  .cards{grid-template-columns:1fr}
  .resumo p.txt{font-size:18px}
}`;

function celula(num: string, rot: string) {
  return `<div><span class="num">${esc(num)}</span><small>${esc(rot)}</small></div>`;
}

function hero(d: RelatorioDados) {
  const m = d.metricas;
  const celulas = [
    m.alcance != null && celula(fmtCompacto(m.alcance), "Alcance — pessoas atingidas (estimado)"),
    m.impressoes != null && celula(fmtCompacto(m.impressoes), "Impressões — vezes que apareceu"),
    m.custo_por_clique != null && celula(fmtReais(m.custo_por_clique), "Custo por clique"),
    m.custo_por_mensagem != null && celula(fmtReais(m.custo_por_mensagem), "Custo por mensagem"),
    m.mensagens != null && celula(fmtInteiro(m.mensagens), "Mensagens no período"),
  ].filter(Boolean) as string[];
  if (celulas.length % 2) celulas.push("<div></div>");

  const logoAgencia = d.agencia.logo_url ? `<img src="${esc(d.agencia.logo_url)}" alt="">` : esc(iniciais(d.agencia.nome));
  const logoCliente = d.cliente.logo_url ? `<img src="${esc(d.cliente.logo_url)}" alt="">` : esc(iniciais(d.cliente.nome));
  const local = [d.local, d.periodo].filter(Boolean).map(esc).join(" · ");

  return `<header class="hero">
  <div class="topo"><div class="wrap">
    <div class="marca"><span class="logo">${logoAgencia}</span>${esc(d.agencia.nome)}</div>
    <div class="dir"><span class="pill">Relatório de Performance</span><span class="avatar">${logoCliente}</span></div>
  </div></div>
  <div class="wrap hero-corpo">
    <span class="para">Relatório para <b>${esc(d.cliente.nome)}</b></span>
    ${local ? `<p class="local">${local}</p>` : ""}
    ${d.manchete ? `<h1>${esc(d.manchete)}</h1>` : ""}
    ${d.subtitulo ? `<p class="sub">${esc(d.subtitulo)}</p>` : ""}
    ${celulas.length ? `<div class="vidro">${celulas.join("")}</div>` : ""}
  </div>
</header>`;
}

function cabecalho(b: Bloco, comTexto = true) {
  return [
    b.olho ? `<p class="olho">${esc(b.olho)}</p>` : "",
    b.titulo ? `<h2>${esc(b.titulo)}</h2>` : "",
    comTexto && b.texto.trim() ? `<div class="intro">${paragrafos(b.texto)}</div>` : "",
  ].join("");
}

function card(num: string, rot: string, exp?: string) {
  return `<div class="card"><span class="num">${esc(num)}</span><span class="rot">${esc(rot)}</span>${exp ? `<span class="exp">${esc(exp)}</span>` : ""}</div>`;
}

function blocoNumeros(b: BlocoDo<"numeros">, m: MetricasRelatorio): string[] {
  const cards = [
    m.alcance != null && card(fmtCompacto(m.alcance), "Alcance total (estimado)", "Pessoas diferentes que viram o anúncio"),
    m.impressoes != null &&
      card(fmtCompacto(m.impressoes), "Impressões totais", "Vezes que o anúncio apareceu, contando repetição para a mesma pessoa"),
    m.custo_por_clique != null && card(fmtReais(m.custo_por_clique), "Custo por clique"),
    m.custo_por_mensagem != null && card(fmtReais(m.custo_por_mensagem), "Custo por mensagem"),
  ].filter(Boolean);
  const linhas = [
    m.investimento != null && ["Investimento total", fmtReais(m.investimento)],
    m.cliques != null && ["Cliques no anúncio", fmtInteiro(m.cliques)],
    m.mensagens != null && ["Mensagens recebidas", fmtInteiro(m.mensagens)],
    m.visitas_pagina != null && ["Visitas à página", fmtInteiro(m.visitas_pagina)],
  ].filter(Boolean) as string[][];
  if (!cards.length && !linhas.length && !b.texto.trim()) return [];
  return [
    cabecalho(b) +
      (cards.length ? `<div class="cards">${cards.join("")}</div>` : "") +
      (linhas.length ? `<div class="lista">${linhas.map(([r, v]) => `<div><small>${esc(r)}</small><b>${esc(v)}</b></div>`).join("")}</div>` : ""),
  ];
}

function blocoCriativo(b: BlocoDo<"criativo">): string[] {
  const mini = [
    b.alcance != null && `<div><span class="num">${fmtCompacto(b.alcance)}</span><small>Alcance</small></div>`,
    b.mensagens != null && `<div><span class="num">${fmtInteiro(b.mensagens)}</span><small>Conversas por mensagem</small></div>`,
    b.custo_por_mensagem != null && `<div><span class="num">${fmtReais(b.custo_por_mensagem)}</span><small>Custo por conversa</small></div>`,
  ].filter(Boolean);
  return [
    cabecalho(b) +
      (b.imagem ? `<div class="tela"><img src="${esc(b.imagem)}" alt=""></div>` : "") +
      (mini.length ? `<div class="mini">${mini.join("")}</div>` : ""),
  ];
}

// Um pedaco por print: no HTML fica continuo, e o PDF quebra pagina entre eles
// em vez de cortar um print no meio.
function blocoPrints(b: BlocoDo<"prints">): string[] {
  const figuras = b.imagens
    .filter((i) => i.src)
    .map((i) => `<figure><img src="${esc(i.src)}" alt="">${i.legenda.trim() ? `<figcaption>${esc(i.legenda)}</figcaption>` : ""}</figure>`);
  const topo = cabecalho(b);
  if (!figuras.length) return topo ? [topo] : [];
  return [topo + figuras[0], ...figuras.slice(1)];
}

function blocoDados(b: BlocoDo<"dados">): string[] {
  const linhas = b.linhas.filter((l) => l.rotulo.trim() || l.valor.trim());
  if (!linhas.length && !b.texto.trim()) return [];
  return [
    cabecalho(b) +
      (linhas.length ? `<div class="lista">${linhas.map((l) => `<div><small>${esc(l.rotulo)}</small><b>${esc(l.valor)}</b></div>`).join("")}</div>` : ""),
  ];
}

function corpo(d: RelatorioDados): string {
  const secoes: string[] = [];
  let alternar = false;
  for (const b of d.blocos) {
    if (b.tipo === "resumo") {
      if (!b.texto.trim()) continue;
      secoes.push(
        `<section class="resumo"><div class="wrap">${cabecalho(b, false)}<p class="txt">${comDestaques(b.texto.trim()).replace(/\n+/g, "<br>")}</p></div></section>`,
      );
      alternar = false;
      continue;
    }
    const pedacos =
      b.tipo === "numeros" ? blocoNumeros(b, d.metricas)
      : b.tipo === "criativo" ? blocoCriativo(b)
      : b.tipo === "prints" ? blocoPrints(b)
      : b.tipo === "dados" ? blocoDados(b)
      : b.texto.trim() || b.titulo ? [cabecalho(b)]
      : [];
    if (!pedacos.length) continue;
    const classe = `bloco ${b.tipo === "criativo" ? "campeao" : b.tipo === "texto" ? "texto" : b.tipo}${alternar ? " alt" : ""}`;
    pedacos.forEach((html, i) => {
      const posicao = pedacos.length === 1 ? "" : i === 0 ? " meio" : i === pedacos.length - 1 ? " cont fim" : " cont meio";
      secoes.push(`<section class="${classe}${posicao}"><div class="wrap">${html}</div></section>`);
    });
    alternar = !alternar;
  }
  return secoes.join("\n");
}

export function montarRelatorioHtml(d: RelatorioDados): string {
  const titulo = `Relatório ${d.cliente.nome}${d.periodo ? ` · ${d.periodo}` : ""}`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Sora:wght@600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
${hero(d)}
<main>
${corpo(d)}
</main>
<footer>Relatório preparado por ${esc(d.agencia.nome)}</footer>
</body>
</html>`;
}

export function nomeDoArquivo(d: RelatorioDados, extensao: "html" | "pdf" = "html"): string {
  const base = `relatorio-${d.cliente.nome}-${d.periodo || "periodo"}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base}.${extensao}`;
}
