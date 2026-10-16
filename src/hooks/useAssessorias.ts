import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Assessoria } from "@/lib/identidade-relatorio";

const COLUNAS = "id, nome, aliases, logo_url, cor_primaria, cor_secundaria, cor_destaque, cor_fundo, cor_texto, modelo, ordem";

export type NovaAssessoria = Omit<Assessoria, "id"> & { id?: string };

/**
 * Assessorias da empresa (a RLS limita a empresa de quem esta logado).
 * `disponivel` e falso enquanto a migration nao rodou: as telas seguem como
 * antes, com a marca da empresa, em vez de quebrar.
 */
export function useAssessorias() {
  const [assessorias, setAssessorias] = useState<Assessoria[]>([]);
  const [disponivel, setDisponivel] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from("assessorias" as never)
      .select(COLUNAS)
      .order("ordem")
      .order("nome");
    setDisponivel(!error);
    setAssessorias(error ? [] : ((data ?? []) as unknown as Assessoria[]));
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar(a: NovaAssessoria) {
    const { id, ...campos } = a;
    const { error } = id
      ? await supabase.from("assessorias" as never).update(campos as never).eq("id", id)
      : await supabase.from("assessorias" as never).insert(campos as never);
    if (error) throw error;
    await carregar();
  }

  async function remover(id: string) {
    const { error } = await supabase.from("assessorias" as never).delete().eq("id", id);
    if (error) throw error;
    await carregar();
  }

  return { assessorias, disponivel, carregando, salvar, remover, recarregar: carregar };
}
