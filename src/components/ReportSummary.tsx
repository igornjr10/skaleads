import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Copy, Edit2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { summarizePeriod } from "@/lib/ai-service";

interface PeriodMetrics {
  period: { start: string; end: string };
  metrics: Record<string, number>;
}

interface ReportSummaryProps {
  metrics: PeriodMetrics;
  clientName: string;
  onEditableSummary?: (summary: string) => void;
}

export function ReportSummary({ metrics, clientName, onEditableSummary }: ReportSummaryProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [usage, setUsage] = useState<{ tokens: { input: number; output: number }; cost: number; cached: boolean } | null>(null);

  async function handleGenerateSummary() {
    setLoading(true);
    try {
      const result = await summarizePeriod(metrics);
      setSummary(result.summary);
      setEditedText(result.summary);
      setUsage({
        tokens: result.tokens,
        cost: result.cost,
        cached: result.cached,
      });
      toast.success(`Resumo gerado ${result.cached ? "(em cache)" : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar resumo");
    } finally {
      setLoading(false);
    }
  }

  function handleSaveEdit() {
    setSummary(editedText);
    onEditableSummary?.(editedText);
    setIsEditing(false);
    toast.success("Resumo atualizado");
  }

  function copyToClipboard() {
    if (summary) {
      navigator.clipboard.writeText(summary);
      toast.success("Resumo copiado para clipboard");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              Resumo Executivo — {clientName}
            </CardTitle>
            <CardDescription className="mt-1">
              Período: {metrics.period.start} a {metrics.period.end}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!summary ? (
          <div className="bg-muted/30 rounded-lg p-6 text-center">
            {loading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Gerando resumo executivo...</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Clique em "Gerar Resumo" para criar um resumo executivo com IA
              </p>
            )}
          </div>
        ) : isEditing ? (
          <div className="space-y-3">
            <Textarea
              value={editedText}
              onChange={e => setEditedText(e.target.value)}
              className="min-h-[100px] text-sm"
              placeholder="Edite o resumo aqui..."
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveEdit} className="flex-1">
                <Save className="h-3 w-3 mr-1" />
                Salvar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  setEditedText(summary);
                }}
                className="flex-1"
              >
                <X className="h-3 w-3 mr-1" />
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-muted/30 rounded-lg p-4">
              <p className="text-sm leading-relaxed text-foreground">{summary}</p>
            </div>

            {usage && (
              <div className="text-xs text-muted-foreground border-t pt-3">
                <div className="flex justify-between items-center">
                  <span>
                    Tokens: {usage.tokens.input} in / {usage.tokens.output} out • Custo: ${usage.cost.toFixed(6)}
                    {usage.cached && " • 📦 Cache"}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(true)}
                className="flex-1"
              >
                <Edit2 className="h-3 w-3 mr-1" />
                Editar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={copyToClipboard}
                className="flex-1"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copiar
              </Button>
            </div>
          </div>
        )}

        <Button
          onClick={handleGenerateSummary}
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Gerando...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {summary ? "Regenerar Resumo" : "Gerar Resumo"}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
