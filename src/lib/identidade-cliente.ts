import { supabase } from "@/integrations/supabase/client";
import { type Assessoria, type IdentidadeRelatorio, identidadeDa, resolverAssessoria } from "./identidade-relatorio";

const COLUNAS = "id, nome, aliases, logo_url, cor_primaria, cor_secundaria, cor_destaque, cor_fundo, cor_texto, modelo";

/**
 * Identidade de um cliente para os relatorios que saem sem editor (painel de
 * PDF, envio rapido): a assessoria vinculada, ou a escolhida para este
 * relatorio. Sem vinculo nem escolha (ou antes da migration) volta nulo e o
 * relatorio sai no azul padrao, como sempre saiu.
 */
export async function identidadeDoCliente(clientId: string, escolhidaId?: string | null): Promise<IdentidadeRelatorio | null> {
  const [{ data: assessorias, error }, { data: cliente }] = await Promise.all([
    supabase.from("assessorias" as never).select(COLUNAS),
    supabase.from("clients").select("assessoria_id").eq("id", clientId).maybeSingle(),
  ]);
  if (error || !assessorias) return null;
  const r = resolverAssessoria({
    assessorias: assessorias as unknown as Assessoria[],
    escolhidaId,
    doClienteId: (cliente as { assessoria_id?: string | null } | null)?.assessoria_id ?? null,
  });
  return r.assessoria ? identidadeDa(r.assessoria) : null;
}
