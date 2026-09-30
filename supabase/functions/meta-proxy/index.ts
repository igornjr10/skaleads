import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guard, isUuid, jsonResponse } from "../_shared/auth.ts";
import { tokenDoCliente, type TipoToken } from "../_shared/meta-token.ts";

// O browser chama a Graph API por aqui: manda o cliente e o recurso, o token
// sai do cofre (client_secrets) e nunca volta na resposta.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// So caminho de recurso: sem esquema, host ou query. Token e query sao montados aqui.
const PATH_RE = /^[A-Za-z0-9_.\-/]{1,200}$/;
const VERSAO_RE = /^v\d{1,2}\.\d$/;

// Viewer le o que ja foi sincronizado; nao dispara chamada nova na conta do cliente.
const PAPEIS = ["owner", "admin", "analyst"];

const MAX_PAGINAS = 400;

interface Pedido {
  clientId?: string;
  tipo?: TipoToken;
  versao?: string;
  path?: string;
  params?: Record<string, string>;
  mode?: "object" | "list";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const pedido: Pedido = await req.json().catch(() => ({}));
    const { clientId, tipo = "conta", versao = "v21.0", path, params = {}, mode = "object" } = pedido;

    if (!isUuid(clientId)) return jsonResponse(cors, { error: "clientId inválido" }, 400);
    if (!path || !PATH_RE.test(path) || path.includes("..")) return jsonResponse(cors, { error: "Path inválido" }, 400);
    if (!VERSAO_RE.test(versao)) return jsonResponse(cors, { error: "Versão da Graph API inválida" }, 400);

    const acesso = await guard(req, cors, { clientId, roles: PAPEIS });
    if (!acesso.ok) return acesso.response;

    const token = await tokenDoCliente(clientId, tipo === "pagina" ? "pagina" : "conta");
    if (!token) return jsonResponse(cors, { error: "Cliente sem token da Meta configurado" }, 409);

    const query = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) {
      if (chave === "access_token" || valor == null) continue;
      query.set(chave, String(valor));
    }
    query.set("access_token", token);
    const base = `https://graph.facebook.com/${versao}`;

    if (mode === "object") {
      const res = await fetch(`${base}/${path}?${query}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.error) {
        return jsonResponse(cors, { error: data?.error?.message ?? `Meta respondeu ${res.status}`, metaError: data?.error ?? null }, 502);
      }
      return jsonResponse(cors, data);
    }

    // A paginacao fica aqui: o paging.next da Meta traz o token na URL, e
    // devolve-lo ao browser recriaria o vazamento.
    const itens: unknown[] = [];
    let url: string | undefined = `${base}/${path}?${query}`;
    let paginas = 0;
    while (url && paginas < MAX_PAGINAS) {
      const res: Response = await fetch(url);
      const pagina = await res.json().catch(() => null);
      if (!res.ok || pagina?.error) {
        return jsonResponse(cors, { error: pagina?.error?.message ?? `Meta respondeu ${res.status}`, metaError: pagina?.error ?? null }, 502);
      }
      itens.push(...(pagina.data ?? []));
      url = pagina.paging?.next;
      paginas++;
    }

    return jsonResponse(cors, { data: itens, truncated: paginas >= MAX_PAGINAS && Boolean(url) });
  } catch (err) {
    return jsonResponse(cors, { error: (err as Error).message }, 500);
  }
});
