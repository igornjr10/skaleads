// Espelha os contratos da Autentique aqui.
//
// A Autentique continua sendo a fonte: quem cria e assina documento e o painel
// deles. Isto so traz o que ja existe para o time ver a carteira inteira numa
// tela e saber quem ainda nao assinou.
//
// Chamada pelo pg_cron com Authorization: Bearer <anon key> + x-cron-secret,
// mesmo padrao do sync-meta-cron.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { graphql, statusDoDocumento, acharCliente, type Documento } from "../_shared/autentique.ts";

const POR_PAGINA = 60;
// A Autentique corta em 60 requisicoes por minuto. Com 60 documentos por
// pagina, este teto cobre 3000 contratos sem chegar perto do limite.
const MAX_PAGINAS = 50;

const QUERY = `
  query($page: Int!, $limit: Int!) {
    documents(page: $page, limit: $limit) {
      total
      data {
        id
        name
        created_at
        signatures {
          public_id
          name
          email
          viewed { created_at }
          signed { created_at }
          rejected { created_at }
        }
        files { original signed }
      }
    }
  }
`;

function dbGet(url: string, key: string, path: string) {
  return fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  }).then((r) => r.json());
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

export function montarLinha(doc: Documento, clientes: Array<{ id: string; name: string }>) {
  const assinaturas = doc.signatures ?? [];
  const { status, assinadoEm } = statusDoDocumento(assinaturas);
  return {
    autentique_id: doc.id,
    client_id: acharCliente(doc.name ?? "", clientes),
    nome: doc.name ?? "(sem nome)",
    status,
    criado_em: doc.created_at,
    assinado_em: assinadoEm,
    arquivo_original: doc.files?.original ?? null,
    arquivo_assinado: doc.files?.signed ?? null,
    signatarios: assinaturas.map((a) => ({
      nome: a.name,
      email: a.email,
      visto_em: a.viewed?.created_at ?? null,
      assinado_em: a.signed?.created_at ?? null,
      recusado_em: a.rejected?.created_at ?? null,
    })),
  };
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
  const chamadaDeCron = req.headers.get("x-cron-secret");
  if (cronSecret && chamadaDeCron && chamadaDeCron !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
  const token = Deno.env.get("AUTENTIQUE_TOKEN");

  try {
    if (!token) throw new Error("AUTENTIQUE_TOKEN nao configurado nos secrets da function");
    if (!supabaseUrl || !svcKey) throw new Error("SUPABASE_URL / SVC_ROLE_KEY nao configurados");

    const clientes: Array<{ id: string; name: string }> = await dbGet(
      supabaseUrl, svcKey, "clients?select=id,name"
    );

    let pagina = 1;
    let total = 0;
    let gravados = 0;
    let semCliente = 0;

    while (pagina <= MAX_PAGINAS) {
      const data = await graphql<{ documents: { total: number; data: Documento[] } }>(
        token, QUERY, { page: pagina, limit: POR_PAGINA }
      );
      const lote = data.documents?.data ?? [];
      total = data.documents?.total ?? total;
      if (lote.length === 0) break;

      const linhas = lote.map((doc) => montarLinha(doc, clientes));
      semCliente += linhas.filter((l) => !l.client_id).length;
      await rpc(supabaseUrl, svcKey, "gravar_contratos", { _linhas: linhas });
      gravados += linhas.length;

      if (lote.length < POR_PAGINA) break;
      pagina += 1;
    }

    return new Response(
      JSON.stringify({ ok: true, totalNaAutentique: total, gravados, semCliente }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
