import { useCallback, useEffect, useMemo, useState } from "react";
import { subDays } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/utils";
import { buscarTudo } from "@/lib/buscar-tudo";
import type { Atividade, Etapa, Funil, Lead } from "@/lib/comercial";
import type { Pessoa } from "@/hooks/useDemandas";

/** Janela das metricas de produtividade; o historico de cada lead abre inteiro no detalhe. */
export const DIAS_DE_ATIVIDADE = 90;

export function useComercial() {
  const [funis, setFunis] = useState<Funil[]>([]);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [clientes, setClientes] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    try {
      // Primeira visita da empresa: cria o funil de prospeccao padrao.
      const garantido = await supabase.rpc("garantir_funil_prospeccao");
      if (garantido.error && !garantido.error.message.includes("sem empresa")) throw garantido.error;

      const desde = subDays(new Date(), DIAS_DE_ATIVIDADE).toISOString();
      const [f, e, l, a, papeis, perfis, cs] = await Promise.all([
        supabase.from("crm_funis").select("id, nome, client_id, created_at").order("created_at"),
        supabase.from("crm_etapas").select("id, funil_id, nome, posicao, tipo").order("posicao"),
        buscarTudo<Lead>((de, ate) => supabase.from("crm_leads").select("*").order("posicao").range(de, ate)),
        buscarTudo<Atividade>((de, ate) =>
          supabase.from("crm_atividades").select("id, lead_id, autor_id, tipo, canal, descricao, created_at")
            .gte("created_at", desde).order("created_at").range(de, ate)
        ),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("profiles").select("id, full_name, email"),
        supabase.from("clients").select("id, name").neq("status", "archived").order("name"),
      ]);
      if (f.error) throw f.error;
      if (e.error) throw e.error;

      const papelDe = new Map(((papeis.data ?? []) as { user_id: string; role: string }[]).map(r => [r.user_id, r.role]));
      setPessoas(((perfis.data ?? []) as { id: string; full_name: string | null; email: string | null }[])
        .map(p => ({ id: p.id, nome: p.full_name || p.email || p.id.slice(0, 8), role: papelDe.get(p.id) ?? "viewer" }))
        .sort((x, y) => x.nome.localeCompare(y.nome)));
      setFunis((f.data ?? []) as Funil[]);
      setEtapas((e.data ?? []) as Etapa[]);
      setLeads(l);
      setAtividades(a);
      setClientes((cs.data ?? []) as { id: string; name: string }[]);
    } catch (err) {
      toast.error(errorMessage(err, "Não foi possível carregar o comercial"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const pessoaPorId = useMemo(() => new Map(pessoas.map(p => [p.id, p])), [pessoas]);
  const etapaPorId = useMemo(() => new Map(etapas.map(e => [e.id, e])), [etapas]);

  const substituirLead = useCallback((lead: Lead) => {
    setLeads(atual => (atual.some(l => l.id === lead.id) ? atual.map(l => (l.id === lead.id ? lead : l)) : [...atual, lead]));
  }, []);
  const removerLead = useCallback((id: string) => setLeads(atual => atual.filter(l => l.id !== id)), []);
  const adicionarAtividade = useCallback((a: Atividade) => setAtividades(atual => [...atual, a]), []);

  return {
    funis, etapas, leads, atividades, pessoas, clientes, loading,
    pessoaPorId, etapaPorId,
    substituirLead, removerLead, adicionarAtividade, recarregar: carregar,
  };
}
