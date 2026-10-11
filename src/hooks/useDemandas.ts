import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type Demanda, paraDemanda } from "@/lib/demandas";
import { buscarTudo } from "@/lib/buscar-tudo";
import { useAuth } from "@/hooks/useAuth";

export interface ClienteResumo {
  id: string;
  name: string;
  logo_url: string | null;
  status?: string;
  created_at?: string;
}
export interface Pessoa {
  id: string;
  nome: string;
  role: string;
}
interface Dados {
  demandas: Demanda[];
  clientesDaCarteira: ClienteResumo[];
  clientesDasDemandas: ClienteResumo[];
  pessoas: Pessoa[];
  onboarding: { client_id: string; done: boolean }[];
}

export function useDemandas() {
  const { user, empresa } = useAuth();
  const cache = useQueryClient();
  const key = useMemo(
    () => ["demandas-operacao", user?.id, empresa?.id],
    [user?.id, empresa?.id],
  );
  const query = useQuery({
    queryKey: key,
    enabled: !!user?.id,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Dados> => {
      const [demandas, carteira, nomes, papeis, perfis, onboarding] =
        await Promise.all([
          buscarTudo((de, ate) =>
            supabase.from("tasks").select("*").order("id").range(de, ate),
          ),
          buscarTudo<ClienteResumo>((de, ate) =>
            supabase
              .from("clients")
              .select("id, name, logo_url, status, created_at")
              .neq("status", "archived")
              .order("id")
              .range(de, ate),
          ),
          supabase.rpc("clientes_das_minhas_demandas"),
          buscarTudo((de, ate) =>
            supabase
              .from("user_roles")
              .select("user_id, role")
              .order("user_id")
              .order("role")
              .range(de, ate),
          ),
          buscarTudo((de, ate) =>
            supabase
              .from("profiles")
              .select("id, full_name, email")
              .order("id")
              .range(de, ate),
          ),
          buscarTudo((de, ate) =>
            supabase
              .from("client_tasks")
              .select("client_id, done")
              .order("id")
              .range(de, ate),
          ),
        ]);
      if (nomes.error) throw nomes.error;
      const porPapel = new Map(papeis.map((r) => [r.user_id, r.role]));
      return {
        onboarding,
        demandas: [
          ...new Map(demandas.map((r) => [r.id, paraDemanda(r)])).values(),
        ],
        clientesDaCarteira: carteira,
        clientesDasDemandas: (nomes.data ?? []) as ClienteResumo[],
        pessoas: perfis
          .map((p) => ({
            id: p.id,
            nome: p.full_name || p.email || p.id.slice(0, 8),
            role: porPapel.get(p.id) ?? "viewer",
          }))
          .sort((a, b) => a.nome.localeCompare(b.nome)),
      };
    },
  });
  const recarregar = useCallback(
    () => cache.invalidateQueries({ queryKey: key }),
    [cache, key],
  );
  useEffect(() => {
    if (!user?.id) return;
    const canal = supabase.channel(`demandas:${user.id}:${empresa?.id ?? ""}`);
    for (const table of ["tasks", "clients", "profiles", "user_roles"])
      canal.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        recarregar,
      );
    canal.subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [user?.id, empresa?.id, recarregar]);
  const demandas = query.data?.demandas ?? [];
  const clientesDaCarteira = query.data?.clientesDaCarteira ?? [];
  const pessoas = query.data?.pessoas ?? [];
  const clientePorId = useMemo(
    () =>
      new Map(
        [
          ...(query.data?.clientesDasDemandas ?? []),
          ...(query.data?.clientesDaCarteira ?? []),
        ].map((c) => [c.id, c]),
      ),
    [query.data],
  );
  const pessoaPorId = useMemo(
    () => new Map((query.data?.pessoas ?? []).map((p) => [p.id, p])),
    [query.data],
  );
  const setDemandas = useCallback(
    (valor: Demanda[] | ((atual: Demanda[]) => Demanda[])) => {
      cache.setQueryData<Dados>(key, (atual) =>
        atual
          ? {
              ...atual,
              demandas:
                typeof valor === "function" ? valor(atual.demandas) : valor,
            }
          : atual,
      );
    },
    [cache, key],
  );
  const substituir = useCallback(
    (d: Demanda) =>
      setDemandas((atual) =>
        atual.some((x) => x.id === d.id)
          ? atual.map((x) => (x.id === d.id ? d : x))
          : [...atual, d],
      ),
    [setDemandas],
  );
  const remover = useCallback(
    (id: string) => setDemandas((atual) => atual.filter((d) => d.id !== id)),
    [setDemandas],
  );
  return {
    demandas,
    setDemandas,
    substituir,
    remover,
    clientesDaCarteira,
    clientePorId,
    pessoas,
    pessoaPorId,
    onboarding: query.data?.onboarding ?? [],
    loading: query.isLoading,
    error: query.error,
    recarregar,
  };
}
