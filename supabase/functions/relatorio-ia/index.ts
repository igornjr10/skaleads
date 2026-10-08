import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guard, jsonResponse } from "../_shared/auth.ts";
import { erroDoProvedor, limiteDeTokens, provedorLLM } from "../_shared/llm.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PRINTS = 8;

interface Pedido {
  client_id: string;
  prints: string[];
  periodo?: string;
  observacoes?: string;
}

const INSTRUCOES = `Voce monta relatorios mensais de anuncios (Meta Ads) que uma agencia manda para o dono do negocio.
Recebe prints do Gerenciador de Anuncios (e as vezes do Instagram) e devolve SO um JSON.

Regras:
- Numero so vem dos prints. Nunca invente nem estime; se nao aparece, use null.
- Numeros em JSON puro: 1023.36, nao "R$ 1.023,36". Alcance 14800, nao "14,8 mil".
- Some as linhas quando o print mostrar varias campanhas sem total; se houver linha de total, use ela.
- "mensagens" = conversas por mensagem iniciadas (WhatsApp/Direct). "cliques" = cliques no link (ou cliques no anuncio se nao houver).
- O criativo campeao e o anuncio com mais resultados (mensagens) no print de anuncios. Se nao houver print por anuncio, criativo = null.
- Texto em portugues do Brasil, para leigo: sem siglas (CPC, CTR, CPM), frases curtas, tom positivo e honesto.
- So cite referencia de mercado ("faixa saudavel") se ela vier nas observacoes ou na meta do cliente.
- No resumo, marque os numeros importantes com **asteriscos duplos**.

Formato:
{
  "periodo": "Setembro de 2026" | null,
  "metricas": {
    "investimento": number|null, "alcance": number|null, "impressoes": number|null,
    "cliques": number|null, "mensagens": number|null, "visitas_pagina": number|null,
    "custo_por_clique": number|null, "custo_por_mensagem": number|null
  },
  "manchete": "frase curta com o resultado principal, ex.: 95 conversas no WhatsApp a R$ 10,56 cada.",
  "subtitulo": "1 frase sobre o foco das campanhas",
  "visao_geral": "1-2 frases explicando o que alcance, impressoes e custos significam neste relatorio",
  "criativo": {
    "nome": "nome do anuncio no print",
    "descricao": "1 frase: o que o criativo mostra e por que foi o melhor",
    "alcance": number|null, "mensagens": number|null, "custo_por_mensagem": number|null,
    "print": indice (0-based) do print onde o criativo aparece em imagem, ou null
  } | null,
  "resumo": "paragrafo de 4-6 frases contando o mes para o dono do negocio"
}`;

function contextoDoCliente(c: Record<string, unknown> | undefined, pedido: Pedido) {
  const linhas = [
    `Cliente: ${c?.name ?? "?"}`,
    c?.business_segment ? `Segmento: ${c.business_segment}` : "",
    c?.city ? `Cidade: ${c.city}${c.state ? `/${c.state}` : ""}` : "",
    c?.primary_goal ? `Objetivo: ${c.primary_goal}` : "",
    c?.alvo_custo_resultado ? `Meta de custo por resultado combinada com o cliente: R$ ${c.alvo_custo_resultado}` : "",
    pedido.periodo ? `Periodo do relatorio: ${pedido.periodo}` : "",
    pedido.observacoes?.trim() ? `Observacoes do gestor: ${pedido.observacoes.trim()}` : "",
  ];
  return linhas.filter(Boolean).join("\n");
}

// A Groq nao le imagem no modelo de texto padrao; o de visao vem de secret.
function modeloDeVisao(ia: ReturnType<typeof provedorLLM>) {
  if (ia.nome === "OpenAI") return Deno.env.get("OPENAI_VISION_MODEL") ?? ia.model;
  return Deno.env.get("GROQ_VISION_MODEL") ?? "meta-llama/llama-4-scout-17b-16e-instruct";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const pedido: Pedido = await req.json();
    const prints = (pedido.prints ?? []).filter((p) => typeof p === "string" && p.startsWith("data:image/"));
    if (!prints.length) return jsonResponse(cors, { error: "Envie pelo menos um print" }, 400);
    if (prints.length > MAX_PRINTS) return jsonResponse(cors, { error: `No maximo ${MAX_PRINTS} prints` }, 400);

    const acesso = await guard(req, cors, { clientId: pedido.client_id });
    if (!acesso.ok) return acesso.response;

    // Le o cliente com o JWT de quem pediu: a RLS ja decidiu que ele enxerga.
    const res = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/rest/v1/clients?id=eq.${pedido.client_id}` +
        "&select=name,business_segment,city,state,primary_goal,alvo_custo_resultado",
      { headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")!, Authorization: req.headers.get("Authorization") ?? "" } },
    );
    const [cliente] = res.ok ? await res.json() : [];

    const ia = provedorLLM();
    const resposta = await fetch(ia.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${ia.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modeloDeVisao(ia),
        ...limiteDeTokens(ia, 2000),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: INSTRUCOES },
          {
            role: "user",
            content: [
              { type: "text", text: `${contextoDoCliente(cliente, pedido)}\n\nPrints a seguir (indices 0 a ${prints.length - 1}).` },
              ...prints.map((url) => ({ type: "image_url", image_url: { url, detail: "high" } })),
            ],
          },
        ],
      }),
    });

    if (!resposta.ok) throw await erroDoProvedor(ia, resposta);
    const corpo = await resposta.json();
    const texto: string = corpo.choices?.[0]?.message?.content ?? "";
    const inicio = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    if (inicio < 0 || fim <= inicio) throw new Error("A IA nao devolveu os dados do relatorio");

    return jsonResponse(cors, { dados: JSON.parse(texto.slice(inicio, fim + 1)), tokens: corpo.usage?.total_tokens ?? null });
  } catch (err) {
    return jsonResponse(cors, { error: (err as Error).message }, 500);
  }
});
