// Gemeas de supabase/functions/_shared/wa-crm.ts: a chave tambem vive no banco
// (public.wa_chave). Mudou uma, muda as tres.

export const VARIAVEIS_MODELO = [
  { chave: "nome", descricao: "Primeiro nome do contato" },
  { chave: "nome_completo", descricao: "Nome completo do contato" },
  { chave: "empresa", descricao: "Empresa do lead" },
  { chave: "cidade", descricao: "Cidade" },
  { chave: "segmento", descricao: "Segmento" },
] as const;

/** Pais + DDD + 8 ultimos digitos: casa numero com e sem 55 e com e sem o 9. */
export function chaveTelefone(t: string | null | undefined): string | null {
  const n = (t ?? "").replace(/\D/g, "");
  if (n.length < 8) return null;
  if (n.length === 10 || n.length === 11) return `55${n.slice(0, 2)}${n.slice(-8)}`;
  if (n.startsWith("55") && (n.length === 12 || n.length === 13)) return `${n.slice(0, 4)}${n.slice(-8)}`;
  return n;
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

/** "5511988887777" -> "(11) 98888-7777"; o resto passa como veio. */
export function formatarTelefone(t: string | null | undefined): string {
  const n = (t ?? "").replace(/\D/g, "");
  const local = n.startsWith("55") && (n.length === 12 || n.length === 13) ? n.slice(2) : n;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return t ?? "";
}
