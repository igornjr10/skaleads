// Retrato diario do Instagram de cada cliente, para a serie nao ter teto.
//
// A Graph API so entrega insights de perfil dos ultimos 30 dias e o total de
// seguidores so de hoje. Guardando um retrato por dia, "quanto cresceu nos
// ultimos 6 meses" passa a ter resposta.
//
// Chamada pelo pg_cron com Authorization: Bearer <anon key> (satisfaz o
// verify_jwt do gateway) + x-cron-secret proprio, mesmo padrao do
// sync-meta-cron.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const META_BASE = "https://graph.facebook.com/v21.0";

// A Meta recusa janela maior que 30 dias em insights de perfil.
const JANELA_MAX_DIAS = 29;

interface ClientRow {
  id: string;
  name: string;
  meta_instagram_account_id: string;
  token: string;
}

interface Retrato {
  client_id: string;
  date: string;
  followers_total?: number;
  followers_gained?: number;
  profile_views?: number;
}

async function rpc<T>(url: string, key: string, nome: string, args: object): Promise<T> {
  const res = await fetch(`${url}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${nome} falhou (${res.status}): ${await res.text().catch(() => "")}`);
  return (await res.json()) as T;
}

/** Grava pela RPC, e nao pelo upsert do PostgREST: o lote tem linhas com chaves
 *  diferentes, e o que chega vazio nao pode apagar o que ja foi medido. */
function gravar(url: string, key: string, linhas: Retrato[]) {
  return rpc<number>(url, key, "gravar_instagram_diario", { _linhas: linhas });
}

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${META_BASE}/${path}?${new URLSearchParams(params)}`);
  const json = await res.json();
  if (!res.ok || json?.error) {
    throw new Error(json?.error?.message ?? `Meta respondeu ${res.status}`);
  }
  return json as T;
}

function iso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** O dia que o balde `end_time` representa: a Meta carimba o fim da janela. */
function diaDoBalde(endTime: string): string {
  const d = new Date(endTime);
  d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
}

async function coletar(cliente: ClientRow, desde: string, ate: string): Promise<Retrato[]> {
  const igId = cliente.meta_instagram_account_id;
  const token = cliente.token.trim();
  const porDia = new Map<string, Retrato>();
  const linha = (date: string) => {
    const existente = porDia.get(date);
    if (existente) return existente;
    const nova: Retrato = { client_id: cliente.id, date };
    porDia.set(date, nova);
    return nova;
  };

  // O total absoluto so existe para hoje — nao da para pedir o de ontem. E por
  // isso que este retrato precisa ser diario: o passado nao volta.
  const perfil = await graph<{ followers_count?: number }>(igId, {
    fields: "followers_count",
    access_token: token,
  });
  if (typeof perfil.followers_count === "number") {
    linha(iso(new Date())).followers_total = perfil.followers_count;
  }

  // Ja estes a Meta entrega 30 dias para tras, entao a primeira execucao nasce
  // com um mes de historico.
  const serie = await graph<{ data?: Array<{ values?: Array<{ end_time?: string; value?: number }> }> }>(
    `${igId}/insights`,
    { metric: "follower_count", period: "day", since: desde, until: ate, access_token: token }
  );
  const baldes = serie.data?.[0]?.values ?? [];
  // O ultimo balde e o dia que a Meta ainda nao fechou e volta sempre zero.
  for (const balde of baldes.slice(0, -1)) {
    if (!balde.end_time || typeof balde.value !== "number") continue;
    linha(diaDoBalde(balde.end_time)).followers_gained = balde.value;
  }

  // `profile_views` so responde com metric_type=total_value, que devolve um
  // numero unico da janela — sem quebra por dia. Entao pedimos so o dia de
  // ontem, que e o ultimo dia que a Meta ja fechou.
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  try {
    const visitas = await graph<{ data?: Array<{ total_value?: { value?: number } }> }>(`${igId}/insights`, {
      metric: "profile_views",
      metric_type: "total_value",
      period: "day",
      since: iso(ontem),
      until: iso(new Date()),
      access_token: token,
    });
    const valor = visitas.data?.[0]?.total_value?.value;
    if (typeof valor === "number") linha(iso(ontem)).profile_views = valor;
  } catch {
    // Visitas faltando nao invalidam o retrato de seguidores do dia.
  }

  return [...porDia.values()];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
      },
    });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SVC_ROLE_KEY")!;

  try {
    if (!supabaseUrl || !svcKey) throw new Error("SUPABASE_URL / SVC_ROLE_KEY nao configurados");

    const hoje = new Date();
    const desde = new Date(hoje);
    desde.setDate(desde.getDate() - JANELA_MAX_DIAS);

    // O pg_net corta a chamada em 5 segundos. Em vez de torcer para a function
    // sobreviver ao corte, cada execucao avanca um pedaco: a RPC devolve so
    // quem ainda falta hoje. Rodando de hora em hora, a carteira fecha o dia.
    const MAX_POR_EXECUCAO = 12;
    const pendentes = await rpc<ClientRow[]>(supabaseUrl, svcKey, "clientes_instagram_pendentes", {
      _limite: MAX_POR_EXECUCAO,
    });

    let gravados = 0;
    const falhas: Array<{ cliente: string; erro: string }> = [];

    // Em serie, e nao em paralelo: sao ate 3 chamadas a Meta por cliente e
    // disparar tudo de uma vez convida rate limit na conta do app.
    for (const cliente of pendentes) {
      try {
        const retratos = await coletar(cliente, iso(desde), iso(hoje));
        if (retratos.length > 0) {
          await gravar(supabaseUrl, svcKey, retratos);
          gravados += retratos.length;
        }
      } catch (e) {
        // Marca a tentativa gravando a linha do dia vazia. Sem isto o cliente
        // quebrado volta em toda execucao e come a vaga de quem esta saudavel.
        await gravar(supabaseUrl, svcKey, [{ client_id: cliente.id, date: iso(hoje) }]).catch(() => {});
        falhas.push({ cliente: cliente.name, erro: String(e instanceof Error ? e.message : e).slice(0, 160) });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        tentados: pendentes.length,
        retratos: gravados,
        falhas,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
