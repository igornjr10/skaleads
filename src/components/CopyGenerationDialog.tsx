import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Wand2, Copy, Plus, History } from "lucide-react";
import { toast } from "sonner";
import { generateCopy } from "@/lib/ai-service";
import ReactMarkdown from "react-markdown";

interface CopyGenerationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clientName: string;
  clientId: string;
  industry?: string;
}

interface GenerationRecord {
  id: string;
  timestamp: string;
  objective: string;
  tone: string;
  result: string;
}

export function CopyGenerationDialog({
  isOpen,
  onClose,
  clientName,
  clientId,
  industry,
}: CopyGenerationDialogProps) {
  const [loading, setLoading] = useState(false);
  const [objective, setObjective] = useState("Aumentar conversões");
  const [tone, setTone] = useState<"professional" | "casual" | "urgent" | "inspirational">("professional");
  const [briefing, setBriefing] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ tokens: { input: number; output: number }; cost: number; cached: boolean } | null>(null);
  const [history, setHistory] = useState<GenerationRecord[]>(() => {
    const saved = localStorage.getItem(`copy_history_${clientId}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [showHistory, setShowHistory] = useState(false);

  async function handleGenerate() {
    if (!objective.trim() || !briefing.trim()) {
      toast.error("Preencha objetivo e briefing");
      return;
    }

    setLoading(true);
    try {
      const copyResult = await generateCopy({
        clientInfo: { name: clientName, industry },
        objective,
        tone,
        briefing,
      });

      setResult(copyResult.copy);
      setUsage({
        tokens: copyResult.tokens,
        cost: copyResult.cost,
        cached: copyResult.cached,
      });

      // Save to history
      const newRecord: GenerationRecord = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleString("pt-BR"),
        objective,
        tone,
        result: copyResult.copy,
      };
      const newHistory = [newRecord, ...history].slice(0, 10);
      setHistory(newHistory);
      localStorage.setItem(`copy_history_${clientId}`, JSON.stringify(newHistory));

      toast.success(`Copy gerado ${copyResult.cached ? "(em cache)" : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar copy");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copiado para clipboard");
  }

  function loadFromHistory(record: GenerationRecord) {
    setResult(record.result);
    setObjective(record.objective);
    setTone(record.tone as any);
    setShowHistory(false);
  }

  const toneLabels = {
    professional: "Profissional e confiante",
    casual: "Descontraído e amigável",
    urgent: "Senso de urgência (FOMO)",
    inspirational: "Inspirador e aspiracional",
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-blue-500" />
            Copy Lab — {clientName}
          </DialogTitle>
          <DialogDescription>Gere variações de headlines, primary text e descriptions com IA</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="generator" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generator">Gerador</TabsTrigger>
            <TabsTrigger value="history" onClick={() => setShowHistory(!showHistory)}>
              <History className="h-3 w-3 mr-1" />
              Histórico ({history.length})
            </TabsTrigger>
          </TabsList>

          {/* Generator tab */}
          <TabsContent value="generator" className="space-y-4 mt-4">
            {/* Input form */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Configuração</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="objective" className="text-xs">
                    Objetivo da campanha
                  </Label>
                  <Input
                    id="objective"
                    value={objective}
                    onChange={e => setObjective(e.target.value)}
                    placeholder="Ex: Aumentar conversões de compra"
                    className="text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tone" className="text-xs">
                    Tom do anúncio
                  </Label>
                  <Select value={tone} onValueChange={(v: any) => setTone(v)}>
                    <SelectTrigger id="tone" className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(toneLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="briefing" className="text-xs">
                    Briefing (produto, público, diferencial)
                  </Label>
                  <Textarea
                    id="briefing"
                    value={briefing}
                    onChange={e => setBriefing(e.target.value)}
                    placeholder="Ex: Curso online de programação Python. Público: iniciantes em tech. Diferencial: aprendizado prático com projetos reais."
                    className="text-sm min-h-[80px]"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Result */}
            {result ? (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Copy Gerado</CardTitle>
                    {usage?.cached && <Badge variant="secondary" className="text-[10px]">📦 Cache</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="prose prose-sm max-w-none dark:prose-invert text-sm">
                    <ReactMarkdown>{result}</ReactMarkdown>
                  </div>

                  {usage && (
                    <div className="text-xs text-muted-foreground border-t pt-3">
                      <div className="flex justify-between">
                        <span>Tokens: {usage.tokens.input} in / {usage.tokens.output} out</span>
                        <span>Custo: ${usage.cost.toFixed(6)}</span>
                      </div>
                    </div>
                  )}

                  <Button
                    size="sm"
                    onClick={() => copyToClipboard(result)}
                    className="w-full"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copiar tudo
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-muted/30">
                <CardContent className="py-8 text-center">
                  {loading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <p className="text-xs text-muted-foreground">Gerando copy...</p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Configure e clique em "Gerar Copy"</p>
                  )}
                </CardContent>
              </Card>
            )}

            <Button
              onClick={handleGenerate}
              disabled={loading || !objective.trim() || !briefing.trim()}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Gerar Copy
                </>
              )}
            </Button>
          </TabsContent>

          {/* History tab */}
          <TabsContent value="history" className="space-y-2 mt-4">
            {history.length === 0 ? (
              <Card className="bg-muted/30">
                <CardContent className="py-8 text-center text-xs text-muted-foreground">
                  Nenhum copy gerado ainda
                </CardContent>
              </Card>
            ) : (
              history.map(record => (
                <Card key={record.id} className="cursor-pointer hover:bg-muted/50 transition" onClick={() => loadFromHistory(record)}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{record.objective}</p>
                        <p className="text-xs text-muted-foreground">{record.timestamp}</p>
                        <Badge variant="secondary" className="text-[10px] mt-1">{record.tone}</Badge>
                      </div>
                      <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
