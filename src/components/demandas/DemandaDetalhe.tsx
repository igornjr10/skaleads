import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ExternalLink, FileUp, History, Link2, ListChecks, Loader2, MessageCircle, Paperclip, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import type { ClienteResumo, Pessoa } from "@/hooks/useDemandas";
import { errorMessage } from "@/lib/utils";
import { rotuloPapel, veTodosOsClientes } from "@/lib/permissoes";
import {
  CATEGORIAS, PRIORIDADES, STATUS_DEMANDA, type Demanda, type ItemChecklist,
  categoriaLabel, novoItemChecklist, paraBanco, paraDemanda, prioridadeMeta, progressoChecklist, statusMeta,
} from "@/lib/demandas";

const SEM = "sem";
const TAMANHO_MAXIMO = 20 * 1024 * 1024;

interface Comentario { id: string; autor_id: string | null; texto: string; created_at: string }
interface Anexo { id: string; nome: string; caminho: string | null; url: string | null; tamanho: number | null; autor_id: string | null; created_at: string }
interface Evento { id: string; autor_id: string | null; tipo: string; de: string | null; para: string | null; created_at: string }

function formatarTamanho(bytes: number | null) {
  if (!bytes) return "";
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export function DemandaDetalhe({
  demanda, onClose, onChange, onDelete, clientesDaCarteira, clientePorId, pessoas, pessoaPorId,
}: {
  demanda: Demanda | null;
  onClose: () => void;
  onChange: (d: Demanda) => void;
  onDelete: (id: string) => void;
  clientesDaCarteira: ClienteResumo[];
  clientePorId: Map<string, ClienteResumo>;
  pessoas: Pessoa[];
  pessoaPorId: Map<string, Pessoa>;
}) {
  const { user, role } = useAuth();
  const [rascunho, setRascunho] = useState<Demanda | null>(demanda);
  const [salvando, setSalvando] = useState(false);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [novoComentario, setNovoComentario] = useState("");
  const [novoItem, setNovoItem] = useState("");
  const [link, setLink] = useState({ nome: "", url: "" });
  const [enviando, setEnviando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const id = demanda?.id;
  useEffect(() => {
    setRascunho(demanda);
    setNovoComentario("");
    setNovoItem("");
    setLink({ nome: "", url: "" });
    if (!id) return;
    Promise.all([
      supabase.from("task_comments").select("id, autor_id, texto, created_at").eq("task_id", id).order("created_at"),
      supabase.from("task_anexos").select("id, nome, caminho, url, tamanho, autor_id, created_at").eq("task_id", id).order("created_at"),
      supabase.from("task_events").select("id, autor_id, tipo, de, para, created_at").eq("task_id", id).order("created_at"),
    ]).then(([c, a, e]) => {
      setComentarios((c.data as Comentario[]) ?? []);
      setAnexos((a.data as Anexo[]) ?? []);
      setEventos((e.data as Evento[]) ?? []);
    });
    // Recarrega so quando troca de demanda, nao a cada edicao local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!demanda || !rascunho) return null;

  const isAdmin = veTodosOsClientes(role);
  const souQuemPediu = demanda.created_by === user?.id;
  const podeEditarTudo = isAdmin || souQuemPediu;
  const podeMover = podeEditarTudo || demanda.assigned_to === user?.id;
  const nome = (uid: string | null) => (uid ? pessoaPorId.get(uid)?.nome ?? "Alguém" : "Sistema");
  const cliente = demanda.client_id ? clientePorId.get(demanda.client_id) : null;

  async function gravar(mudanca: Partial<Demanda>, sucesso?: string) {
    const { data, error } = await supabase.from("tasks").update(paraBanco(mudanca)).eq("id", demanda!.id).select("*").single();
    if (error) {
      toast.error(errorMessage(error, "Não foi possível salvar"));
      return false;
    }
    const atualizada = paraDemanda(data);
    onChange(atualizada);
    setRascunho(r => (r ? { ...r, ...mudanca, concluida_at: atualizada.concluida_at } : r));
    if (sucesso) toast.success(sucesso);
    const { data: ev } = await supabase.from("task_events").select("id, autor_id, tipo, de, para, created_at").eq("task_id", demanda!.id).order("created_at");
    setEventos((ev as Evento[]) ?? []);
    return true;
  }

  async function salvarCampos() {
    if (!rascunho!.titulo.trim()) return toast.error("A demanda precisa de um título");
    setSalvando(true);
    await gravar({
      titulo: rascunho!.titulo.trim(),
      descricao: rascunho!.descricao,
      client_id: rascunho!.client_id,
      prioridade: rascunho!.prioridade,
      categoria: rascunho!.categoria,
      prazo: rascunho!.prazo || null,
      assigned_to: rascunho!.assigned_to,
    }, "Demanda atualizada");
    setSalvando(false);
  }

  async function mudarChecklist(checklist: ItemChecklist[]) {
    setRascunho(r => (r ? { ...r, checklist } : r));
    await gravar({ checklist });
  }

  async function comentar() {
    const texto = novoComentario.trim();
    if (!texto || !user) return;
    setNovoComentario("");
    const { data, error } = await supabase
      .from("task_comments")
      .insert({ task_id: demanda!.id, autor_id: user.id, texto })
      .select("id, autor_id, texto, created_at")
      .single();
    if (error) {
      setNovoComentario(texto);
      return toast.error(errorMessage(error, "Não foi possível comentar"));
    }
    setComentarios(atual => [...atual, data as Comentario]);
  }

  async function enviarArquivo(file: File) {
    if (file.size > TAMANHO_MAXIMO) return toast.error("Arquivo acima de 20 MB: mande como link (Drive, WeTransfer)");
    if (!demanda!.company_id || !user) return;
    setEnviando(true);
    const nomeSeguro = file.name.normalize("NFD").replace(/[^\w.-]+/g, "_");
    const caminho = `${demanda!.company_id}/${demanda!.id}/${crypto.randomUUID()}-${nomeSeguro}`;
    const { error: upErr } = await supabase.storage.from("demandas").upload(caminho, file, { contentType: file.type || undefined });
    if (upErr) {
      setEnviando(false);
      return toast.error(errorMessage(upErr, "Falha no upload"));
    }
    const { data, error } = await supabase
      .from("task_anexos")
      .insert({ task_id: demanda!.id, nome: file.name, caminho, tamanho: file.size, tipo: file.type || null, autor_id: user.id })
      .select("id, nome, caminho, url, tamanho, autor_id, created_at")
      .single();
    setEnviando(false);
    if (error) {
      await supabase.storage.from("demandas").remove([caminho]);
      return toast.error(errorMessage(error, "Não foi possível registrar o anexo"));
    }
    setAnexos(atual => [...atual, data as Anexo]);
  }

  async function adicionarLink() {
    const url = link.url.trim();
    if (!/^https?:\/\//i.test(url)) return toast.error("O link precisa começar com http:// ou https://");
    if (!user) return;
    const { data, error } = await supabase
      .from("task_anexos")
      .insert({ task_id: demanda!.id, nome: link.nome.trim() || url, url, autor_id: user.id })
      .select("id, nome, caminho, url, tamanho, autor_id, created_at")
      .single();
    if (error) return toast.error(errorMessage(error, "Não foi possível salvar o link"));
    setAnexos(atual => [...atual, data as Anexo]);
    setLink({ nome: "", url: "" });
  }

  async function abrirAnexo(a: Anexo) {
    if (a.url) return window.open(a.url, "_blank", "noopener");
    // Bucket privado: o link assinado expira e nao vaza para fora da equipe.
    const { data, error } = await supabase.storage.from("demandas").createSignedUrl(a.caminho!, 60 * 10);
    if (error || !data) return toast.error(errorMessage(error, "Não foi possível abrir o arquivo"));
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function tirarAnexo(a: Anexo) {
    const { error } = await supabase.from("task_anexos").delete().eq("id", a.id);
    if (error) return toast.error(errorMessage(error, "Não foi possível tirar o anexo"));
    if (a.caminho) await supabase.storage.from("demandas").remove([a.caminho]);
    setAnexos(atual => atual.filter(x => x.id !== a.id));
  }

  async function excluir() {
    const { error } = await supabase.from("tasks").delete().eq("id", demanda!.id);
    if (error) return toast.error(errorMessage(error, "Não foi possível excluir"));
    onDelete(demanda!.id);
  }

  function descreverEvento(e: Evento) {
    switch (e.tipo) {
      case "criada": return "abriu a demanda";
      case "status": return `moveu de ${statusMeta(e.de ?? "").label} para ${statusMeta(e.para ?? "").label}`;
      case "responsavel": return e.para ? `passou para ${nome(e.para)}` : "tirou o responsável";
      case "prazo": return e.para ? `mudou o prazo para ${format(parseISO(e.para), "dd/MM/yyyy")}` : "tirou o prazo";
      case "prioridade": return `mudou a prioridade para ${prioridadeMeta(e.para ?? "").label}`;
      default: return e.tipo;
    }
  }

  const progresso = progressoChecklist(rascunho.checklist);

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6">{demanda.titulo}</DialogTitle>
          <DialogDescription>
            {cliente?.name ?? "Sem cliente"} · {categoriaLabel(demanda.categoria)} · pedida por {nome(demanda.created_by)}
            {demanda.concluida_at && ` · concluída em ${format(parseISO(demanda.concluida_at), "dd/MM/yyyy")}`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Status</Label>
            <Select value={rascunho.status} onValueChange={v => gravar({ status: v })} disabled={!podeMover}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_DEMANDA.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Responsável</Label>
            <Select
              value={rascunho.assigned_to ?? SEM}
              onValueChange={v => setRascunho({ ...rascunho, assigned_to: v === SEM ? null : v })}
              disabled={!podeEditarTudo}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM}>Sem responsável</SelectItem>
                {pessoas.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} · {rotuloPapel(p.role)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="detalhes" className="mt-2">
          <TabsList className="flex w-full flex-wrap justify-start">
            <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
            <TabsTrigger value="checklist" className="gap-1.5">
              <ListChecks className="h-3.5 w-3.5" /> {progresso.total ? `${progresso.feitos}/${progresso.total}` : "Checklist"}
            </TabsTrigger>
            <TabsTrigger value="anexos" className="gap-1.5"><Paperclip className="h-3.5 w-3.5" /> {anexos.length}</TabsTrigger>
            <TabsTrigger value="comentarios" className="gap-1.5"><MessageCircle className="h-3.5 w-3.5" /> {comentarios.length}</TabsTrigger>
            <TabsTrigger value="historico" className="gap-1.5"><History className="h-3.5 w-3.5" /> Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="detalhes" className="space-y-3">
            {podeEditarTudo ? (
              <>
                <div>
                  <Label>Título</Label>
                  <Input value={rascunho.titulo} onChange={e => setRascunho({ ...rascunho, titulo: e.target.value })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Cliente</Label>
                    <Select
                      value={rascunho.client_id ?? SEM}
                      onValueChange={v => setRascunho({ ...rascunho, client_id: v === SEM ? null : v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM}>Sem cliente</SelectItem>
                        {/* O cliente atual fica na lista mesmo se nao for da carteira de quem edita. */}
                        {cliente && !clientesDaCarteira.some(c => c.id === cliente.id) && (
                          <SelectItem value={cliente.id}>{cliente.name}</SelectItem>
                        )}
                        {clientesDaCarteira.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Categoria</Label>
                    <Select value={rascunho.categoria} onValueChange={v => setRascunho({ ...rascunho, categoria: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIAS.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Prioridade</Label>
                    <Select value={rascunho.prioridade} onValueChange={v => setRascunho({ ...rascunho, prioridade: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRIORIDADES.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Prazo</Label>
                    <Input type="date" value={rascunho.prazo ?? ""} onChange={e => setRascunho({ ...rascunho, prazo: e.target.value || null })} />
                  </div>
                </div>
                <div>
                  <Label>Descrição / briefing</Label>
                  <Textarea
                    rows={5}
                    value={rascunho.descricao ?? ""}
                    onChange={e => setRascunho({ ...rascunho, descricao: e.target.value })}
                    placeholder="O que precisa ser feito, referências, formato, links..."
                  />
                </div>
              </>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3 text-muted-foreground">
                  <span>Prioridade: <strong className="text-foreground">{prioridadeMeta(demanda.prioridade).label}</strong></span>
                  <span>Prazo: <strong className="text-foreground">{demanda.prazo ? format(parseISO(demanda.prazo), "dd/MM/yyyy") : "—"}</strong></span>
                </div>
                <p className="whitespace-pre-wrap rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-muted-foreground">
                  {demanda.descricao || "Sem descrição."}
                </p>
                <p className="text-[11px] text-muted-foreground">Quem está fazendo muda o status e o checklist; o resto é com quem pediu.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="checklist" className="space-y-3">
            {progresso.total > 0 && <Progress value={(progresso.feitos / progresso.total) * 100} className="h-1.5" />}
            <div className="space-y-1">
              {rascunho.checklist.map(item => (
                <div key={item.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40">
                  <Checkbox
                    checked={item.feito}
                    disabled={!podeMover}
                    onCheckedChange={v => mudarChecklist(rascunho.checklist.map(i => (i.id === item.id ? { ...i, feito: !!v } : i)))}
                  />
                  <span className={`flex-1 text-sm ${item.feito ? "text-muted-foreground line-through" : ""}`}>{item.texto}</span>
                  {podeMover && (
                    <button
                      type="button"
                      aria-label="Tirar item"
                      className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      onClick={() => mudarChecklist(rascunho.checklist.filter(i => i.id !== item.id))}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {rascunho.checklist.length === 0 && <p className="text-xs text-muted-foreground">Nenhum item ainda.</p>}
            </div>
            {podeMover && (
              <form
                className="flex gap-2"
                onSubmit={e => {
                  e.preventDefault();
                  if (!novoItem.trim()) return;
                  mudarChecklist([...rascunho.checklist, novoItemChecklist(novoItem)]);
                  setNovoItem("");
                }}
              >
                <Input value={novoItem} onChange={e => setNovoItem(e.target.value)} placeholder="Novo item..." />
                <Button type="submit" variant="outline" size="icon" aria-label="Adicionar item"><Plus className="h-4 w-4" /></Button>
              </form>
            )}
          </TabsContent>

          <TabsContent value="anexos" className="space-y-3">
            <div className="space-y-1.5">
              {anexos.map(a => (
                <div key={a.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2">
                  {a.url ? <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <button type="button" className="min-w-0 flex-1 truncate text-left text-sm hover:underline" onClick={() => abrirAnexo(a)}>
                    {a.nome}
                  </button>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {[formatarTamanho(a.tamanho), nome(a.autor_id)].filter(Boolean).join(" · ")}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {(a.autor_id === user?.id || isAdmin) && (
                    <button type="button" aria-label="Tirar anexo" className="text-muted-foreground hover:text-destructive" onClick={() => tirarAnexo(a)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {anexos.length === 0 && <p className="text-xs text-muted-foreground">Nenhum material ainda.</p>}
            </div>
            <input
              ref={arquivo}
              type="file"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) enviarArquivo(f); e.target.value = ""; }}
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => arquivo.current?.click()} disabled={enviando} className="shrink-0">
                {enviando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileUp className="mr-1.5 h-4 w-4" />}
                Enviar arquivo
              </Button>
              <Input placeholder="Nome (opcional)" value={link.nome} onChange={e => setLink({ ...link, nome: e.target.value })} className="sm:w-40" />
              <Input placeholder="https://drive.google.com/..." value={link.url} onChange={e => setLink({ ...link, url: e.target.value })} />
              <Button type="button" variant="outline" onClick={adicionarLink} disabled={!link.url.trim()} className="shrink-0">
                <Link2 className="mr-1.5 h-4 w-4" /> Link
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="comentarios" className="space-y-3">
            <div className="space-y-2">
              {comentarios.map(c => (
                <div key={c.id} className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">{nome(c.autor_id)}</span>
                    <span className="text-[10px] text-muted-foreground/60">{format(parseISO(c.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{c.texto}</p>
                </div>
              ))}
              {comentarios.length === 0 && <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Textarea
                value={novoComentario}
                onChange={e => setNovoComentario(e.target.value)}
                rows={2}
                placeholder="Comentar para quem está na demanda..."
                className="flex-1"
              />
              <Button onClick={comentar} disabled={!novoComentario.trim()} className="shrink-0 sm:self-end">Enviar</Button>
            </div>
          </TabsContent>

          <TabsContent value="historico">
            <ol className="space-y-2 border-l border-border/60 pl-4">
              {eventos.map(e => (
                <li key={e.id} className="text-sm">
                  <span className="font-medium">{nome(e.autor_id)}</span>{" "}
                  <span className="text-muted-foreground">{descreverEvento(e)}</span>
                  <div className="text-[11px] text-muted-foreground/70">{format(parseISO(e.created_at), "dd/MM/yyyy HH:mm")}</div>
                </li>
              ))}
              {eventos.length === 0 && <li className="text-xs text-muted-foreground">Sem registros.</li>}
            </ol>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:justify-between">
          {podeEditarTudo ? (
            <Button variant="ghost" onClick={excluir} className="text-destructive">
              <Trash2 className="mr-1.5 h-4 w-4" /> Excluir
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
            {podeEditarTudo && (
              <Button onClick={salvarCampos} disabled={salvando}>
                {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
