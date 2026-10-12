import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, History, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatReportDate } from "@/lib/report-date";

export interface EnvioDoHistorico {
  id: string;
  schedule_id: string | null;
  name: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  share_token: string | null;
  period: { label?: string } | null;
  erro_envio?: string | null;
}

const BASE = "id, schedule_id, name, status, created_at, sent_at, share_token, period";

/** Envios dos agendamentos. `erro_envio` so existe depois da migration 20261012150000. */
export async function buscarEnvios(scheduleIds: string[], limite = 200): Promise<EnvioDoHistorico[]> {
  if (!scheduleIds.length) return [];
  const consulta = (colunas: string) =>
    supabase.from("reports").select(colunas).in("schedule_id", scheduleIds).order("created_at", { ascending: false }).limit(limite);
  let { data, error } = await consulta(`${BASE}, erro_envio`);
  if (error?.code === "42703") ({ data, error } = await consulta(BASE));
  if (error) throw error;
  return (data ?? []) as unknown as EnvioDoHistorico[];
}

interface Props {
  scheduleId: string | null;
  titulo: string;
  onOpenChange: (open: boolean) => void;
}

export function HistoricoAgendamento({ scheduleId, titulo, onOpenChange }: Props) {
  const [envios, setEnvios] = useState<EnvioDoHistorico[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!scheduleId) return;
    setCarregando(true);
    setErro(null);
    try {
      setEnvios(await buscarEnvios([scheduleId], 100));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar o histórico");
    } finally {
      setCarregando(false);
    }
  }, [scheduleId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <Dialog open={Boolean(scheduleId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Histórico de envios
          </DialogTitle>
          <DialogDescription className="break-words">{titulo}</DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : erro ? (
          <div className="rounded-xl border border-destructive/40 p-4 text-center text-sm">
            <p className="text-destructive">{erro}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={carregar}>
              Tentar de novo
            </Button>
          </div>
        ) : envios.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            Nenhum envio ainda. O primeiro sai no próximo horário agendado, ou use "Enviar agora" para testar.
          </div>
        ) : (
          <ul className="space-y-2">
            {envios.map((e) => {
              const ok = e.status === "ready" && e.sent_at;
              const pendente = e.status === "generating";
              return (
                <li key={e.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-border/60 bg-card/60 p-3">
                  {ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  ) : pendente ? (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={e.name}>
                      {e.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ok ? `Enviado em ${formatReportDate(e.sent_at)}` : `Tentativa em ${formatReportDate(e.created_at)}`}
                    </p>
                    {e.erro_envio && <p className="break-words text-xs text-destructive">{e.erro_envio}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={ok ? "default" : pendente ? "secondary" : "destructive"}>{ok ? "Enviado" : pendente ? "Enviando" : "Falhou"}</Badge>
                    {ok && e.share_token && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                        <a href={`/share/reports/${e.share_token}`} target="_blank" rel="noreferrer" aria-label="Abrir relatório enviado">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
