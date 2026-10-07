// Ponte com a Autentique: a API e GraphQL, nao tem REST.
// Limite da casa: 60 requisicoes por minuto.
export const AUTENTIQUE_URL = "https://api.autentique.com.br/v2/graphql";

export interface Assinatura {
  public_id: string | null;
  name: string | null;
  email: string | null;
  viewed: { created_at: string } | null;
  signed: { created_at: string } | null;
  rejected: { created_at: string } | null;
}

export interface Documento {
  id: string;
  name: string | null;
  created_at: string | null;
  signatures: Assinatura[] | null;
  files: { original: string | null; signed: string | null } | null;
}

export async function graphql<T>(token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(AUTENTIQUE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Autentique respondeu ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  if (json.errors?.length) throw new Error(`Autentique: ${json.errors.map((e: { message: string }) => e.message).join("; ").slice(0, 300)}`);
  return json.data as T;
}

/**
 * O status que a tela mostra, derivado dos signatarios.
 *
 * Recusado ganha de tudo: um signatario que recusou trava o documento mesmo que
 * os outros ja tenham assinado. E "assinado" exige todo mundo — faltando um, o
 * contrato ainda nao vale.
 */
export function statusDoDocumento(assinaturas: Assinatura[]): {
  status: "assinado" | "recusado" | "pendente";
  assinadoEm: string | null;
} {
  if (assinaturas.length === 0) return { status: "pendente", assinadoEm: null };
  if (assinaturas.some((a) => a.rejected?.created_at)) return { status: "recusado", assinadoEm: null };

  const datas = assinaturas.map((a) => a.signed?.created_at ?? null);
  if (datas.some((d) => !d)) return { status: "pendente", assinadoEm: null };

  // A data que interessa e a da ultima assinatura: e quando o contrato fechou.
  const ultima = datas.filter((d): d is string => Boolean(d)).sort().at(-1) ?? null;
  return { status: "assinado", assinadoEm: ultima };
}

/** Sem acento, sem pontuacao, espaco unico: "ERNESTO VEÍCULOS" e "ernesto veiculos". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * De qual cliente e este documento.
 *
 * So devolve quando nao ha duvida: se o nome de dois clientes cabe no mesmo
 * nome de documento (por exemplo "MARE" e "MARE FIT"), preferimos o mais
 * especifico; se ainda assim empatar, ninguem e escolhido e a linha fica para
 * alguem vincular na tela. Chute silencioso em contrato e pior que campo vazio.
 */
export function acharCliente(
  nomeDoDocumento: string,
  clientes: Array<{ id: string; name: string }>
): string | null {
  const alvo = normalizar(nomeDoDocumento);
  if (!alvo) return null;

  const candidatos = clientes
    .map((c) => ({ id: c.id, chave: normalizar(c.name) }))
    .filter((c) => c.chave.length >= 3 && alvo.includes(c.chave));
  if (candidatos.length === 0) return null;

  const maiorNome = Math.max(...candidatos.map((c) => c.chave.length));
  const vencedores = candidatos.filter((c) => c.chave.length === maiorNome);
  return vencedores.length === 1 ? vencedores[0].id : null;
}

export const CAMPOS_DO_DOCUMENTO = `
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
`;

/** A linha que `gravar_contratos` espera. */
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

/**
 * O id do documento a partir do corpo do webhook.
 *
 * Evento de documento traz o documento em `event.data.object`; evento de
 * assinatura traz a assinatura solta em `event.data`, com o id do documento em
 * `document` (string). Member nao tem documento.
 */
export function acharIdDoDocumento(payload: unknown): string | null {
  const dados = (payload as { event?: { data?: Record<string, unknown> } })?.event?.data;
  if (!dados) return null;
  const objeto = dados.object as { id?: unknown; object?: unknown; document?: unknown } | undefined;

  const candidatos: unknown[] = [];
  if (objeto && typeof objeto === "object") {
    if (objeto.object === "document" || objeto.object === undefined) candidatos.push(objeto.id);
    candidatos.push(objeto.document);
  }
  candidatos.push(dados.document, (dados.document as { id?: unknown } | undefined)?.id, dados.document_id);

  const achado = candidatos.find((c) => typeof c === "string" && c.length > 0);
  return (achado as string | undefined) ?? null;
}
