import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Zap, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { analyzeCreatives } from "@/lib/ai-service";
import ReactMarkdown from "react-markdown";

interface Creative {
  id: string;
  copy: string;
  visual_description: string;
  roas?: number;
  spend?: number;
  conversions?: number;
  [key: string]: unknown;
}

interface CreativeAnalysisDialogProps {
  isOpen: boolean;
  onClose: () => void;
  topCreatives: Creative[];
  clientName: string;
}

export function CreativeAnalysisDialog({
  isOpen,
  onClose,
  topCreatives,
  clientName,
}: CreativeAnalysisDialogProps) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ tokens: { input: number; output: number }; cost: number; cached: boolean } | null>(null);

  async function handleAnalyze() {
    if (topCreatives.length === 0) {
      toast.error("Selecione pelo menos 1 criativo para analisar");
      return;
    }

    setLoading(true);
    try {
      const creatives = topCreatives.slice(0, 5).map(c => ({
        copy: c.copy || "",
        visual_description: c.visual_description || "",
        metrics: {
          roas: c.roas || 0,
          spend: c.spend || 0,
          conversions: c.conversions || 0,
        },
      }));

      const result = await analyzeCreatives(creatives);
      setAnalysis(result.analysis);
      setUsage({
        tokens: result.tokens,
        cost: result.cost,
        cached: result.cached,
      });
      toast.success(`Análise concluída ${result.cached ? "(em cache)" : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao analisar criativos");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard() {
    if (analysis) {
      navigator.clipboard.writeText(analysis);
      toast.success("Análise copiada para clipboard");
    }
  }

  function downloadAsText() {
    if (!analysis) return;
    const element = document.createElement("a");
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(analysis));
    element.setAttribute("download", `analise-criativos-${clientName}-${new Date().toISOString().split("T")[0]}.txt`);
    element.click();
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Análise IA de Criativos — {clientName}
          </DialogTitle>
          <DialogDescription>
            {topCreatives.length > 0
              ? `Analisando os ${Math.min(topCreatives.length, 5)} criativos com maior ROAS`
              : "Nenhum criativo selecionado"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Top creatives preview */}
          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Criativos a analisar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {topCreatives.slice(0, 5).map((c, i) => (
                  <div key={c.id || i} className="text-xs p-2 bg-muted rounded">
                    <p className="font-medium truncate">{c.copy}</p>
                    {c.roas && <p className="text-muted-foreground">ROAS: {c.roas.toFixed(2)}</p>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Analysis result */}
          {analysis ? (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Insights Gerados</CardTitle>
                  {usage?.cached && <Badge variant="secondary" className="text-[10px]">📦 Em cache</Badge>}
                </div>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none dark:prose-invert text-sm">
                  <ReactMarkdown>{analysis}</ReactMarkdown>
                </div>

                {/* Token usage */}
                {usage && (
                  <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Tokens: {usage.tokens.input} in / {usage.tokens.output} out</span>
                      <span>Custo: ${usage.cost.toFixed(6)}</span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-4">
                  <Button size="sm" variant="outline" onClick={copyToClipboard} className="flex-1">
                    <Copy className="h-3 w-3 mr-1" />
                    Copiar
                  </Button>
                  <Button size="sm" variant="outline" onClick={downloadAsText} className="flex-1">
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-muted/30">
              <CardContent className="py-8 text-center">
                {loading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <p className="text-xs text-muted-foreground">Analisando criativos com IA...</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Clique em "Analisar" para gerar insights</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Analyze button */}
          <Button
            onClick={handleAnalyze}
            disabled={loading || topCreatives.length === 0}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Analisar Criativos
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
