import { useEffect, useState } from "react";
import { FileText, Loader2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateNicheBriefing } from "@/lib/ai-service";
import { LOCAL_GOALS, segmentLabel } from "@/lib/local-business";
import { gerarPautaDoNicho, montarBriefingDoCliente } from "@/lib/niche-insights";
import { buildContentBriefPdfBlob, downloadBlob } from "@/lib/report-pdf";
import { errorMessage } from "@/lib/utils";

interface Props {
  clientId: string;
  clientName: string;
  segment: string | null;
  /** Objetivo cadastrado no cliente; vira o padrao do seletor. */
  primaryGoal?: string | null;
}

export function ClientBriefingCard({ clientId, clientName, segment, primaryGoal }: Props) {
  // O objetivo do cliente ja esta cadastrado: comecar por ele poupa um clique e
  // evita gerar briefing para um objetivo que nao e o dele.
  const [objetivo, setObjetivo] = useState<string>(primaryGoal || LOCAL_GOALS[0].value);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [gerandoPauta, setGerandoPauta] = useState(false);

  useEffect(() => {
    setBriefing(null);
  }, [objetivo, clientId]);

  async function gerar() {
    if (!segment) return;
    setGerando(true);
    try {
      const payload = await montarBriefingDoCliente(
        clientId,
        clientName,
        segment,
        LOCAL_GOALS.find((g) => g.value === objetivo)?.label ?? objetivo
      );

      if (!payload) {
        toast.error("Sem outras contas deste nicho com entrega no periodo — nao da para comparar.");
        return;
      }

      const resultado = await generateNicheBriefing(payload);
      setBriefing(resultado.briefing);
    } catch (error) {
      toast.error(errorMessage(error, "Erro ao gerar o briefing"));
    } finally {
      setGerando(false);
    }
  }

  // O calendario e do NICHO, nao desta conta: serve todos os clientes de
  // Varejo de uma vez, e por nao citar ninguem pode ir para o cliente.
  async function baixarCalendario() {
    if (!segment) return;
    setGerandoPauta(true);
    try {
      const resultado = await gerarPautaDoNicho(segment);
      if (!resultado) {
        toast.error("Sem dado suficiente neste nicho para montar um calendario.");
        return;
      }

      const blob = await buildContentBriefPdfBlob(resultado);
      downloadBlob(blob, `calendario-de-conteudo-${segment}.pdf`);
      toast.success("Calendario gerado");
    } catch (error) {
      toast.error(errorMessage(error, "Erro ao gerar o calendario de conteudo"));
    } finally {
      setGerandoPauta(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Briefing da conta
        </CardTitle>
        <CardDescription>
          {segment
            ? `Compara ${clientName} com as outras contas de ${segmentLabel(segment)} e diz o que mudar primeiro.`
            : "Cadastre o nicho deste cliente para comparar com os pares."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Sem nicho nao ha com quem comparar, e um briefing sem par viraria
            conselho generico — que e exatamente o que esta tela evita. */}
        {!segment ? (
          <p className="text-sm text-muted-foreground">
            O segmento do negocio fica no cadastro do cliente, em Clientes &rarr; Editar.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={objetivo} onValueChange={setObjetivo}>
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="Objetivo da campanha" />
                </SelectTrigger>
                <SelectContent>
                  {LOCAL_GOALS.map((goal) => (
                    <SelectItem key={goal.value} value={goal.value}>{goal.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={gerar} disabled={gerando}>
                {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {gerando ? "Comparando com o nicho..." : "Gerar briefing"}
              </Button>
              <Button variant="outline" onClick={baixarCalendario} disabled={gerandoPauta}>
                {gerandoPauta ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                {gerandoPauta ? "Montando o PDF..." : `Calendario de ${segmentLabel(segment)} (PDF)`}
              </Button>
            </div>

            {briefing ? (
              <div className="prose prose-sm max-w-none rounded-xl border border-border/60 bg-card/40 p-4 prose-headings:mb-2 prose-headings:mt-4 prose-table:text-xs prose-td:align-top dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                O briefing e desta conta. O calendario e do nicho inteiro — serve qualquer cliente de{" "}
                {segmentLabel(segment)} e nao cita ninguem, entao pode ir para o cliente.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
