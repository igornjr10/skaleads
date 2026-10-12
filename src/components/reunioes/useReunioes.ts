import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buscarTudo } from "@/lib/buscar-tudo";
import { errorMessage } from "@/lib/utils";
import { type Reuniao, erroDeTabelaAusente, paraReuniao } from "@/lib/reunioes";

export interface ClienteDaReuniao {
  id: string;
  name: string;
  logo_url: string | null;
  status?: string;
}

export interface PessoaDaReuniao {
  id: string;
  nome: string;
}

/**
 * Reunioes que a pessoa enxerga (a RLS decide), quem participa de cada uma,
 * a equipe e os clientes da carteira. Recarrega sozinha com o realtime.
 */
export function useReunioes() {
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [participantes, setParticipantes] = useState<Map<string, string[]>>(new Map());
  const [clientes, setClientes] = useState<ClienteDaReuniao[]>([]);
  const [pessoas, setPessoas] = useState<PessoaDaReuniao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [semTabela, setSemTabela] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [reunioesRes, partRes, clientesRes, perfisRes] = await Promise.all([
        buscarTudo<Record<string, unknown>>((de, ate) =>
          supabase.from("reunioes").select("*").order("inicio", { ascending: false }).order("id").range(de, ate)
        ).then(data => ({ data, error: null as unknown }), (error: unknown) => ({ data: [] as Record<string, unknown>[], error })),
        buscarTudo<{ reuniao_id: string; user_id: string }>((de, ate) =>
          supabase.from("reuniao_participantes").select("reuniao_id, user_id").order("reuniao_id").range(de, ate)
        ).then(data => ({ data, error: null as unknown }), (error: unknown) => ({ data: [] as { reuniao_id: string; user_id: string }[], error })),
        supabase.from("clients").select("id, name, logo_url, status").neq("status", "archived").order("name"),
        supabase.from("profiles").select("id, full_name, email"),
      ]);

      if (reunioesRes.error) {
        if (erroDeTabelaAusente(reunioesRes.error)) {
          setSemTabela(true);
          setErro(null);
          return;
        }
        throw reunioesRes.error;
      }
      setSemTabela(false);

      const mapa = new Map<string, string[]>();
      for (const p of partRes.data) mapa.set(p.reuniao_id, [...(mapa.get(p.reuniao_id) ?? []), p.user_id]);

      const equipe = ((perfisRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[])
        .map(p => ({ id: p.id, nome: p.full_name || p.email || p.id.slice(0, 8) }))
        .sort((a, b) => a.nome.localeCompare(b.nome));

      setReunioes(reunioesRes.data.map(paraReuniao));
      setParticipantes(mapa);
      setClientes((clientesRes.data as ClienteDaReuniao[]) ?? []);
      setPessoas(equipe);
      setErro(null);
    } catch (e) {
      setErro(errorMessage(e, "Não foi possível carregar as reuniões"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (semTabela) return;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const recarregar = () => {
      clearTimeout(espera);
      espera = setTimeout(() => { carregar(); }, 800);
    };
    const canal = supabase
      .channel(`reunioes-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reunioes" }, recarregar)
      .subscribe();
    return () => {
      clearTimeout(espera);
      supabase.removeChannel(canal);
    };
  }, [carregar, semTabela]);

  const clientePorId = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes]);
  const pessoaPorId = useMemo(() => new Map(pessoas.map(p => [p.id, p])), [pessoas]);

  const substituir = useCallback((r: Reuniao) => {
    setReunioes(atual => (atual.some(x => x.id === r.id) ? atual.map(x => (x.id === r.id ? r : x)) : [r, ...atual]));
  }, []);

  const remover = useCallback((id: string) => setReunioes(atual => atual.filter(r => r.id !== id)), []);

  const definirParticipantes = useCallback((id: string, ids: string[]) => {
    setParticipantes(atual => new Map(atual).set(id, ids));
  }, []);

  return {
    reunioes, participantes, clientes, clientePorId, pessoas, pessoaPorId,
    loading, erro, semTabela,
    recarregar: carregar, substituir, remover, definirParticipantes,
  };
}
