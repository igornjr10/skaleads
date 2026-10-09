import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface SavedReport {
  id: string;
  periodo: string;
  updated_at: string;
  dados: Json;
}

export function useReportHistory(clientId: string) {
  const [historico, setHistorico] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setHistorico([]);
    setError(null);
    setLoading(Boolean(clientId));
    if (!clientId) return;

    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      if (!active) return;
      active = false;
      controller.abort();
      setLoading(false);
      setError("O histórico demorou para responder. Tente novamente.");
    }, 15_000);

    async function load() {
      try {
        const { data, error: queryError } = await supabase
          .from("relatorios_ia")
          .select("id, periodo, updated_at, dados")
          .eq("client_id", clientId)
          .order("updated_at", { ascending: false })
          .limit(20)
          .abortSignal(controller.signal);
        if (!active) return;
        if (queryError) throw queryError;
        setHistorico(data ?? []);
      } catch (cause) {
        if (!active) return;
        console.error("Falha ao carregar histórico de relatórios:", cause);
        setError("Não foi possível carregar os relatórios salvos. Tente novamente.");
      } finally {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [clientId, attempt]);

  return { historico, setHistorico, loading, error, retry: () => setAttempt((n) => n + 1) };
}
