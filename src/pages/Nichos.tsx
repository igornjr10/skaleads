import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Compass, FileText, ImageIcon, Loader2, Sparkles, TrendingUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import {
  MIN_CLIENTES_CONFIAVEL,
  breakdownPorFormato,
  fetchClientsBySegment,
  gerarPautaDoNicho,
  montarBriefingDoCliente,
  fetchSegmentBenchmarks,
  fetchTopCreatives,
  type ClientOption,
  type CreativeHighlight,
  type SegmentBenchmark,
} from "@/lib/niche-insights";
import { generateNicheBriefing } from "@/lib/ai-service";
import { LOCAL_GOALS } from "@/lib/local-business";
import { buildContentBriefPdfBlob, downloadBlob } from "@/lib/report-pdf";
import { errorMessage } from "@/lib/utils";

const PERIODOS = [
  { value: "30", label: "Ultimos 30 dias" },
  { value: "90", label: "Ultimos 90 dias" },
  { value: "180", label: "Ultimos 180 dias" },
];

const TIPO_LABEL: Record<string, string> = {
  video: "Video",
  image: "Imagem",
  carousel: "Carrossel",
  desconhecido: "Nao identificado",
};

export default function Nichos() {
  const [dias, setDias] = useState("90");
  const [loading, setLoading] = useState(true);
  const [benchmarks, setBenchmarks] = useState<SegmentBenchmark[]>([]);
  const [segmentoAberto, setSegmentoAberto] = useState<string | null>(null);
  const [criativos, setCriativos] = useState<CreativeHighlight[]>([]);
  const [loadingCriativos, setLoadingCriativos] = useState(false);
  const [objetivo, setObjetivo] = useState<string>(LOCAL_GOALS[0].value);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [gerandoPauta, setGerandoPauta] = useState(false);
  const TODO_O_NICHO = "__nicho__";
  const [clientes, setClientes] = useState<ClientOption[]>([]);
  const [clienteId, setClienteId] = useState<string>(TODO_O_NICHO);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const linhas = await fetchSegmentBenchmarks(Number(dias));
      setBenchmarks(linhas);
      setSegmentoAberto((atual) => atual ?? linhas[0]?.segment ?? null);
    } catch (error) {
      toast.error(errorMessage(error, "Erro ao carregar o comparativo por nicho"));
    } finally {
      setLoading(false);
    }
  }, [dias]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!segmentoAberto) return;
    let cancelado = false;

    (async () => {
      setLoadingCriativos(true);
      try {
        const lista = await fetchTopCreatives(segmentoAberto);
        if (!cancelado) setCriativos(lista);
      } catch (error) {
        if (!cancelado) toast.error(errorMessage(error, "Erro ao carregar os criativos do nicho"));
      } finally {
        if (!cancelado) setLoadingCriativos(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [segmentoAberto]);

  // So os clientes do nicho aberto: comparar pizzaria com a media do automotivo
  // nao responde nada.
  useEffect(() => {
    if (!segmentoAberto) return;
    let cancelado = false;

    fetchClientsBySegment(segmentoAberto)
      .then((lista) => {
        if (cancelado) return;
        setClientes(lista);
        setClienteId(TODO_O_NICHO);
      })
      .catch(() => {
        if (!cancelado) setClientes([]);
      });

    return () => {
      cancelado = true;
    };
  }, [segmentoAberto]);

  const formatos = useMemo(() => breakdownPorFormato(criativos), [criativos]);
  const nichoAtual = benchmarks.find((linha) => linha.segment === segmentoAberto);
  const totalInvestido = benchmarks.reduce((soma, linha) => soma + linha.spend, 0);

  // O briefing descreve um nicho e um objetivo especificos: trocar qualquer um
  // dos dois invalida o texto que esta na tela, e deixar o antigo ali enganaria.
  useEffect(() => {
    setBriefing(null);
  }, [segmentoAberto, objetivo, dias, clienteId]);

  async function gerarBriefing() {
    if (!nichoAtual) return;
    setGerando(true);
    try {
      const objetivoLabel = LOCAL_GOALS.find((g) => g.value === objetivo)?.label ?? objetivo;
      const escolhido = clientes.find((c) => c.id === clienteId);

      const payload = escolhido
        ? await montarBriefingDoCliente(escolhido.id, escolhido.name, nichoAtual.segment, objetivoLabel, Number(dias))
        : {
            segmentLabel: nichoAtual.label,
            goalLabel: objetivoLabel,
            benchmark: {
              clientes: nichoAtual.clientes,
              spend: nichoAtual.spend,
              ctr: nichoAtual.ctr,
              cpm: nichoAtual.cpm,
              cpc: nichoAtual.cpc,
              custoPorResultado: nichoAtual.custoPorResultado,
              confiavel: nichoAtual.confiavel,
            },
            creatives: criativos.slice(0, 10).map((ad) => ({
              title: ad.title || ad.body || ad.name,
              ctr: ad.ctr,
              impressions: ad.impressions,
              creativeType: ad.creativeType ?? "desconhecido",
            })),
            formatos: formatos.map((f) => ({ creativeType: f.creativeType, ctr: f.ctr, anuncios: f.anuncios })),
          };

      if (!payload) {
        toast.error("Sem pares com entrega neste nicho no periodo — nao da para comparar.");
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

  async function baixarPauta() {
    if (!nichoAtual) return;
    setGerandoPauta(true);
    try {
      const resultado = await gerarPautaDoNicho(nichoAtual.segment, Number(dias));
      if (!resultado) {
        toast.error("Sem dado suficiente neste nicho para montar um calendario.");
        return;
      }

      const blob = await buildContentBriefPdfBlob(resultado);
      downloadBlob(blob, `calendario-de-conteudo-${nichoAtual.segment}.pdf`);
      toast.success("Calendario gerado");
    } catch (error) {
      toast.error(errorMessage(error, "Erro ao gerar o calendario de conteudo"));
    } finally {
      setGerandoPauta(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Compass className="h-6 w-6 text-primary" />
            Nichos
          </h1>
          <p className="text-sm text-muted-foreground">
            O que a carteira mostra que funciona em cada segmento, antes de subir campanha.
          </p>
        </div>
        <Select value={dias} onValueChange={setDias}>
          <SelectTrigger className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODOS.map((periodo) => (
              <SelectItem key={periodo.value} value={periodo.value}>{periodo.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Comparativo por segmento</CardTitle>
          <CardDescription>
            {loading
              ? "Somando o historico da carteira..."
              : `${formatCurrency(totalInvestido)} investidos no periodo, em ${benchmarks.length} segmento(s).`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-52 w-full rounded-xl" />
          ) : benchmarks.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum gasto registrado no periodo. Sincronize os clientes e volte aqui.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Segmento</TableHead>
                  <TableHead className="text-right">Contas</TableHead>
                  <TableHead className="text-right">Investido</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">CPM</TableHead>
                  <TableHead className="text-right">CPC</TableHead>
                  <TableHead className="text-right">Resultados</TableHead>
                  <TableHead className="text-right">Custo/resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {benchmarks.map((linha) => (
                  <TableRow
                    key={linha.segment}
                    className={`cursor-pointer ${linha.segment === segmentoAberto ? "bg-primary/5" : ""}`}
                    onClick={() => setSegmentoAberto(linha.segment)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {linha.label}
                        {!linha.confiavel && (
                          <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700">
                            <AlertTriangle className="h-3 w-3" />
                            amostra pequena
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{linha.clientes}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(linha.spend)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPercent(linha.ctr)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(linha.cpm)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(linha.cpc)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(linha.resultados)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {linha.custoPorResultado !== null ? formatCurrency(linha.custoPorResultado) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <p className="mt-3 text-[11px] text-muted-foreground">
            Resultado = conversas, ligacoes, rotas e leads somados. Segmento com menos de{" "}
            {MIN_CLIENTES_CONFIAVEL} contas vem marcado: a media ali diz mais sobre o acaso do que sobre o nicho.
          </p>
        </CardContent>
      </Card>

      {nichoAtual && (
        <>
          {!nichoAtual.confiavel && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <strong>{nichoAtual.label}</strong> tem {nichoAtual.clientes} conta(s) no periodo. Use o que vem abaixo
                como exemplo do que ja foi feito, nao como referencia de mercado.
              </p>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4" />
                  Formato que entrega
                </CardTitle>
                <CardDescription>{nichoAtual.label}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {loadingCriativos ? (
                  <Skeleton className="h-24 w-full rounded-xl" />
                ) : formatos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem criativo com entrega suficiente neste nicho.</p>
                ) : (
                  formatos.map((formato) => (
                    <div key={formato.creativeType} className="rounded-xl border border-border/60 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {TIPO_LABEL[formato.creativeType] ?? formato.creativeType}
                        </span>
                        <span className="text-sm font-semibold tabular-nums">{formatPercent(formato.ctr)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {formato.anuncios} anuncio(s) · {formatNumber(formato.impressions)} impressoes
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ImageIcon className="h-4 w-4" />
                  Criativos que mais renderam
                </CardTitle>
                <CardDescription>
                  Ordenados por CTR, so anuncios com entrega real. Use como referencia de angulo e promessa.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingCriativos ? (
                  <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Buscando criativos...
                  </div>
                ) : criativos.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum criativo deste nicho passou do minimo de entrega.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {criativos.slice(0, 8).map((ad) => (
                      <div key={ad.id} className="flex gap-3 rounded-xl border border-border/60 p-2.5">
                        {ad.thumbnailUrl ? (
                          <img
                            src={ad.thumbnailUrl}
                            alt=""
                            loading="lazy"
                            className="h-16 w-16 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <ImageIcon className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs text-muted-foreground">{ad.clientName}</span>
                            <span className="shrink-0 text-sm font-semibold text-primary">{formatPercent(ad.ctr)}</span>
                          </div>
                          <p className="line-clamp-2 text-xs text-foreground">
                            {ad.title || ad.body || ad.name}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {formatNumber(ad.impressions)} impressoes · {formatCurrency(ad.spend)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Briefing antes de subir
              </CardTitle>
              <CardDescription>
                {clienteId === TODO_O_NICHO
                  ? `A IA le o historico de ${nichoAtual.label} e diz por onde comecar. So usa os numeros desta tela.`
                  : `A IA compara este cliente com os pares de ${nichoAtual.label} e diz o que mudar primeiro.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={clienteId} onValueChange={setClienteId}>
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Alvo do briefing" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODO_O_NICHO}>Nicho inteiro</SelectItem>
                    {clientes.map((cliente) => (
                      <SelectItem key={cliente.id} value={cliente.id}>{cliente.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Button onClick={gerarBriefing} disabled={gerando || loadingCriativos}>
                  {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {gerando ? "Lendo o historico..." : "Gerar briefing"}
                </Button>
                <Button variant="outline" onClick={baixarPauta} disabled={gerandoPauta || loadingCriativos}>
                  {gerandoPauta ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                  {gerandoPauta ? "Montando o PDF..." : "Calendario de conteudo (PDF)"}
                </Button>
              </div>

              {briefing ? (
                // `remarkGfm` e o que faz tabela de markdown virar tabela: sem
                // ele o pipe aparece cru na tela. HTML do modelo continua
                // desligado de proposito — texto vindo de IA nao entra no DOM.
                <div className="prose prose-sm max-w-none rounded-xl border border-border/60 bg-card/40 p-4 prose-headings:mb-2 prose-headings:mt-4 prose-table:text-xs prose-td:align-top dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {clienteId === TODO_O_NICHO
                    ? "Escolha o objetivo e gere: a resposta sai dos numeros e dos criativos deste nicho, nao de conselho generico."
                    : "Escolha o objetivo e gere: a resposta compara as metricas e os criativos deste cliente com os do nicho."}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Button variant="outline" onClick={carregar} disabled={loading}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Recarregar
      </Button>
    </div>
  );
}
