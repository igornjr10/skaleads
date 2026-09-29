import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/utils";
import { type Demanda, paraDemanda } from "@/lib/demandas";

export interface ClienteResumo {
  id: string;
  name: string;
  logo_url: string | null;
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
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    const [demandasRes, carteiraRes, nomesRes, papeisRes, perfisRes] = await Promise.all([
      supabase.from("tasks").select("*").order("prazo", { ascending: true, nullsFirst: false }),
      supabase.from("clients").select("id, name, logo_url").neq("status", "archived").order("name"),
      supabase.rpc("clientes_das_minhas_demandas"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    if (demandasRes.error) toast.error(errorMessage(demandasRes.error, "Não foi possível carregar as demandas"));

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

  return {
    demandas, setDemandas, substituir, remover,
    clientesDaCarteira, clientePorId, pessoas, pessoaPorId,
    loading, recarregar: carregar,
  };
}
