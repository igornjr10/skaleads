import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guard, isUuid, jsonResponse } from "../_shared/auth.ts";
import { erroDoProvedor, limiteDeTokens, provedorLLM } from "../_shared/llm.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_TRANSCRICAO = 60_000;

const INSTRUCOES = `Voce resume reunioes de uma agencia de trafego pago (Meta Ads) com clientes ou com o proprio time.
Recebe o registro da reuniao (pauta, decisoes, observacoes, acoes ja anotadas) e, quando houver, a transcricao.
Devolve SO um JSON, em portugues do Brasil.

Regras:
- Use so o que esta no registro e na transcricao. Nao invente numero, nome, data nem compromisso.
- "resumo": markdown curto (3 a 8 linhas): contexto em 1 frase e os pontos principais em topicos.
- "decisoes": o que ficou decidido, uma frase por item. Nao repita decisoes ja anotadas no registro.
- "acoes": tarefas concretas que alguem precisa fazer depois da reuniao, comecando por verbo.
  Nao repita acoes ja anotadas. "responsavel_sugerido" so se o nome aparecer claramente como dono da tarefa; senao null.
  "prazo_sugerido" em yyyy-mm-dd so se a data for dita ou dedutivel da data da reuniao; senao null.
- "pendencias": duvidas em aberto ou assuntos que ficaram para depois.
- Lista sem itens vira [].

Formato:
{
  "resumo": "markdown",
  "decisoes": ["..."],
  "acoes": [{ "texto": "...", "responsavel_sugerido": "nome" | null, "prazo_sugerido": "yyyy-mm-dd" | null }],
  "pendencias": ["..."]
}`;

interface Acao {
  texto?: string;
  responsavel_id?: string | null;
  prazo?: string | null;
  feito?: boolean;
}

function vazio(v: unknown) {
  return typeof v !== "string" || v.trim().length === 0;
}

function montarContexto(r: Record<string, unknown>, nomes: Map<string, string>) {
  const acoes = (Array.isArray(r.acoes) ? r.acoes : []) as Acao[];
  const quando = new Date(String(r.inicio)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const cliente = (r.clients as { name?: string } | null)?.name;
  let transcricao = typeof r.transcricao === "string" ? r.transcricao.trim() : "";
  const cortada = transcricao.length > MAX_TRANSCRICAO;
  if (cortada) transcricao = transcricao.slice(0, MAX_TRANSCRICAO);

  const linhas = [
    `Titulo: ${r.titulo}`,
    `Data: ${quando} (${r.duracao_min} min)`,
    cliente ? `Cliente: ${cliente}` : "Reuniao interna (sem cliente)",
    nomes.size ? `Participantes: ${[...nomes.values()].join(", ")}` : "",
    !vazio(r.pauta) ? `\nPauta:\n${r.pauta}` : "",
    !vazio(r.decisoes) ? `\nDecisoes ja anotadas:\n${r.decisoes}` : "",
    !vazio(r.observacoes) ? `\nObservacoes:\n${r.observacoes}` : "",
    acoes.length
      ? `\nAcoes ja anotadas:\n${acoes.filter(a => a.texto).map(a =>
          `- ${a.texto}${a.responsavel_id && nomes.get(a.responsavel_id) ? ` (resp.: ${nomes.get(a.responsavel_id)})` : ""}${a.prazo ? ` ate ${a.prazo}` : ""}${a.feito ? " [feita]" : ""}`
        ).join("\n")}`
      : "",
    transcricao ? `\nTranscricao${cortada ? " (cortada no limite)" : ""}:\n${transcricao}` : "",
  ];
  return linhas.filter(Boolean).join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { reuniao_id } = await req.json().catch(() => ({}));
    if (!isUuid(reuniao_id)) return jsonResponse(cors, { error: "Reunião inválida" }, 400);

    const acesso = await guard(req, cors);
    if (!acesso.ok) return acesso.response;

    const base = Deno.env.get("SUPABASE_URL");
    const headers = {
      apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
      Authorization: req.headers.get("Authorization") ?? "",
      "Content-Type": "application/json",
    };

    // Le com o JWT de quem pediu: a RLS decide se ele enxerga a reuniao.
    const res = await fetch(
      `${base}/rest/v1/reunioes?id=eq.${reuniao_id}` +
        "&select=id,titulo,inicio,duracao_min,pauta,decisoes,observacoes,acoes,transcricao,clients(name),reuniao_participantes(user_id)",
      { headers },
    );
    if (!res.ok) return jsonResponse(cors, { error: "Não foi possível ler a reunião" }, 500);
    const [reuniao] = await res.json();
    if (!reuniao) return jsonResponse(cors, { error: "Reunião não encontrada ou fora do seu acesso" }, 404);

    const temAcoes = Array.isArray(reuniao.acoes) && reuniao.acoes.length > 0;
    if (vazio(reuniao.transcricao) && vazio(reuniao.pauta) && vazio(reuniao.decisoes) && vazio(reuniao.observacoes) && !temAcoes) {
      return jsonResponse(cors, {
        error: "Nada para resumir ainda: cole a transcrição ou escreva pauta, decisões ou observações da reunião.",
      }, 400);
    }

    const ids = new Set<string>(
      ((reuniao.reuniao_participantes ?? []) as { user_id: string }[]).map(p => p.user_id)
        .concat(((reuniao.acoes ?? []) as Acao[]).map(a => a.responsavel_id ?? "").filter(isUuid)),
    );
    const nomes = new Map<string, string>();
    if (ids.size) {
      const perfis = await fetch(`${base}/rest/v1/profiles?id=in.(${[...ids].join(",")})&select=id,full_name,email`, { headers })
        .then(r => (r.ok ? r.json() : []))
        .catch(() => []);
      for (const p of perfis as { id: string; full_name: string | null; email: string | null }[]) {
        nomes.set(p.id, p.full_name || p.email || "");
      }
    }

    const ia = provedorLLM();
    const resposta = await fetch(ia.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${ia.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ia.model,
        ...limiteDeTokens(ia, 2500),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: INSTRUCOES },
          { role: "user", content: montarContexto(reuniao, nomes) },
        ],
      }),
    });

    if (!resposta.ok) throw await erroDoProvedor(ia, resposta);
    const corpo = await resposta.json();
    const texto: string = corpo.choices?.[0]?.message?.content ?? "";
    const inicio = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    if (inicio < 0 || fim <= inicio) throw new Error("A IA não devolveu o resumo");
    const bruto = JSON.parse(texto.slice(inicio, fim + 1));

    const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []);
    const dados = {
      resumo: typeof bruto.resumo === "string" ? bruto.resumo.trim() : "",
      decisoes: lista(bruto.decisoes),
      pendencias: lista(bruto.pendencias),
      acoes: (Array.isArray(bruto.acoes) ? bruto.acoes : [])
        .filter((a: unknown) => a && typeof (a as Acao).texto === "string" && (a as Acao).texto!.trim())
        .map((a: Record<string, unknown>) => ({
          texto: String(a.texto).trim(),
          responsavel_sugerido: typeof a.responsavel_sugerido === "string" && a.responsavel_sugerido.trim() ? a.responsavel_sugerido.trim() : null,
          prazo_sugerido: typeof a.prazo_sugerido === "string" && a.prazo_sugerido.trim() ? a.prazo_sugerido.trim() : null,
        })),
    };
    if (!dados.resumo) throw new Error("A IA devolveu um resumo vazio");

    // Grava com o JWT do usuario: participante e quem marcou podem; quem so enxerga, nao.
    const gravou = await fetch(`${base}/rest/v1/reunioes?id=eq.${reuniao_id}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ resumo_ia: dados.resumo }),
    });
    // Sem permissao de editar, a RLS devolve 200 com zero linhas.
    const salvo = gravou.ok && ((await gravou.json().catch(() => [])) as unknown[]).length > 0;

    return jsonResponse(cors, { success: true, dados, salvo, tokens: corpo.usage?.total_tokens ?? null });
  } catch (err) {
    return jsonResponse(cors, { error: (err as Error).message }, 500);
  }
});
