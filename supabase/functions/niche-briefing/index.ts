// Briefing por nicho: le o historico da carteira e diz por onde comecar.
//
// Roda na Groq, nao na Anthropic. O chat interno ja usava Groq e a chave ja
// estava configurada; para um texto de meia pagina por clique nao compensa
// depender de credito pago.
//
// A Groq desliga modelo com data marcada (o llama-3.3-70b-versatile morreu em
// 16/08/2026). Como secret, trocar o modelo nao exige redeploy — mesmo padrao
// do chat-assistant.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GROQ_MODEL = Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b";

interface Benchmark {
  clientes: number;
  spend: number;
  ctr: number;
  cpm: number;
  cpc: number;
  custoPorResultado: number | null;
  confiavel: boolean;
}

interface Criativo {
  title: string;
  ctr: number;
  impressions: number;
  creativeType: string;
}

interface Formato {
  creativeType: string;
  ctr: number;
  anuncios: number;
}

interface Cliente {
  name: string;
  spend: number;
  ctr: number;
  cpm: number;
  cpc: number;
  custoPorResultado: number | null;
  diasComGasto: number;
  creatives: Criativo[];
}

/** Numero que veio do JSON pode chegar string, null ou ausente; `toFixed` nao perdoa. */
function num(valor: unknown, padrao = 0): number {
  const n = typeof valor === "string" ? Number(valor) : valor;
  return typeof n === "number" && Number.isFinite(n) ? n : padrao;
}

function brl(valor: number): string {
  return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

// O markdown vai para uma tela: HTML do modelo nao e renderizado de proposito
// (texto de IA nao entra no DOM), entao a saida precisa nao ter tag nenhuma.
const REGRAS_DE_FORMATO = `Regras de formato, porque a resposta e renderizada numa tela:
- NAO use HTML. Nada de <br>, <b> ou qualquer tag — elas aparecem como texto cru para o gestor.
- Tabela so com ate 3 colunas e uma linha curta por celula. Se a informacao nao couber assim, use lista.
- Cada item de lista em uma linha propria, sem quebrar celula ao meio.`;

function linhasDeCriativos(lista: Criativo[], vazio: string): string {
  return lista.length
    ? lista
        .map((c, i) => `${i + 1}. [${c.creativeType}] CTR ${c.ctr.toFixed(2)}% em ${c.impressions} impressoes — "${c.title}"`)
        .join("\n")
    : vazio;
}

/** Quantas vezes o numero do cliente e o do nicho: da a escala do desvio. */
function vezes(cliente: number, nicho: number): string {
  if (nicho <= 0 || cliente <= 0) return "";
  const r = cliente / nicho;
  return r >= 1 ? ` (${r.toFixed(1)}x o nicho)` : ` (${(1 / r).toFixed(1)}x abaixo do nicho)`;
}

function montarPrompt(
  segmentLabel: string,
  goalLabel: string,
  b: Benchmark,
  criativos: Criativo[],
  formatos: Formato[]
): string {
  const linhasCriativos = criativos.length
    ? criativos
        .map((c, i) => `${i + 1}. [${c.creativeType}] CTR ${c.ctr.toFixed(2)}% em ${c.impressions} impressoes — "${c.title}"`)
        .join("\n")
    : "(nenhum criativo com entrega suficiente)";

  const linhasFormatos = formatos.length
    ? formatos.map((f) => `- ${f.creativeType}: CTR ${f.ctr.toFixed(2)}% em ${f.anuncios} anuncio(s)`).join("\n")
    : "(sem dado de formato)";

  const aviso = b.confiavel
    ? ""
    : "\nATENCAO: amostra pequena (menos de 3 contas). Trate os numeros como exemplo do que ja foi feito, nao como referencia de mercado, e diga isso na resposta.";

  return `Monte um briefing para uma campanha de trafego pago que ainda NAO foi criada.

Nicho: ${segmentLabel}
Objetivo do cliente: ${goalLabel}

Historico desta agencia neste nicho (${b.clientes} conta(s), ${brl(b.spend)} investidos):
- CTR medio: ${b.ctr.toFixed(2)}%
- CPM medio: ${brl(b.cpm)}
- CPC medio: ${brl(b.cpc)}
- Custo por resultado: ${b.custoPorResultado !== null ? brl(b.custoPorResultado) : "sem resultado registrado"}${aviso}

Formatos que entregaram:
${linhasFormatos}

Criativos com melhor CTR no nicho:
${linhasCriativos}

Responda em markdown, direto ao ponto, com estas secoes.

Regras de formato, porque a resposta e renderizada numa tela:
- NAO use HTML. Nada de <br>, <b> ou qualquer tag — elas aparecem como texto cru para o gestor.
- Tabela so com ate 3 colunas e uma linha curta por celula. Se a informacao nao couber assim, use lista.
- Cada item de lista em uma linha propria, sem quebrar celula ao meio.

## Angulos que se repetem
O que os criativos vencedores tem em comum: promessa, gatilho, prova, oferta. Se nao houver padrao claro, diga que nao ha.

## Como comecar
Estrutura sugerida de campanha e conjunto, formato a priorizar e quantos criativos subir.

## Metas realistas
Que CTR, CPM e custo por resultado esperar, ancorado nos numeros acima.

## O que evitar
Erros que os numeros deste nicho sugerem.

## O que ainda nao da para afirmar
Onde a amostra e fraca demais para conclusao.`;
}


function montarPromptCliente(
  segmentLabel: string,
  goalLabel: string,
  b: Benchmark,
  cliente: Cliente,
  criativosDoNicho: Criativo[],
  formatos: Formato[]
): string {
  const semEntrega = cliente.diasComGasto === 0;

  const comparativo = semEntrega
    ? "Este cliente NAO teve entrega no periodo: nao ha numero dele para comparar."
    : [
        `| Metrica | ${cliente.name} | Nicho |`,
        "| --- | --- | --- |",
        `| CTR | ${cliente.ctr.toFixed(2)}%${vezes(cliente.ctr, b.ctr)} | ${b.ctr.toFixed(2)}% |`,
        `| CPM | ${brl(cliente.cpm)}${vezes(cliente.cpm, b.cpm)} | ${brl(b.cpm)} |`,
        `| CPC | ${brl(cliente.cpc)}${vezes(cliente.cpc, b.cpc)} | ${brl(b.cpc)} |`,
        `| Custo por resultado | ${cliente.custoPorResultado !== null ? brl(cliente.custoPorResultado) : "sem resultado"}${
          cliente.custoPorResultado !== null && b.custoPorResultado !== null
            ? vezes(cliente.custoPorResultado, b.custoPorResultado)
            : ""
        } | ${b.custoPorResultado !== null ? brl(b.custoPorResultado) : "sem resultado"} |`,
        "",
        `Investimento do cliente no periodo: ${brl(cliente.spend)} em ${cliente.diasComGasto} dia(s) com entrega.`,
      ].join("\n");

  const aviso = b.confiavel
    ? ""
    : `\nATENCAO: o nicho tem so ${b.clientes} conta(s). A media nao e referencia de mercado — compare, mas diga que a base e estreita.`;

  return `Diagnostique a conta de UM cliente comparando com o nicho dele, e diga o que mudar.

Cliente: ${cliente.name}
Nicho: ${segmentLabel} (${b.clientes} conta(s) no comparativo)
Objetivo do cliente: ${goalLabel}

${comparativo}${aviso}

Formatos que entregaram no nicho:
${formatos.length ? formatos.map((f) => `- ${f.creativeType}: CTR ${f.ctr.toFixed(2)}% em ${f.anuncios} anuncio(s)`).join("\n") : "(sem dado de formato)"}

Criativos DESTE CLIENTE (melhor CTR primeiro):
${linhasDeCriativos(cliente.creatives, "(este cliente nao tem criativo com entrega)")}

Criativos que venceram no NICHO, de outras contas:
${linhasDeCriativos(criativosDoNicho, "(nenhum criativo do nicho com entrega suficiente)")}

Responda em markdown, direto ao ponto, com estas secoes.

${REGRAS_DE_FORMATO}

## Onde esta fora da curva
Quais metricas do cliente destoam do nicho, e em que escala. Se estiver dentro da curva, diga isso em vez de inventar problema.

## O que os melhores fazem diferente
Compare os criativos do cliente com os que venceram no nicho: formato, promessa, gatilho, oferta. Aponte o que o cliente nao esta fazendo.

## O que mudar primeiro
Uma lista ordenada por impacto, do que muda o resultado mais rapido para o que pode esperar. Seja especifico: qual formato, qual angulo, o que pausar.

## O que nao mudar
O que ja esta funcionando nesta conta e nao deve ser mexido.

## O que ainda nao da para afirmar
Onde o dado e fraco demais para conclusao — amostra do nicho, pouca entrega do cliente, periodo curto.`;
}


// ─── Pauta de conteudo organico ──────────────────────────────────────────────

// O dado e de anuncio pago; a pauta e de organico. O que transfere sao angulo,
// promessa e formato — nao a metrica. O prompt exige que o texto diga isso, e
// que nao cite anuncio de nenhuma conta: a pauta e por nicho e pode circular.
function montarPromptPauta(
  segmentLabel: string,
  b: Benchmark,
  criativos: Criativo[],
  formatos: Formato[]
): string {
  return `Monte um CALENDARIO de conteudo ORGANICO de 4 semanas para negocios do nicho "${segmentLabel}".

Conteudo organico nao e anuncio. A maior parte dos posts NAO vende: educa, entretem, mostra bastidor,
responde duvida, prova que o servico funciona. Oferta direta entra no maximo em 1 de cada 4 posts —
perfil que so vende perde alcance e seguidor.

Os anuncios abaixo sao de TRAFEGO PAGO. Use-os apenas para entender o que interessa a esse publico
(que duvida ele tem, o que ele valoriza, o que o faz parar). NAO os transforme em post de venda,
e nao copie o texto deles.

Publico e nicho: ${segmentLabel} (base de ${b.clientes} conta(s) de anuncio).

Formatos que mais prendem atencao nesse publico:
${formatos.length ? formatos.map((f) => `- ${f.creativeType}`).join("\n") : "(sem dado de formato)"}

Sinais do que interessa a esse publico, tirados dos anuncios:
${linhasDeCriativos(criativos, "(sem sinal suficiente)")}

Responda SO com JSON valido, sem cercas de codigo, neste formato:

{
  "resumo": "uma frase sobre o que esse publico quer ver no feed",
  "cadencia": "quantos posts por semana e em que formatos, em uma linha",
  "pilares": [
    { "nome": "Educativo", "proporcao": "2 de 4 posts", "porque": "por que esse publico responde", "exemplos": ["ideia de post", "outra"] }
  ],
  "calendario": [
    { "semana": 1, "dia": "Segunda", "formato": "Reels", "pilar": "Educativo", "tema": "assunto do post", "gancho": "primeira frase", "cta": "o que pedir no fim" }
  ],
  "evitar": ["erro comum de quem posta nesse nicho"],
  "ressalva": "o que a base nao permite afirmar"
}

Regras:
- 3 a 5 pilares, com proporcao somando o total semanal.
- 4 semanas no calendario, 3 a 4 posts por semana. Varie pilar e formato ao longo da semana.
- No maximo 1 post de oferta por semana.
- "gancho" e a primeira frase falada ou escrita, nao o titulo do post.
- Escreva para quem vai gravar com o celular hoje: nada de jargao de midia paga.`;
}

const SYSTEM_PAUTA = `Voce e um social media de negocio local no Brasil, nao um gestor de trafego.
Pensa em feed e em rotina de postagem: o que o dono do negocio consegue gravar com o celular na semana.
Sabe que perfil que so vende perde alcance, entao equilibra educar, entreter e mostrar bastidor.
Nao inventa numero e nao promete alcance que ninguem mediu.
Responde exclusivamente com o JSON pedido, sem texto antes ou depois.`;

const SYSTEM = `Voce e um gestor de trafego pago experiente em negocio local no Brasil.
Fale com quem vai executar hoje: seja concreto, use os numeros que recebeu e nao invente dado que nao esta ali.
Quando a amostra for pequena, diga com todas as letras que nao da para concluir — um palpite apresentado como regra custa dinheiro do cliente.
Nada de introducao nem despedida.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();

    if (!body?.segmentLabel || !body?.goalLabel || !body?.benchmark) {
      throw new Error("segmentLabel, goalLabel e benchmark sao obrigatorios");
    }

    const bruto = body.benchmark ?? {};
    const benchmark: Benchmark = {
      clientes: num(bruto.clientes),
      spend: num(bruto.spend),
      ctr: num(bruto.ctr),
      cpm: num(bruto.cpm),
      cpc: num(bruto.cpc),
      // Ausente e diferente de zero: "sem resultado registrado" e a resposta
      // honesta, e R$ 0,00 por resultado seria mentira boa de acreditar.
      custoPorResultado:
        bruto.custoPorResultado === null || bruto.custoPorResultado === undefined
          ? null
          : num(bruto.custoPorResultado),
      confiavel: bruto.confiavel === true,
    };

    // So o topo entra no prompt: a tela manda o ranking inteiro, e prompt maior
    // custa mais sem responder melhor.
    const criativos: Criativo[] = (body.creatives ?? []).slice(0, 10).map((c: Record<string, unknown>) => ({
      title: String(c?.title ?? "").slice(0, 300),
      ctr: num(c?.ctr),
      impressions: num(c?.impressions),
      creativeType: String(c?.creativeType ?? "desconhecido").slice(0, 30),
    }));

    const formatos: Formato[] = (body.formatos ?? []).slice(0, 6).map((f: Record<string, unknown>) => ({
      creativeType: String(f?.creativeType ?? "desconhecido").slice(0, 30),
      ctr: num(f?.ctr),
      anuncios: num(f?.anuncios),
    }));

    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) throw new Error("GROQ_API_KEY nao configurado");

    const segLabel = String(body.segmentLabel).slice(0, 80);
    const objLabel = String(body.goalLabel).slice(0, 80);

    // Com cliente escolhido a pergunta muda: nao e "como comecar no nicho", e
    // "o que fazer nesta conta". Sem comparativo o modelo so repete boa pratica.
    const cliente: Cliente | null = body.client
      ? {
          name: String(body.client.name ?? "").slice(0, 80),
          spend: num(body.client.spend),
          ctr: num(body.client.ctr),
          cpm: num(body.client.cpm),
          cpc: num(body.client.cpc),
          custoPorResultado:
            body.client.custoPorResultado === null || body.client.custoPorResultado === undefined
              ? null
              : num(body.client.custoPorResultado),
          diasComGasto: num(body.client.diasComGasto),
          creatives: (body.client.creatives ?? []).slice(0, 10).map((c: Record<string, unknown>) => ({
            title: String(c?.title ?? "").slice(0, 300),
            ctr: num(c?.ctr),
            impressions: num(c?.impressions),
            creativeType: String(c?.creativeType ?? "desconhecido").slice(0, 30),
          })),
        }
      : null;

    // A pauta de conteudo sai em JSON porque vira PDF: markdown serve tela, mas
    // para diagramar pagina e preciso ter os campos separados.
    const modoPauta = body.modo === "pauta";

    const prompt = modoPauta
      ? montarPromptPauta(segLabel, benchmark, criativos, formatos)
      : cliente
        ? montarPromptCliente(segLabel, objLabel, benchmark, cliente, criativos, formatos)
        : montarPrompt(segLabel, objLabel, benchmark, criativos, formatos);

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 2048,
        messages: [
          { role: "system", content: modoPauta ? SYSTEM_PAUTA : SYSTEM },
          { role: "user", content: prompt },
        ],
        // Sem isto o modelo cerca o JSON em bloco de codigo de vez em quando, e
        // o parse quebra so as vezes — o pior tipo de defeito.
        ...(modoPauta ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => null);
      throw new Error(`Groq respondeu ${response.status}: ${err?.error?.message ?? response.statusText}`);
    }

    const data = await response.json();
    const briefing = data?.choices?.[0]?.message?.content;
    if (typeof briefing !== "string" || !briefing.trim()) {
      throw new Error("A Groq respondeu 200 mas sem texto no briefing");
    }

    let pauta: unknown = null;
    if (modoPauta) {
      try {
        pauta = JSON.parse(briefing);
      } catch {
        throw new Error("A pauta voltou em formato invalido. Tente gerar de novo.");
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        briefing,
        pauta,
        tokens: {
          input: data.usage?.prompt_tokens ?? 0,
          output: data.usage?.completion_tokens ?? 0,
        },
        cost_usd: "0.000000",
        cached: false,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("niche-briefing error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
