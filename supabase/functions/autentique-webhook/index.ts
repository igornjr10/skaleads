// Recebe os eventos da Autentique e atualiza o contrato na hora, em vez de
// esperar a proxima varredura.
//
// Precisa ser deployada com --no-verify-jwt: quem chama e a Autentique, que nao
// tem como mandar um JWT do Supabase. A autorizacao aqui e a assinatura HMAC.
//
// Em vez de tentar interpretar o payload de cada um dos 17 eventos (documento,
// assinatura, membro), o handler so extrai o id do documento e vai buscar o
// estado atual na API. Um caminho so, e o que a gente grava e sempre o que a
// Autentique diz agora — nao a nossa leitura do evento.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { graphql, statusDoDocumento, acharCliente, type Documento } from "../_shared/autentique.ts";

const QUERY = `
  query($id: UUID!) {
    document(id: $id) {
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
`;

/** Comparacao em tempo constante: `a === b` vaza o tamanho do prefixo certo. */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

async function assinaturaConfere(corpoCru: string, assinaturaRecebida: string, segredo: string): Promise<boolean> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpoCru));
  const esperada = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return iguaisEmTempoConstante(esperada, assinaturaRecebida.trim().toLowerCase());
}

/** O id do documento, venha o evento de documento, de assinatura ou de membro. */
export function acharIdDoDocumento(payload: unknown): string | null {
  const dados = (payload as { event?: { data?: Record<string, unknown> } })?.event?.data;
  if (!dados) return null;
  const documento = dados.document as { id?: unknown } | undefined;
  const candidato = documento?.id ?? dados.document_id ?? dados.id;
  return typeof candidato === "string" && candidato.length > 0 ? candidato : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, x-autentique-signature",
      },
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  const segredo = Deno.env.get("AUTENTIQUE_WEBHOOK_SECRET");
  const token = Deno.env.get("AUTENTIQUE_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SVC_ROLE_KEY")!;

  // Le o corpo cru: o HMAC e sobre os bytes que chegaram, e um JSON.stringify
  // do objeto ja parseado muda espacos e ordem e derruba a validacao.
  const corpoCru = await req.text();

  if (!segredo) {
    return new Response(JSON.stringify({ error: "AUTENTIQUE_WEBHOOK_SECRET nao configurado" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
  const assinatura = req.headers.get("x-autentique-signature");
  if (!assinatura || !(await assinaturaConfere(corpoCru, assinatura, segredo))) {
    return new Response(JSON.stringify({ error: "Assinatura invalida" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (!token) throw new Error("AUTENTIQUE_TOKEN nao configurado");

    const payload = JSON.parse(corpoCru);
    const tipo = payload?.event?.type ?? "desconhecido";
    const documentoId = acharIdDoDocumento(payload);

    // Sem id de documento nao ha o que atualizar (member.created, por exemplo).
    // Responde 200 assim mesmo: 4xx aqui so faz a Autentique reenviar para
    // sempre um evento que nunca vamos conseguir tratar.
    if (!documentoId) {
      return new Response(JSON.stringify({ ok: true, tipo, ignorado: "evento sem documento" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await graphql<{ document: Documento | null }>(token, QUERY, { id: documentoId });
    const doc = data.document;
    if (!doc) {
      return new Response(JSON.stringify({ ok: true, tipo, ignorado: "documento nao encontrado" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const clientes: Array<{ id: string; name: string }> = await fetch(
      `${supabaseUrl}/rest/v1/clients?select=id,name`,
      { headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` } }
    ).then((r) => r.json());

    const assinaturas = doc.signatures ?? [];
    const { status, assinadoEm } = statusDoDocumento(assinaturas);
    const linha = {
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

    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/gravar_contratos`, {
      method: "POST",
      headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ _linhas: [linha] }),
    });
    if (!res.ok) throw new Error(`gravar_contratos falhou (${res.status}): ${await res.text().catch(() => "")}`);

    return new Response(JSON.stringify({ ok: true, tipo, documento: doc.id, status }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
