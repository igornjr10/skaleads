// Espelha os contratos da Autentique aqui.
//
// A Autentique continua sendo a fonte: quem cria e assina documento e o painel
// deles. Isto so traz o que ja existe para o time ver a carteira inteira numa
// tela e saber quem ainda nao assinou.
//
// O token e por empresa (`autentique_config`, cadastrado pelo ADM na tela).
// O pg_cron chama com x-cron-secret e varre todas as empresas; o botao
// Sincronizar chama com o JWT do usuario e varre so a empresa dele.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { graphql, montarLinha, CAMPOS_DO_DOCUMENTO, type Documento } from "../_shared/autentique.ts";
import { getUser, companyIdsOf } from "../_shared/auth.ts";

const POR_PAGINA = 60;
// A Autentique corta em 60 requisicoes por minuto. Com 60 documentos por
// pagina, este teto cobre 3000 contratos sem chegar perto do limite.
const MAX_PAGINAS = 50;

const QUERY = `
  query($page: Int!, $limit: Int!) {
    documents(page: $page, limit: $limit) {
      total
      data { ${CAMPOS_DO_DOCUMENTO} }
    }
  }
`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function db<T>(url: string, key: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`${path.split("?")[0]} falhou (${res.status}): ${await res.text().catch(() => "")}`);
  return (await res.json()) as T;
}

async function sincronizarEmpresa(url: string, key: string, empresa: string, token: string) {
  const clientes = await db<Array<{ id: string; name: string }>>(
    url, key, `clients?select=id,name&company_id=eq.${empresa}`
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
    await db(url, key, "rpc/gravar_contratos", {
      method: "POST",
      body: JSON.stringify({ _company_id: empresa, _linhas: linhas }),
    });
    gravados += linhas.length;

    if (lote.length < POR_PAGINA) break;
    pagina += 1;
  }

  return { totalNaAutentique: total, gravados, semCliente };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET");
  const chamadaDeCron = req.headers.get("x-cron-secret");

  try {
    if (!supabaseUrl || !svcKey) throw new Error("SUPABASE_URL / SVC_ROLE_KEY nao configurados");

    let filtro = "";
    if (chamadaDeCron) {
      if (!cronSecret || chamadaDeCron !== cronSecret) return json({ error: "Unauthorized" }, 401);
    } else {
      const user = await getUser(req);
      if (!user) return json({ error: "Não autenticado" }, 401);
      const empresas = await companyIdsOf(user.id);
      if (empresas.length === 0) return json({ ok: false, error: "Usuário sem empresa" }, 403);
      filtro = `&company_id=in.(${empresas.join(",")})`;
    }

    const configs = await db<Array<{ company_id: string; token: string }>>(
      supabaseUrl, svcKey, `autentique_config?select=company_id,token${filtro}`
    );
    if (configs.length === 0) {
      if (chamadaDeCron) return json({ ok: true, empresas: 0 });
      return json({ ok: false, error: "Token da Autentique não configurado. Use Configurar Autentique na tela de Contratos." });
    }

    // Uma empresa por vez: o limite de 60/min e por token, mas a function tem
    // tempo contado e o volume aqui e pequeno.
    const resultado: Record<string, unknown> = {};
    let gravados = 0;
    let semCliente = 0;
    let totalNaAutentique = 0;
    const erros: string[] = [];
    for (const c of configs) {
      try {
        const r = await sincronizarEmpresa(supabaseUrl, svcKey, c.company_id, c.token);
        resultado[c.company_id] = r;
        gravados += r.gravados;
        semCliente += r.semCliente;
        totalNaAutentique += r.totalNaAutentique;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        resultado[c.company_id] = { error: msg };
        erros.push(msg);
      }
    }

    if (erros.length === configs.length) return json({ ok: false, error: erros[0], empresas: resultado }, 500);
    return json({ ok: true, totalNaAutentique, gravados, semCliente, empresas: resultado });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
