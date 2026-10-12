import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/utils";
import { buscarTudo } from "@/lib/buscar-tudo";
import { type ClienteDaDemanda, type Demanda, type VinculosDemandas, SEM_VINCULOS, paraDemanda } from "@/lib/demandas";

export interface ClienteResumo {
  id: string;
  name: string;
  logo_url: string | null;
  status?: string;
}

export interface Pessoa {
  id: string;
  nome: string;
  role: string;
}

/**
 * Demandas que a pessoa enxerga (a RLS decide), a equipe e os clientes.
 * `clientesDaCarteira` e onde ela pode abrir demanda; `clientePorId` tambem
 * resolve o nome de cliente de fora da carteira que chegou numa demanda dela.
 */
export function useDemandas() {
  const [demandas, setDemandas] = useState<Demanda[]>([]);
  const [clientesDaCarteira, setClientesDaCarteira] = useState<ClienteResumo[]>([]);
  const [clientesDasDemandas, setClientesDasDemandas] = useState<ClienteResumo[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [vinculos, setVinculos] = useState<VinculosDemandas>(SEM_VINCULOS);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    // Uma demanda "todos os clientes" vira dezenas de linhas em task_clientes:
    // as duas listas grandes paginam para nao cortar em 1000.
    const vinculosDe = <T,>(tabela: "task_clientes" | "task_corresponsaveis", colunas: string) =>
      buscarTudo<T>((de, ate) => supabase.from(tabela).select(colunas).order("task_id").range(de, ate) as never)
        .then(data => ({ data, ok: true }))
        .catch(() => ({ data: [] as T[], ok: false }));

    const [demandasRes, carteiraRes, nomesRes, papeisRes, perfisRes, clientesRes, corresRes] = await Promise.all([
      buscarTudo<Record<string, unknown>>((de, ate) =>
        supabase.from("tasks").select("*").order("prazo", { ascending: true, nullsFirst: false }).order("id").range(de, ate)
      ).then(data => ({ data, error: null }), (error: unknown) => ({ data: [] as Record<string, unknown>[], error })),
      supabase.from("clients").select("id, name, logo_url, status").neq("status", "archived").order("name"),
      supabase.rpc("clientes_das_minhas_demandas"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("profiles").select("id, full_name, email"),
      vinculosDe<{ task_id: string; client_id: string; feito: boolean }>("task_clientes", "task_id, client_id, feito"),
      vinculosDe<{ task_id: string; user_id: string }>("task_corresponsaveis", "task_id, user_id"),
    ]);

    if (demandasRes.error) toast.error(errorMessage(demandasRes.error, "Não foi possível carregar as demandas"));

    // Sem as tabelas (migration ainda nao rodou) a tela segue no modelo antigo.
    if (!clientesRes.ok || !corresRes.ok) {
      setVinculos(SEM_VINCULOS);
    } else {
      const clientes = new Map<string, ClienteDaDemanda[]>();
      for (const r of clientesRes.data) {
        clientes.set(r.task_id, [...(clientes.get(r.task_id) ?? []), { client_id: r.client_id, feito: r.feito }]);
      }
      const corresponsaveis = new Map<string, string[]>();
      for (const r of corresRes.data) {
        corresponsaveis.set(r.task_id, [...(corresponsaveis.get(r.task_id) ?? []), r.user_id]);
      }
      setVinculos({ disponivel: true, clientes, corresponsaveis });
    }

    const papeis = new Map(((papeisRes.data ?? []) as { user_id: string; role: string }[]).map(r => [r.user_id, r.role]));
    const equipe = ((perfisRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[])
      .map(p => ({ id: p.id, nome: p.full_name || p.email || p.id.slice(0, 8), role: papeis.get(p.id) ?? "viewer" }))
      .sort((a, b) => a.nome.localeCompare(b.nome));

    setDemandas((demandasRes.data ?? []).map(paraDemanda));
    setClientesDaCarteira((carteiraRes.data as ClienteResumo[]) ?? []);
    setClientesDasDemandas((nomesRes.data as ClienteResumo[]) ?? []);
    setPessoas(equipe);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Mudanca feita por outra pessoa (ou pelo cron) aparece sem recarregar a tela.
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined;
    const recarregar = () => {
      clearTimeout(espera);
      espera = setTimeout(() => { carregar(); }, 800);
    };
    const canal = supabase
      .channel(`tasks-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, recarregar)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_clientes" }, recarregar)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_corresponsaveis" }, recarregar)
      .subscribe();
    return () => {
      clearTimeout(espera);
      supabase.removeChannel(canal);
    };
  }, [carregar]);

  const clientePorId = useMemo(
    () => new Map([...clientesDasDemandas, ...clientesDaCarteira].map(c => [c.id, c])),
    [clientesDasDemandas, clientesDaCarteira]
  );
  const pessoaPorId = useMemo(() => new Map(pessoas.map(p => [p.id, p])), [pessoas]);

  const substituir = useCallback((demanda: Demanda) => {
    setDemandas(atual => {
      const existe = atual.some(d => d.id === demanda.id);
      return existe ? atual.map(d => (d.id === demanda.id ? demanda : d)) : [...atual, demanda];
    });
  }, []);

  const remover = useCallback((id: string) => setDemandas(atual => atual.filter(d => d.id !== id)), []);

  /** Troca os clientes e/ou corresponsaveis de uma demanda no estado local. */
  const definirVinculos = useCallback((taskId: string, mudanca: { clientes?: ClienteDaDemanda[]; corresponsaveis?: string[] }) => {
    setVinculos(atual => {
      if (!atual.disponivel) return atual;
      const clientes = new Map(atual.clientes);
      const corresponsaveis = new Map(atual.corresponsaveis);
      if (mudanca.clientes) clientes.set(taskId, mudanca.clientes);
      if (mudanca.corresponsaveis) corresponsaveis.set(taskId, mudanca.corresponsaveis);
      return { disponivel: true, clientes, corresponsaveis };
    });
  }, []);

  // So clientes ativos entram no "selecionar todos"; o resto da carteira
  // continua escolhivel um a um.
  const clientesAtivos = useMemo(
    () => clientesDaCarteira.filter(c => c.status === "active"),
    [clientesDaCarteira]
  );

  return {
    demandas, setDemandas, substituir, remover,
    clientesDaCarteira, clientesAtivos, clientePorId, pessoas, pessoaPorId,
    vinculos, definirVinculos,
    loading, recarregar: carregar,
  };
}
