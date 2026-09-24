import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { diagnoseMetaConnection, type MetaDiagnosis, type StepStatus } from "@/lib/meta-diagnostics";
import { errorMessage } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  client: { id: string; name: string; meta_ad_account_id: string | null; meta_access_token: string | null };
}

const STATUS_ICON: Record<StepStatus, typeof CheckCircle2> = {
  ok: CheckCircle2,
  fail: XCircle,
  warn: AlertTriangle,
};

const STATUS_CLASS: Record<StepStatus, string> = {
  ok: "text-emerald-500",
  fail: "text-rose-500",
  warn: "text-amber-500",
};

export function MetaDiagnosticsDialog({ open, onClose, client }: Props) {
  const [loading, setLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState<MetaDiagnosis | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!client.meta_ad_account_id || !client.meta_access_token) {
      setFailure("Este cliente ainda nao tem conta Meta configurada.");
      return;
    }
    setLoading(true);
    setFailure(null);
    try {
      setDiagnosis(await diagnoseMetaConnection(client.meta_ad_account_id, client.meta_access_token));
    } catch (error) {
      setFailure(errorMessage(error, "Nao foi possivel rodar o diagnostico"));
    } finally {
      setLoading(false);
    }
  }, [client.meta_ad_account_id, client.meta_access_token]);

  useEffect(() => {
    if (open) {
      setDiagnosis(null);
      setFailure(null);
      run();
    }
  }, [open, run]);

  const saudavel = diagnosis?.culprit === "nenhum";

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Diagnostico da conexao Meta</DialogTitle>
          <DialogDescription>
            {client.name}
            {client.meta_ad_account_id ? ` · act_${client.meta_ad_account_id.replace("act_", "")}` : ""}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Consultando a Meta...
          </div>
        )}

        {!loading && failure && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-600">{failure}</div>
        )}

        {!loading && diagnosis && (
          <div className="space-y-4">
            <div
              className={`rounded-xl border p-4 text-sm ${
                saudavel
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400"
              }`}
            >
              {diagnosis.verdict}
            </div>

            <div className="space-y-3">
              {diagnosis.steps.map((step) => {
                const Icon = STATUS_ICON[step.status];
                return (
                  <div key={step.id} className="flex gap-3 rounded-xl border border-border/60 bg-card/40 p-3">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${STATUS_CLASS[step.status]}`} />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{step.label}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                      {step.fix && (
                        <p className="text-xs leading-relaxed text-foreground/80">
                          <span className="font-medium">Como resolver: </span>
                          {step.fix}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={run} disabled={loading}>
            <RefreshCw className={`mr-2 h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Rodar de novo
          </Button>
          <Button size="sm" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
