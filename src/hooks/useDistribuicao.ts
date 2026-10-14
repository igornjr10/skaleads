import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RegraDistribuicao {
  categoria: string;
  pessoas: string[];
  gestor_do_cliente: boolean;
}

/**
 * Regras de distribuicao automatica por categoria (tabela
 * demanda_distribuicao). Quem aplica e o trigger do banco; aqui so se le e,
 * para o ADM, se grava. Sem a migration a lista fica vazia e nada muda.
 */
export function useDistribuicao(ativo = true) {
  const [regras, setRegras] = useState<RegraDistribuicao[]>([]);
  const [disponivel, setDisponivel] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from("demanda_distribuicao" as never)
      .select("categoria, pessoas, gestor_do_cliente");
    setDisponivel(!error);
    setRegras(error ? [] : ((data ?? []) as RegraDistribuicao[]));
  }, []);

  useEffect(() => {
    if (ativo) carregar();
  }, [ativo, carregar]);

  const regraDe = useCallback((categoria: string) => regras.find(r => r.categoria === categoria) ?? null, [regras]);

  /** Sem ninguem e sem gestor, a regra sai: categoria volta a ficar sem distribuicao. */
  async function salvar(regra: RegraDistribuicao) {
    const vazia = regra.pessoas.length === 0 && !regra.gestor_do_cliente;
    const { error } = vazia
      ? await supabase.from("demanda_distribuicao" as never).delete().eq("categoria", regra.categoria)
      : await supabase
          .from("demanda_distribuicao" as never)
          .upsert({ ...regra, updated_at: new Date().toISOString() } as never, { onConflict: "company_id,categoria" });
    if (error) throw error;
    await carregar();
  }

  return { regras, regraDe, disponivel, salvar, recarregar: carregar };
}
