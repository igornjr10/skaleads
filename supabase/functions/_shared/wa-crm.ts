// Pecas comuns do WhatsApp no CRM: acesso ao banco com service_role, chave de
// telefone e preenchimento de modelo.
//
// `chaveTelefone` e `preencherModelo` tem gemeas em src/lib/whatsapp.ts (Deno
// nao importa de src/). A chave tambem existe no banco (public.wa_chave): as
// tres precisam andar juntas, senao mensagem e lead deixam de se encontrar.

export function env() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SVC_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SVC_ROLE_KEY nao configurados");
  return { url, key };
}

export async function db<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = env();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path.split("?")[0]}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

export function inserir<T = any>(tabela: string, linha: unknown, retornar = true): Promise<T> {
  return db<T>(tabela, {
    method: "POST",
    headers: { Prefer: retornar ? "return=representation" : "return=minimal" },
    body: JSON.stringify(linha),
  });
}

export function atualizar(path: string, mudanca: unknown) {
  return db(path, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(mudanca) });
}

/** Pais + DDD + 8 ultimos digitos: casa numero com e sem 55 e com e sem o 9. */
export function chaveTelefone(t: string | null | undefined): string | null {
  const n = (t ?? "").replace(/\D/g, "");
  if (n.length < 8) return null;
  if (n.length === 10 || n.length === 11) return `55${n.slice(0, 2)}${n.slice(-8)}`;
  if (n.startsWith("55") && (n.length === 12 || n.length === 13)) return `${n.slice(0, 4)}${n.slice(-8)}`;
  return n;
}

/** Numero para mandar a uazapi: so digitos, com 55 quando vier so DDD + numero. */
export function numeroParaEnvio(t: string | null | undefined): string | null {
  const n = (t ?? "").replace(/\D/g, "");
  if (n.length < 10) return null;
  return n.length <= 11 ? `55${n}` : n;
}

export interface DadosDoLead {
  contato_nome: string | null;
  empresa: string | null;
  cidade: string | null;
  segmento: string | null;
}

export function preencherModelo(texto: string, lead: DadosDoLead): string {
  const completo = (lead.contato_nome ?? "").trim();
  const valores: Record<string, string> = {
    nome: completo.split(/\s+/)[0] ?? "",
    nome_completo: completo,
    empresa: (lead.empresa ?? "").trim(),
    cidade: (lead.cidade ?? "").trim(),
    segmento: (lead.segmento ?? "").trim(),
  };
  return texto
    .replace(/\{(\w+)\}/g, (inteiro, chave: string) => (chave in valores ? valores[chave] : inteiro))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?])/g, "$1")
    .trim();
}
