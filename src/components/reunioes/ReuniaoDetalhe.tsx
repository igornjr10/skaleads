import { useEffect, useRef, useState } from "react";
import {
  CalendarPlus, CheckCircle2, Clock, Download, ExternalLink, FileUp, Loader2, MapPin, Pencil, RotateCcw, Trash2, Users, Video, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ClientAvatar } from "@/components/ClientAvatar";
import { cn, errorMessage } from "@/lib/utils";
import {
  type AcaoReuniao, type Reuniao, type StatusReuniao,
  aguardaRegistro, dataEHora, detalhesDoConvite, duracaoLegivel, fimDaReuniao, gerarIcs, horario, limparTranscricao,
  linkGoogleAgenda, localDoConvite, nomeDoArquivoIcs, paraReuniao, statusReuniaoMeta,
} from "@/lib/reunioes";
import { ReuniaoAcoes } from "./ReuniaoAcoes";
import { ReuniaoResumo } from "./ReuniaoResumo";
import type { ClienteDaReuniao, PessoaDaReuniao } from "./useReunioes";

const LIMITE_IA = 60_000;

type PatchReuniao = Partial<Pick<Reuniao,
  "status" | "pauta" | "decisoes" | "observacoes" | "acoes" | "gravacao_url" | "transcricao">>;

function urlValida(v: string) {
  return !v || /^https?:\/\/\S+$/i.test(v);
}

export function ReuniaoDetalhe({
  reuniao, open, onOpenChange, participantes, cliente, pessoas, podeGerenciar, podeRegistrar, onMudou, onEditar, onExcluida,
}: {
  reuniao: Reuniao | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  participantes: string[];
  cliente: ClienteDaReuniao | null;
  pessoas: PessoaDaReuniao[];
  podeGerenciar: boolean;
  podeRegistrar: boolean;
  onMudou: (r: Reuniao) => void;
  onEditar: () => void;
  onExcluida: (id: string) => void;
}) {
  const [aba, setAba] = useState("registro");
  const [registro, setRegistro] = useState({ pauta: "", decisoes: "", observacoes: "" });
  const [gravacao, setGravacao] = useState({ url: "", transcricao: "" });
  const [salvando, setSalvando] = useState<string | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);

  // Os rascunhos so voltam ao gravado quando troca de reuniao ou quando outra
  // pessoa salva: assim o realtime nao apaga o que esta sendo digitado.
  const gravadoRef = useRef<Reuniao | null>(null);
  useEffect(() => {
    if (!reuniao) return;
    const antes = gravadoRef.current;
    const outra = !antes || antes.id !== reuniao.id;
    setRegistro(atual => {
      const limpo = antes && atual.pauta === (antes.pauta ?? "") && atual.decisoes === (antes.decisoes ?? "") && atual.observacoes === (antes.observacoes ?? "");
      return outra || limpo ? { pauta: reuniao.pauta ?? "", decisoes: reuniao.decisoes ?? "", observacoes: reuniao.observacoes ?? "" } : atual;
    });
    setGravacao(atual => {
      const limpo = antes && atual.url === (antes.gravacao_url ?? "") && atual.transcricao === (antes.transcricao ?? "");
      return outra || limpo ? { url: reuniao.gravacao_url ?? "", transcricao: reuniao.transcricao ?? "" } : atual;
    });
    if (outra) setAba("registro");
    gravadoRef.current = reuniao;
  }, [reuniao]);

  if (!reuniao) return null;
  const r = reuniao;

  const registroSujo = registro.pauta !== (r.pauta ?? "") || registro.decisoes !== (r.decisoes ?? "") || registro.observacoes !== (r.observacoes ?? "");
  const gravacaoSuja = gravacao.url !== (r.gravacao_url ?? "") || gravacao.transcricao !== (r.transcricao ?? "");
  const status = statusReuniaoMeta(r.status);
  const pendente = aguardaRegistro(r);
  const nomesParticipantes = participantes.map(id => pessoas.find(p => p.id === id)?.nome ?? "Alguém da equipe");
  const linkDoApp = `${window.location.origin}/reunioes?reuniao=${r.id}`;
  const convite = {
    titulo: r.titulo,
    inicio: r.inicio,
    duracao_min: r.duracao_min,
    detalhes: detalhesDoConvite(r, { cliente: cliente?.name, link: linkDoApp }),
    local: localDoConvite(r),
  };

  async function salvar(patch: PatchReuniao, chave: string, sucesso?: string): Promise<boolean> {
    setSalvando(chave);
    try {
      const { acoes, ...resto } = patch;
      const corpo = acoes ? { ...resto, acoes: acoes as unknown as Json } : resto;
      const { data, error } = await supabase.from("reunioes").update(corpo).eq("id", r.id).select("*").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Você não pode editar esta reunião");
      const nova = paraReuniao(data as Record<string, unknown>);
      gravadoRef.current = nova;
      onMudou(nova);
      if (sucesso) toast.success(sucesso);
      return true;
    } catch (e) {
      toast.error(errorMessage(e, "Não foi possível salvar"));
      return false;
    } finally {
      setSalvando(null);
    }
  }

  async function mudarStatus(novo: StatusReuniao) {
    const msg = novo === "realizada"
      ? r.client_id ? "Reunião realizada: o compromisso do mês na Rotina foi marcado" : "Reunião marcada como realizada"
      : novo === "cancelada" ? "Reunião cancelada" : "Reunião reaberta";
    const ok = await salvar({ status: novo }, `status:${novo}`, msg);
    if (ok && novo === "realizada") setAba(r.decisoes || r.acoes.length ? "acoes" : "registro");
  }

  function baixarIcs() {
    const blob = new Blob([gerarIcs({ ...convite, uid: `${r.id}@reunioes`, url: linkDoApp })], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeDoArquivoIcs(r.titulo);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importarArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    if (arquivo.size > 5 * 1024 * 1024) return toast.error("Arquivo grande demais (máx. 5 MB)");
    try {
      const limpo = limparTranscricao(await arquivo.text());
      if (!limpo) return toast.error("Não achei texto nesse arquivo");
      setGravacao(g => ({ ...g, transcricao: limpo }));
      toast.success("Transcrição importada: confira e clique em Salvar");
    } catch {
      toast.error("Não foi possível ler o arquivo");
    } finally {
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  }

  async function salvarGravacao() {
    const url = gravacao.url.trim();
    if (!urlValida(url)) return toast.error("O link da gravação precisa começar com https://");
    await salvar({ gravacao_url: url || null, transcricao: gravacao.transcricao.trim() || null }, "gravacao", "Gravação e transcrição salvas");
  }

  async function excluir() {
    setSalvando("excluir");
    const { error } = await supabase.from("reunioes").delete().eq("id", r.id);
    setSalvando(null);
    if (error) return toast.error(errorMessage(error, "Não foi possível excluir"));
    toast.success("Reunião excluída");
    setConfirmarExclusao(false);
    onExcluida(r.id);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="space-y-3 pr-6 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={status.classe}>{status.label}</Badge>
              {pendente && <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">Aguardando registro</Badge>}
            </div>
            <SheetTitle className="break-words text-xl">{r.titulo}</SheetTitle>
            <SheetDescription asChild>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <p className="flex flex-wrap items-center gap-1.5">
                  <Clock className="h-4 w-4 shrink-0" />
                  {dataEHora(r.inicio)} até {horario(fimDaReuniao(r).toISOString())} ({duracaoLegivel(r.duracao_min)})
                </p>
                {r.client_id && (
                  <p className="flex min-w-0 items-center gap-1.5">
                    <ClientAvatar name={cliente?.name ?? "?"} logoUrl={cliente?.logo_url} className="h-5 w-5" />
                    <span className="truncate" title={cliente?.name}>{cliente?.name ?? "Cliente fora da sua carteira"}</span>
                  </p>
                )}
                {r.local && (
                  <p className="flex min-w-0 items-center gap-1.5"><MapPin className="h-4 w-4 shrink-0" /><span className="break-words">{r.local}</span></p>
                )}
                <p className="flex min-w-0 items-start gap-1.5">
                  <Users className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="break-words">{nomesParticipantes.length ? nomesParticipantes.join(", ") : "Sem participantes definidos"}</span>
                </p>
              </div>
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex flex-wrap gap-2">
            {r.meet_url && r.status !== "cancelada" && (
              <Button asChild size="sm">
                <a href={r.meet_url} target="_blank" rel="noopener noreferrer"><Video className="mr-1.5 h-4 w-4" /> Entrar no Meet</a>
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <a href={linkGoogleAgenda(convite)} target="_blank" rel="noopener noreferrer"><CalendarPlus className="mr-1.5 h-4 w-4" /> Google Agenda</a>
            </Button>
            <Button size="sm" variant="outline" onClick={baixarIcs}><Download className="mr-1.5 h-4 w-4" /> Baixar .ics</Button>
            {podeRegistrar && (
              <Button size="sm" variant="outline" onClick={onEditar}><Pencil className="mr-1.5 h-4 w-4" /> Editar</Button>
            )}
          </div>
          {!r.meet_url && (
            <p className="mt-2 text-xs text-muted-foreground">
              Sem link do Meet. Adicione ao Google Agenda, gere a videochamada no evento e cole o link em Editar.
            </p>
          )}

          {podeRegistrar && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
              {r.status !== "realizada" && (
                <Button size="sm" variant="secondary" onClick={() => mudarStatus("realizada")} disabled={!!salvando}>
                  {salvando === "status:realizada" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-400" />}
                  Marcar realizada
                </Button>
              )}
              {r.status === "agendada" && (
                <Button size="sm" variant="ghost" onClick={() => mudarStatus("cancelada")} disabled={!!salvando}>
                  <XCircle className="mr-1.5 h-4 w-4" /> Cancelar reunião
                </Button>
              )}
              {r.status !== "agendada" && (
                <Button size="sm" variant="ghost" onClick={() => mudarStatus("agendada")} disabled={!!salvando}>
                  <RotateCcw className="mr-1.5 h-4 w-4" /> Voltar para agendada
                </Button>
              )}
              {podeGerenciar && (
                <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => setConfirmarExclusao(true)}>
                  <Trash2 className="mr-1.5 h-4 w-4" /> Excluir
                </Button>
              )}
            </div>
          )}

          <Tabs value={aba} onValueChange={setAba} className="mt-5">
            <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
              <TabsTrigger value="registro">Registro{registroSujo ? " •" : ""}</TabsTrigger>
              <TabsTrigger value="acoes">Ações{r.acoes.length ? ` (${r.acoes.filter(a => !a.feito).length})` : ""}</TabsTrigger>
              <TabsTrigger value="gravacao">Gravação{gravacaoSuja ? " •" : ""}</TabsTrigger>
              <TabsTrigger value="resumo">Resumo IA</TabsTrigger>
            </TabsList>

            <TabsContent value="registro" className="space-y-4 pt-2">
              {([
                ["pauta", "Pauta", "O que precisa ser tratado"],
                ["decisoes", "Decisões", "O que ficou decidido (um item por linha)"],
                ["observacoes", "Observações", "Contexto, humor do cliente, pontos de atenção"],
              ] as const).map(([campo, rotulo, dica]) => (
                <div key={campo} className="space-y-1.5">
                  <Label htmlFor={`reuniao-${campo}`}>{rotulo}</Label>
                  <Textarea
                    id={`reuniao-${campo}`}
                    value={registro[campo]}
                    onChange={e => setRegistro(s => ({ ...s, [campo]: e.target.value }))}
                    placeholder={dica}
                    rows={campo === "observacoes" ? 3 : 5}
                    disabled={!podeRegistrar}
                  />
                </div>
              ))}
              {podeRegistrar && (
                <div className="flex flex-wrap justify-end gap-2">
                  {registroSujo && (
                    <Button variant="ghost" size="sm" onClick={() => setRegistro({ pauta: r.pauta ?? "", decisoes: r.decisoes ?? "", observacoes: r.observacoes ?? "" })}>
                      Descartar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={!registroSujo || !!salvando}
                    onClick={() => salvar({
                      pauta: registro.pauta.trim() || null,
                      decisoes: registro.decisoes.trim() || null,
                      observacoes: registro.observacoes.trim() || null,
                    }, "registro", "Registro salvo")}
                  >
                    {salvando === "registro" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar registro
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="acoes" className="pt-2">
              <ReuniaoAcoes
                reuniao={r}
                pessoas={pessoas}
                nomeDoCliente={cliente?.name ?? null}
                podeEditar={podeRegistrar}
                salvarAcoes={(acoes: AcaoReuniao[]) => salvar({ acoes }, "acoes")}
              />
            </TabsContent>

            <TabsContent value="gravacao" className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="reuniao-gravacao">Link da gravação (Google Drive)</Label>
                <div className="flex gap-2">
                  <Input
                    id="reuniao-gravacao"
                    value={gravacao.url}
                    onChange={e => setGravacao(g => ({ ...g, url: e.target.value }))}
                    placeholder="https://drive.google.com/..."
                    inputMode="url"
                    disabled={!podeRegistrar}
                    className="min-w-0"
                  />
                  {r.gravacao_url && (
                    <Button asChild variant="outline" size="icon" className="shrink-0" title="Abrir gravação">
                      <a href={r.gravacao_url} target="_blank" rel="noopener noreferrer" aria-label="Abrir gravação"><ExternalLink className="h-4 w-4" /></a>
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">O Meet salva a gravação no Drive de quem gravou; compartilhe com a equipe e cole o link.</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="reuniao-transcricao">Transcrição</Label>
                  {podeRegistrar && (
                    <>
                      <input
                        ref={arquivoRef}
                        type="file"
                        accept=".txt,.vtt,.srt,text/plain,text/vtt"
                        className="hidden"
                        onChange={e => importarArquivo(e.target.files?.[0])}
                      />
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => arquivoRef.current?.click()}>
                        <FileUp className="mr-1 h-3.5 w-3.5" /> Importar .txt / .vtt / .srt
                      </Button>
                    </>
                  )}
                </div>
                <Textarea
                  id="reuniao-transcricao"
                  value={gravacao.transcricao}
                  onChange={e => setGravacao(g => ({ ...g, transcricao: e.target.value }))}
                  placeholder="Cole aqui a transcrição do Meet (ou importe o arquivo de legendas)"
                  rows={10}
                  disabled={!podeRegistrar}
                  className="font-mono text-xs"
                />
                <p className={cn("text-xs", gravacao.transcricao.length > LIMITE_IA ? "text-amber-400" : "text-muted-foreground")}>
                  {gravacao.transcricao.length.toLocaleString("pt-BR")} caracteres
                  {gravacao.transcricao.length > LIMITE_IA && " — a IA lê só os primeiros 60 mil"}
                </p>
              </div>

              {podeRegistrar && (
                <div className="flex flex-wrap justify-end gap-2">
                  {gravacaoSuja && (
                    <Button variant="ghost" size="sm" onClick={() => setGravacao({ url: r.gravacao_url ?? "", transcricao: r.transcricao ?? "" })}>Descartar</Button>
                  )}
                  <Button size="sm" disabled={!gravacaoSuja || !!salvando} onClick={salvarGravacao}>
                    {salvando === "gravacao" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="resumo" className="pt-2">
              <ReuniaoResumo
                reuniao={r}
                pessoas={pessoas}
                participantes={participantes}
                podeEditar={podeRegistrar}
                temAlteracaoNaoSalva={registroSujo || gravacaoSuja}
                onResumoSalvo={resumo => {
                  const nova = { ...r, resumo_ia: resumo, resumo_ia_em: new Date().toISOString() };
                  gravadoRef.current = nova;
                  onMudou(nova);
                }}
                salvarCampos={patch => salvar(patch, "resumo")}
              />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmarExclusao} onOpenChange={setConfirmarExclusao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta reunião?</AlertDialogTitle>
            <AlertDialogDescription>
              Pauta, decisões, ações e transcrição somem junto. Demandas que já nasceram dela continuam na fila.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando === "excluir"}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => { e.preventDefault(); excluir(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={salvando === "excluir"}
            >
              {salvando === "excluir" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
