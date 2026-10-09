import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  Download,
  ExternalLink,
  FilePlus2,
  FileText,
  ImagePlus,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { toast } from "sonner";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useReportHistory, type SavedReport } from "@/hooks/useReportHistory";
import { formatReportDate } from "@/lib/report-date";
import { comprimirImagem } from "@/lib/report-analise";
import { blobToBase64, downloadBlob } from "@/lib/report-pdf";
import { relatorioEmPdf } from "@/lib/relatorio-pdf";
import {
  blocosDaIA,
  criarBloco,
  fmtReais,
  METRICAS_VAZIAS,
  metricasDaIA,
  MODELOS_DE_BLOCO,
  montarRelatorioHtml,
  nomeDoArquivo,
  normalizarRelatorio,
  type Bloco,
  type MetricasRelatorio,
  type RelatorioDados,
} from "@/lib/relatorio-html";
import { BlocoEditor, CampoNumero, ZonaDeImagens } from "./BlocoEditor";

const MAX_PRINTS_IA = 8;

interface Cliente {
  id: string;
  name: string;
  logo_url: string | null;
  city: string | null;
  state: string | null;
}

const CAMPOS_METRICA: Array<{ chave: keyof MetricasRelatorio; rotulo: string }> = [
  { chave: "investimento", rotulo: "Investimento (R$)" },
  { chave: "alcance", rotulo: "Alcance" },
  { chave: "impressoes", rotulo: "Impressões" },
  { chave: "cliques", rotulo: "Cliques" },
  { chave: "mensagens", rotulo: "Mensagens" },
  { chave: "visitas_pagina", rotulo: "Visitas à página" },
  { chave: "custo_por_clique", rotulo: "Custo por clique (R$)" },
  { chave: "custo_por_mensagem", rotulo: "Custo por mensagem (R$)" },
];

function periodoPadrao() {
  const s = format(subMonths(new Date(), 1), "MMMM 'de' yyyy", { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function htmlEmBase64(html: string) {
  const bytes = new TextEncoder().encode(html);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// FunctionsHttpError esconde o corpo — e nele que vem o motivo de verdade.
async function invocar<T>(nome: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nome, { body });
  if (error) {
    const detalhe = await (error as { context?: { json?: () => Promise<{ error?: string }> } })
      .context?.json?.().catch(() => null);
    throw new Error(detalhe?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

// A IA so preenche numeros, criativo e resumo. Ao gerar de novo num relatorio
// ja montado, so esses sao trocados (no mesmo lugar); o que o gestor
// acrescentou fica.
function mesclarBlocosDaIA(atuais: Bloco[], novos: Bloco[]): Bloco[] {
  const resultado = [...atuais];
  for (const novo of novos) {
    const i = resultado.findIndex((b) => b.tipo === novo.tipo);
    if (i >= 0) resultado[i] = { ...novo, id: resultado[i].id };
    else if (novo.tipo === "numeros") resultado.unshift(novo);
    else if (novo.tipo === "criativo") {
      const n = resultado.findIndex((b) => b.tipo === "numeros");
      resultado.splice(n + 1, 0, novo);
    } else resultado.push(novo);
  }
  return resultado;
}

export function RelatorioEditor() {
  const { empresa } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [periodo, setPeriodo] = useState(periodoPadrao);
  const [observacoes, setObservacoes] = useState("");
  const [prints, setPrints] = useState<string[]>([]);
  const [dados, setDados] = useState<RelatorioDados | null>(null);
  const [salvoId, setSalvoId] = useState<string | null>(null);
  const [alterado, setAlterado] = useState(false);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const { historico, setHistorico, loading: carregandoHistorico, error: erroHistorico, retry: recarregarHistorico } = useReportHistory(clienteId);
  const [gerando, setGerando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cliente = clientes.find((c) => c.id === clienteId);
  const html = useMemo(() => (dados ? montarRelatorioHtml(dados) : ""), [dados]);

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name, logo_url, city, state")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => setClientes((data as Cliente[]) ?? []));
  }, []);

  function relatorioEmBranco(c: Cliente): RelatorioDados {
    return {
      agencia: { nome: empresa?.nome_exibicao || empresa?.name || "Agência", logo_url: empresa?.logo_url ?? null },
      cliente: { nome: c.name, logo_url: c.logo_url },
      local: c.city ? `${c.city}${c.state ? `/${c.state}` : ""}` : "",
      periodo,
      manchete: "",
      subtitulo: "",
      metricas: { ...METRICAS_VAZIAS },
      blocos: [],
    };
  }

  function abrirRelatorio(novo: RelatorioDados, id: string | null, abrirBlocos: string[] = []) {
    setDados(novo);
    setSalvoId(id);
    setAlterado(false);
    setAbertos(new Set(abrirBlocos));
  }

  function editar(fn: (d: RelatorioDados) => RelatorioDados) {
    setDados((d) => (d ? fn(d) : d));
    setAlterado(true);
  }

  function criarPersonalizado() {
    if (!cliente) return toast.error("Escolha o cliente");
    const blocos = ["numeros", "prints", "analise", "proximos"].map(criarBloco);
    abrirRelatorio({ ...relatorioEmBranco(cliente), blocos }, null, [blocos[1].id]);
    setAlterado(true);
  }

  async function adicionarPrintsIA(arquivos: File[]) {
    const vagas = MAX_PRINTS_IA - prints.length;
    if (arquivos.length > vagas) toast.warning(`A IA lê até ${MAX_PRINTS_IA} prints por vez`);
    try {
      const novos = await Promise.all(arquivos.slice(0, Math.max(vagas, 0)).map((f) => comprimirImagem(f, 1600, 0.85)));
      setPrints((p) => [...p, ...novos]);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function gerarComIA() {
    if (!cliente) return toast.error("Escolha o cliente");
    if (!prints.length) return toast.error("Adicione os prints do Gerenciador de Anúncios");
    setGerando(true);
    try {
      const { dados: ia = {} } = await invocar<{ dados?: Record<string, unknown> }>("relatorio-ia", {
        client_id: cliente.id,
        prints,
        periodo: dados?.periodo || periodo,
        observacoes,
      });
      const base = dados && dados.cliente.nome === cliente.name ? dados : relatorioEmBranco(cliente);
      const texto = (v: unknown) => (typeof v === "string" ? v : "");
      setDados({
        ...base,
        periodo: texto(ia.periodo) || base.periodo,
        manchete: texto(ia.manchete) || base.manchete,
        subtitulo: texto(ia.subtitulo) || base.subtitulo,
        metricas: metricasDaIA(ia.metricas),
        blocos: mesclarBlocosDaIA(base.blocos, blocosDaIA(ia, prints)),
      });
      setAlterado(true);
      toast.success("Relatório montado — confira os números antes de enviar");
    } catch (e) {
      toast.error((e as Error).message || "A IA não conseguiu ler os prints");
    } finally {
      setGerando(false);
    }
  }

  function mudarBloco(bloco: Bloco) {
    editar((d) => ({ ...d, blocos: d.blocos.map((b) => (b.id === bloco.id ? bloco : b)) }));
  }

  function moverBloco(i: number, direcao: -1 | 1) {
    editar((d) => {
      const blocos = [...d.blocos];
      [blocos[i], blocos[i + direcao]] = [blocos[i + direcao], blocos[i]];
      return { ...d, blocos };
    });
  }

  function adicionarBloco(chave: string) {
    const bloco = criarBloco(chave);
    editar((d) => ({ ...d, blocos: [...d.blocos, bloco] }));
    setAbertos((a) => new Set(a).add(bloco.id));
  }

  function alternarBloco(id: string) {
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function salvar() {
    if (!dados || !cliente) return;
    setSalvando(true);
    const linha = {
      client_id: cliente.id,
      periodo: dados.periodo,
      dados: dados as unknown as Json,
      updated_at: new Date().toISOString(),
    };
    const consulta = salvoId
      ? supabase.from("relatorios_ia").update(linha).eq("id", salvoId)
      : supabase.from("relatorios_ia").insert(linha);
    const { data, error } = await consulta.select("id, periodo, updated_at, dados").single();
    setSalvando(false);
    if (error) return toast.error("Não consegui salvar o relatório");
    const salvo = data as SavedReport;
    setSalvoId(salvo.id);
    setAlterado(false);
    setHistorico((h) => [salvo, ...h.filter((r) => r.id !== salvo.id)]);
    toast.success("Relatório salvo — dá para continuar editando depois");
  }

  async function excluir(id: string) {
    const { error } = await supabase.from("relatorios_ia").delete().eq("id", id);
    if (error) return toast.error("Não consegui excluir");
    setHistorico((h) => h.filter((r) => r.id !== id));
    if (salvoId === id) setSalvoId(null);
  }

  function baixarHtml() {
    if (!dados) return;
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), nomeDoArquivo(dados, "html"));
  }

  function abrirEmAba() {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function baixarPdf() {
    if (!dados) return;
    setExportando(true);
    try {
      downloadBlob(await relatorioEmPdf(html), nomeDoArquivo(dados, "pdf"));
    } catch (e) {
      toast.error(`Não consegui gerar o PDF: ${(e as Error).message}`);
    } finally {
      setExportando(false);
    }
  }

  async function enviarWhatsApp(formato: "pdf" | "html") {
    if (!dados || !cliente) return;
    setEnviando(true);
    try {
      const m = dados.metricas;
      const linhas = [
        `📊 *Relatório de Performance${dados.periodo ? ` — ${dados.periodo}` : ""}*`,
        `👤 *${dados.cliente.nome}*`,
        dados.manchete,
        m.investimento != null ? `Investimento: ${fmtReais(m.investimento)}` : "",
        "O relatório completo está no arquivo abaixo.",
      ];
      const media_base64 =
        formato === "pdf"
          ? `data:application/pdf;base64,${await blobToBase64(await relatorioEmPdf(html))}`
          : `data:text/html;base64,${htmlEmBase64(html)}`;
      await invocar("send-report-whatsapp", {
        client_id: cliente.id,
        file_name: nomeDoArquivo(dados, formato),
        media_base64,
        text: linhas.filter(Boolean).join("\n"),
      });
      toast.success("Relatório enviado no WhatsApp do cliente");
    } catch (e) {
      toast.error((e as Error).message || "Erro ao enviar no WhatsApp");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cliente e período</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select
              value={clienteId}
              onValueChange={(id) => {
                if (alterado && !window.confirm("Trocar de cliente descarta as alterações não salvas. Continuar?")) return;
                setClienteId(id);
                setDados(null);
                setSalvoId(null);
                setAlterado(false);
                setPrints([]);
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
              <SelectContent>
                {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              value={dados ? dados.periodo : periodo}
              onChange={(e) => (dados ? editar((d) => ({ ...d, periodo: e.target.value })) : setPeriodo(e.target.value))}
              placeholder="Período (ex.: Setembro de 2026)"
            />
            {!dados && (
              <Button variant="outline" className="w-full" onClick={criarPersonalizado} disabled={!clienteId}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                Criar relatório personalizado
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              {dados ? "Preencher números com IA" : "Ou gerar com IA a partir dos prints"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {prints.map((src, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
                  <img src={src} alt={`Print ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPrints((p) => p.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100"
                    aria-label="Remover print"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {prints.length < MAX_PRINTS_IA && (
                <ZonaDeImagens onArquivos={adicionarPrintsIA} className="flex aspect-square flex-col items-center justify-center gap-1">
                  <ImagePlus className="h-5 w-5" />
                  Prints
                </ZonaDeImagens>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Mande o print das campanhas com os totais e o print por anúncio. Para colar, clique na área e aperte Ctrl+V.
              {dados ? " Só capa, números, criativo e resumo são trocados; as outras seções ficam." : ""}
            </p>
            <Textarea
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Observações para a IA (opcional). Ex.: até R$ 15 por conversa é saudável para clínicas"
            />
            <Button className="w-full" onClick={gerarComIA} disabled={gerando || !clienteId || !prints.length}>
              {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {gerando ? "Lendo os prints..." : dados ? "Preencher com IA" : "Gerar relatório com IA"}
            </Button>
          </CardContent>
        </Card>

        {dados && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Capa e números</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Cidade/região</Label>
                  <Input value={dados.local} onChange={(e) => editar((d) => ({ ...d, local: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Manchete</Label>
                  <Input
                    value={dados.manchete}
                    onChange={(e) => editar((d) => ({ ...d, manchete: e.target.value }))}
                    placeholder="Ex.: 95 conversas no WhatsApp a R$ 10,56 cada."
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Subtítulo</Label>
                  <Textarea rows={2} value={dados.subtitulo} onChange={(e) => editar((d) => ({ ...d, subtitulo: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CAMPOS_METRICA.map(({ chave, rotulo }) => (
                    <div key={chave} className="space-y-1">
                      <Label className="text-xs">{rotulo}</Label>
                      <CampoNumero
                        valor={dados.metricas[chave]}
                        onChange={(n) => editar((d) => ({ ...d, metricas: { ...d.metricas, [chave]: n } }))}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Número em branco some do relatório.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                <CardTitle className="text-base">Seções</CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus className="mr-1.5 h-4 w-4" />
                      Adicionar seção
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    {MODELOS_DE_BLOCO.map((m) => (
                      <DropdownMenuItem key={m.chave} onClick={() => adicionarBloco(m.chave)} className="flex-col items-start gap-0">
                        <span className="text-sm font-medium">{m.rotulo}</span>
                        <span className="text-xs text-muted-foreground">{m.descricao}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="space-y-2">
                {dados.blocos.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma seção. Adicione prints, dados, análises...</p>
                )}
                {dados.blocos.map((b, i) => (
                  <BlocoEditor
                    key={b.id}
                    bloco={b}
                    aberto={abertos.has(b.id)}
                    primeiro={i === 0}
                    ultimo={i === dados.blocos.length - 1}
                    onAlternar={() => alternarBloco(b.id)}
                    onMudar={mudarBloco}
                    onMover={(d) => moverBloco(i, d)}
                    onRemover={() => editar((d) => ({ ...d, blocos: d.blocos.filter((x) => x.id !== b.id) }))}
                  />
                ))}
              </CardContent>
            </Card>
          </>
        )}

        {clienteId && carregandoHistorico && (
          <p role="status" className="text-sm text-muted-foreground">Carregando relatórios salvos...</p>
        )}
        {clienteId && erroHistorico && (
          <div role="alert" className="space-y-2 rounded-md border border-destructive/30 p-3">
            <p className="text-sm">{erroHistorico}</p>
            <Button variant="outline" size="sm" onClick={recarregarHistorico}>Tentar novamente</Button>
          </div>
        )}
        {clienteId && historico.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Relatórios salvos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {historico.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => {
                      if (alterado && !window.confirm("Abrir outro relatório descarta as alterações não salvas. Continuar?")) return;
                      abrirRelatorio(normalizarRelatorio(r.dados), r.id);
                    }}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{r.periodo || "Sem período"}</span>
                      <span className="block text-xs text-muted-foreground">
                        Editado em {formatReportDate(r.updated_at)}
                        {salvoId === r.id ? " · aberto" : ""}
                      </span>
                    </span>
                  </button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => excluir(r.id)} aria-label="Excluir relatório">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="overflow-hidden xl:sticky xl:top-4 xl:self-start">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            Prévia
            {dados && alterado && <Badge variant="secondary">Não salvo</Badge>}
          </CardTitle>
          {dados && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={salvar} disabled={salvando}>
                {salvando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Salvar
              </Button>
              <Button variant="outline" size="sm" onClick={abrirEmAba}>
                <ExternalLink className="mr-1.5 h-4 w-4" />
                Abrir
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={exportando}>
                    {exportando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                    Exportar
                    <ChevronDown className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={baixarPdf}>Baixar PDF</DropdownMenuItem>
                  <DropdownMenuItem onClick={baixarHtml}>Baixar HTML</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" disabled={enviando}>
                    {enviando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <WhatsAppIcon className="mr-1.5 h-4 w-4" />}
                    Enviar
                    <ChevronDown className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => enviarWhatsApp("pdf")}>WhatsApp do cliente — PDF</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => enviarWhatsApp("html")}>WhatsApp do cliente — HTML</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {dados ? (
            <iframe title="Prévia do relatório" srcDoc={html} sandbox="" className="h-[80vh] w-full border-t bg-white" />
          ) : (
            <div className="flex h-[60vh] flex-col items-center justify-center gap-2 border-t px-6 text-center text-sm text-muted-foreground">
              <FilePlus2 className="h-8 w-8" />
              Escolha o cliente e clique em “Criar relatório personalizado”, ou gere com IA a partir dos prints.
              <span className="text-xs">Monte as seções, salve para editar depois e exporte em PDF ou HTML.</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
