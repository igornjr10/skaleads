// Recebe os eventos da Autentique e atualiza o contrato na hora, em vez de
// esperar a proxima varredura.
//
// Sem JWT (verify_jwt = false): quem chama e a Autentique. A URL cadastrada no
// painel deles leva `?empresa=<company_id>`, que diz qual token e qual segredo
// usar; a autorizacao de verdade e o HMAC com o segredo daquela empresa.
//
// Em vez de interpretar o payload de cada um dos 17 eventos, o handler so
// extrai o id do documento e vai buscar o estado atual na API: o que a gente
// grava e sempre o que a Autentique diz agora — e a entrega fora de ordem, que
// a doc deles avisa que acontece, deixa de importar.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { graphql, montarLinha, acharIdDoDocumento, CAMPOS_DO_DOCUMENTO, type Documento } from "../_shared/autentique.ts";
import { isUuid } from "../_shared/auth.ts";

// O id vai literal na query, sem variavel: o id da Autentique e um hash hex e
// nao da para conferir aqui o nome do tipo que o schema deles espera.
const ID_SEGURO = /^[A-Za-z0-9_-]{8,128}$/;
const consultaDoDocumento = (id: string) => `query { document(id: "${id}") { ${CAMPOS_DO_DOCUMENTO} } }`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

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

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
  const svc = { apikey: svcKey, Authorization: `Bearer ${svcKey}`, "Content-Type": "application/json" };

  // Le o corpo cru: o HMAC e sobre os bytes que chegaram, e um JSON.stringify
  // do objeto ja parseado muda espacos e ordem e derruba a validacao.
  const corpoCru = await req.text();

  const empresa = new URL(req.url).searchParams.get("empresa");
  if (!isUuid(empresa)) return json({ error: "URL sem ?empresa=<id>" }, 400);

  const [config] = await fetch(
    `${supabaseUrl}/rest/v1/autentique_config?company_id=eq.${empresa}&select=token,webhook_secret`,
    { headers: svc }
  ).then((r) => r.json()).catch(() => []) as Array<{ token: string; webhook_secret: string | null }>;

  if (!config?.webhook_secret) return json({ error: "Webhook da Autentique nao configurado para esta empresa" }, 401);

  const assinatura = req.headers.get("x-autentique-signature");
  if (!assinatura || !(await assinaturaConfere(corpoCru, assinatura, config.webhook_secret))) {
    return json({ error: "Assinatura invalida" }, 401);
  }

  try {
    const payload = JSON.parse(corpoCru);
    const tipo: string = payload?.event?.type ?? "desconhecido";
    const documentoId = acharIdDoDocumento(payload);

    // Sem id de documento nao ha o que atualizar (member.created, por exemplo).
    // Responde 200 assim mesmo: 4xx aqui so faz a Autentique reenviar para
    // sempre um evento que nunca vamos conseguir tratar.
    if (!documentoId || !ID_SEGURO.test(documentoId)) return json({ ok: true, tipo, ignorado: "evento sem documento" });

    if (tipo === "document.deleted") {
      await fetch(
        `${supabaseUrl}/rest/v1/contratos?autentique_id=eq.${encodeURIComponent(documentoId)}&company_id=eq.${empresa}`,
        { method: "DELETE", headers: svc }
      );
      return json({ ok: true, tipo, documento: documentoId, removido: true });
    }

    const data = await graphql<{ document: Documento | null }>(config.token, consultaDoDocumento(documentoId));
    const doc = data.document;
    if (!doc) return json({ ok: true, tipo, ignorado: "documento nao encontrado" });

    const clientes: Array<{ id: string; name: string }> = await fetch(
      `${supabaseUrl}/rest/v1/clients?select=id,name&company_id=eq.${empresa}`,
      { headers: svc }
    ).then((r) => r.json());

    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/gravar_contratos`, {
      method: "POST",
      headers: svc,
      body: JSON.stringify({ _company_id: empresa, _linhas: [montarLinha(doc, clientes)] }),
    });
    if (!res.ok) throw new Error(`gravar_contratos falhou (${res.status}): ${await res.text().catch(() => "")}`);

    return json({ ok: true, tipo, documento: doc.id });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
