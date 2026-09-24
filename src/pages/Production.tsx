import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  CalendarClock,
  Clapperboard,
  Database,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Lock,
  MessageCircle,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ClientAvatar } from "@/components/ClientAvatar";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/utils";

interface Demanda {
  id: string;
  client_id: string;
  tipo: "video" | "arte";
  titulo: string;
  briefing: string | null;
  formato: string | null;
  status: string;
  prazo: string | null;
  arquivo_url: string | null;
  assigned_to: string | null;
  created_at: string;
}

interface Comentario {
  id: string;
  task_id: string;
  autor_id: string | null;
  texto: string;
  created_at: string;
}

interface ClienteResumo {
  id: string;
  name: string;
  logo_url: string | null;
}

interface Pessoa {
  id: string;
  nome: string;
  role: string;
}

const STATUS = [
  { id: "a_fazer", label: "A fazer", cor: "bg-slate-500/12 text-slate-300 ring-slate-500/20" },
  { id: "producao", label: "Em produção", cor: "bg-blue-500/12 text-blue-300 ring-blue-500/20" },
  { id: "revisao", label: "Em revisão", cor: "bg-amber-500/12 text-amber-300 ring-amber-500/20" },
  { id: "aprovada", label: "Aprovada", cor: "bg-emerald-500/12 text-emerald-300 ring-emerald-500/20" },
  { id: "publicada", label: "Publicada", cor: "bg-violet-500/12 text-violet-300 ring-violet-500/20" },
] as const;

const FORMATOS: Record<string, string[]> = {
  video: ["Reel", "Story", "Feed (vídeo)", "VSL", "Anúncio 15s", "Anúncio 30s"],
  arte: ["Feed", "Story", "Carrossel", "Banner", "Thumbnail"],
};

const SEM_RESPONSAVEL = "sem-responsavel";

function statusMeta(id: string) {
  return STATUS.find((s) => s.id === id) ?? STATUS[0];
}

function hojeISO() {
  return format(new Date(), "yyyy-MM-dd");
}

export default function Production() {
  const { user, role } = useAuth();
  const podeGerenciar = role === "owner" || role === "admin";
  const ehProducao = role === "editor" || role === "designer";

  const [demandas, setDemandas] = useState<Demanda[]>([]);
  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [semTabela, setSemTabela] = useState(false);

  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "video" | "arte">("todos");
  const [clienteFiltro, setClienteFiltro] = useState("todos");
  const [soMinhas, setSoMinhas] = useState(false);

  const [aberta, setAberta] = useState<Demanda | null>(null);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [novoComentario, setNovoComentario] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState({
    client_id: "",
    tipo: "arte" as "video" | "arte",
    titulo: "",
    formato: "",
    prazo: "",
    briefing: "",
    assigned_to: SEM_RESPONSAVEL,
  });

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    if (!aberta) return;
    carregarComentarios(aberta.id);
  }, [aberta?.id]);

  async function carregar() {
    setLoading(true);

    const [demandasRes, clientesRes, rolesRes, profilesRes] = await Promise.all([
      supabase.from("creative_tasks").select("*").order("prazo", { ascending: true, nullsFirst: false }),
      supabase.from("clients").select("id, name, logo_url").neq("status", "archived").order("name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    // A migration pode nao ter rodado ainda neste ambiente.
    if (demandasRes.error?.code === "42P01") {
      setSemTabela(true);
      setLoading(false);
      return;
    }

    const perfis = new Map(
      ((profilesRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => [
        p.id,
        p.full_name || p.email || p.id.slice(0, 8),
      ])
    );

    const time = ((rolesRes.data ?? []) as { user_id: string; role: string }[])
      .filter((r) => r.role === "editor" || r.role === "designer")
      .map((r) => ({ id: r.user_id, nome: perfis.get(r.user_id) ?? r.user_id.slice(0, 8), role: r.role }));

    setDemandas((demandasRes.data as Demanda[]) ?? []);
    setClientes((clientesRes.data as ClienteResumo[]) ?? []);
    setPessoas(time);
    setLoading(false);
  }

  async function carregarComentarios(taskId: string) {
    const { data, error } = await supabase
      .from("creative_task_comments")
      .select("id, task_id, autor_id, texto, created_at")
      .eq("task_id", taskId)
      .order("created_at");
    if (error) return toast.error(errorMessage(error, "Nao foi possivel carregar os comentarios"));
    setComentarios((data as Comentario[]) ?? []);
  }

  const clientePorId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const pessoaPorId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return demandas.filter((d) => {
      if (tipoFiltro !== "todos" && d.tipo !== tipoFiltro) return false;
      if (clienteFiltro !== "todos" && d.client_id !== clienteFiltro) return false;
      if (soMinhas && d.assigned_to !== user?.id) return false;
      if (!termo) return true;
      const cliente = clientePorId.get(d.client_id)?.name ?? "";
      return d.titulo.toLowerCase().includes(termo) || cliente.toLowerCase().includes(termo);
    });
  }, [demandas, tipoFiltro, clienteFiltro, soMinhas, busca, clientePorId, user?.id]);

  const resumo = useMemo(() => {
    const hoje = hojeISO();
    const abertas = visiveis.filter((d) => d.status !== "publicada");
    return {
      atrasadas: abertas.filter((d) => d.prazo && d.prazo < hoje).length,
      hoje: abertas.filter((d) => d.prazo === hoje).length,
      revisao: visiveis.filter((d) => d.status === "revisao").length,
      abertas: abertas.length,
    };
  }, [visiveis]);

  function podeMover(demanda: Demanda) {
    return podeGerenciar || (ehProducao && demanda.assigned_to === user?.id);
  }

  async function mudarStatus(demanda: Demanda, status: string) {
    const anterior = demanda.status;
    setDemandas((atual) => atual.map((d) => (d.id === demanda.id ? { ...d, status } : d)));
    setAberta((atual) => (atual && atual.id === demanda.id ? { ...atual, status } : atual));

    const { error } = await supabase.from("creative_tasks").update({ status }).eq("id", demanda.id);
    if (error) {
      setDemandas((atual) => atual.map((d) => (d.id === demanda.id ? { ...d, status: anterior } : d)));
      setAberta((atual) => (atual && atual.id === demanda.id ? { ...atual, status: anterior } : atual));
      toast.error(errorMessage(error, "Nao foi possivel mudar o status"));
    }
  }

  async function salvarDetalhe() {
    if (!aberta) return;
    setSalvando(true);

    // Quem nao gerencia so pode tocar em status e arquivo — o trigger no banco
    // recusa o resto, entao nem enviamos.
    const payload = podeGerenciar
      ? {
          titulo: aberta.titulo.trim(),
          tipo: aberta.tipo,
          formato: aberta.formato,
          prazo: aberta.prazo || null,
          briefing: aberta.briefing,
          assigned_to: aberta.assigned_to,
          status: aberta.status,
          arquivo_url: aberta.arquivo_url?.trim() || null,
        }
      : { status: aberta.status, arquivo_url: aberta.arquivo_url?.trim() || null };

    const { error } = await supabase.from("creative_tasks").update(payload).eq("id", aberta.id);
    setSalvando(false);

    if (error) return toast.error(errorMessage(error, "Nao foi possivel salvar"));
    setDemandas((atual) => atual.map((d) => (d.id === aberta.id ? { ...d, ...payload } as Demanda : d)));
    toast.success("Demanda atualizada");
  }

  async function comentar() {
    if (!aberta || !novoComentario.trim() || !user) return;
    const { data, error } = await supabase
      .from("creative_task_comments")
      .insert({ task_id: aberta.id, autor_id: user.id, texto: novoComentario.trim() })
      .select("id, task_id, autor_id, texto, created_at")
      .single();

    if (error) return toast.error(errorMessage(error, "Nao foi possivel comentar"));
    setComentarios((atual) => [...atual, data as Comentario]);
    setNovoComentario("");
  }

  async function criar() {
    if (!form.client_id || !form.titulo.trim()) {
      toast.error("Escolha o cliente e dê um título à demanda");
      return;
    }
    setSalvando(true);

    const { data, error } = await supabase
      .from("creative_tasks")
      .insert({
        client_id: form.client_id,
        tipo: form.tipo,
        titulo: form.titulo.trim(),
        formato: form.formato || null,
        prazo: form.prazo || null,
        briefing: form.briefing.trim() || null,
        assigned_to: form.assigned_to === SEM_RESPONSAVEL ? null : form.assigned_to,
        created_by: user?.id ?? null,
      })
      .select("*")
      .single();

    setSalvando(false);
    if (error) return toast.error(errorMessage(error, "Nao foi possivel criar a demanda"));

    setDemandas((atual) => [...atual, data as Demanda]);
    setCriando(false);
    setForm({ client_id: "", tipo: "arte", titulo: "", formato: "", prazo: "", briefing: "", assigned_to: SEM_RESPONSAVEL });
    toast.success("Demanda criada");
  }

  async function excluir(demanda: Demanda) {
    const backup = demandas;
    setDemandas((atual) => atual.filter((d) => d.id !== demanda.id));
    setAberta(null);
    const { error } = await supabase.from("creative_tasks").delete().eq("id", demanda.id);
    if (error) {
      setDemandas(backup);
      toast.error(errorMessage(error, "Nao foi possivel excluir"));
    }
  }

  if (semTabela) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Database className="h-8 w-8 text-muted-foreground" />
          <h2 className="text-base font-semibold">Produção ainda não instalada no banco</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Rode a migration <code className="text-primary">20260813000000_creative_tasks.sql</code> no SQL Editor do
            Supabase e recarregue esta página.
          </p>
        </CardContent>
      </Card>
    );
  }

  const hoje = hojeISO();

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20">
            <Clapperboard className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Produção</h1>
            <p className="text-sm text-muted-foreground">
              Fila de vídeo e arte por cliente, do briefing até a publicação.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Atrasadas", valor: resumo.atrasadas, destaque: resumo.atrasadas > 0 },
              { label: "Para hoje", valor: resumo.hoje, destaque: false },
              { label: "Em revisão", valor: resumo.revisao, destaque: false },
              { label: "Abertas", valor: resumo.abertas, destaque: false },
            ].map(({ label, valor, destaque }) => (
              <div
                key={label}
                className={`rounded-2xl border px-4 py-3 text-center ${
                  destaque ? "border-destructive/40 bg-destructive/5" : "border-border/60 bg-card/60"
                }`}
              >
                <div className={`text-2xl font-semibold tabular-nums ${destaque ? "text-destructive" : ""}`}>
                  {valor}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>

          {podeGerenciar && (
            <Button onClick={() => setCriando(true)} className="shrink-0">
              <Plus className="mr-1.5 h-4 w-4" />
              Nova demanda
            </Button>
          )}
        </div>
      </div>

      {!podeGerenciar && !ehProducao && (
        <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/40 px-4 py-3 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Seu perfil ({role ?? "sem role"}) acompanha a fila, mas não move demandas.
        </div>
      )}

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título ou cliente..."
            className="pl-9"
          />
        </div>

        <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as typeof tipoFiltro)}>
          <SelectTrigger className="lg:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Vídeo e arte</SelectItem>
            <SelectItem value="video">Só vídeo</SelectItem>
            <SelectItem value="arte">Só arte</SelectItem>
          </SelectContent>
        </Select>

        <Select value={clienteFiltro} onValueChange={setClienteFiltro}>
          <SelectTrigger className="lg:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os clientes</SelectItem>
            {clientes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={soMinhas ? "default" : "outline"}
          onClick={() => setSoMinhas((v) => !v)}
          className="shrink-0"
        >
          Minhas demandas
        </Button>
      </div>

      {/* ── Quadro ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {STATUS.map((coluna) => {
            const itens = visiveis.filter((d) => d.status === coluna.id);
            return (
              <div key={coluna.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 px-3 py-2">
                  <span className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ring-1 ${coluna.cor}`}>
                    {coluna.label}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{itens.length}</span>
                </div>

                <div className="space-y-2">
                  {itens.map((demanda) => {
                    const cliente = clientePorId.get(demanda.client_id);
                    const responsavel = demanda.assigned_to ? pessoaPorId.get(demanda.assigned_to) : null;
                    const atrasada = demanda.prazo && demanda.prazo < hoje && demanda.status !== "publicada";

                    return (
                      <button
                        key={demanda.id}
                        type="button"
                        onClick={() => setAberta(demanda)}
                        className="w-full rounded-2xl border border-border/60 bg-card/60 p-3 text-left transition-colors hover:border-border hover:bg-card"
                      >
                        <div className="flex items-start gap-2">
                          {demanda.tipo === "video" ? (
                            <Clapperboard className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400" />
                          ) : (
                            <ImageIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
                          )}
                          <span className="flex-1 text-sm font-medium leading-snug">{demanda.titulo}</span>
                        </div>

                        {cliente && (
                          <div className="mt-2 flex items-center gap-2">
                            <ClientAvatar name={cliente.name} logoUrl={cliente.logo_url} className="h-5 w-5" />
                            <span className="truncate text-xs text-muted-foreground">{cliente.name}</span>
                          </div>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {demanda.formato && (
                            <Badge variant="outline" className="text-[10px]">
                              {demanda.formato}
                            </Badge>
                          )}
                          {demanda.prazo && (
                            <Badge
                              variant={atrasada ? "destructive" : "outline"}
                              className="gap-1 text-[10px]"
                            >
                              {atrasada ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
                              {format(parseISO(demanda.prazo), "dd MMM", { locale: ptBR })}
                            </Badge>
                          )}
                          {demanda.arquivo_url && (
                            <Badge variant="outline" className="gap-1 text-[10px]">
                              <ExternalLink className="h-3 w-3" />
                              arquivo
                            </Badge>
                          )}
                        </div>

                        <div className="mt-2 text-[11px] text-muted-foreground">
                          {responsavel ? responsavel.nome : "Sem responsável"}
                        </div>
                      </button>
                    );
                  })}

                  {itens.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-border/50 px-3 py-6 text-center text-[11px] text-muted-foreground">
                      vazio
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Detalhe ─────────────────────────────────────────────────────── */}
      <Dialog open={!!aberta} onOpenChange={(open) => !open && setAberta(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {aberta && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6">{aberta.titulo}</DialogTitle>
                <DialogDescription>
                  {clientePorId.get(aberta.client_id)?.name ?? "Cliente removido"} ·{" "}
                  {aberta.tipo === "video" ? "Vídeo" : "Arte"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {podeGerenciar && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label>Título</Label>
                      <Input
                        value={aberta.titulo}
                        onChange={(e) => setAberta({ ...aberta, titulo: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Formato</Label>
                      <Select
                        value={aberta.formato ?? ""}
                        onValueChange={(v) => setAberta({ ...aberta, formato: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Escolher" />
                        </SelectTrigger>
                        <SelectContent>
                          {(FORMATOS[aberta.tipo] ?? []).map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Prazo</Label>
                      <Input
                        type="date"
                        value={aberta.prazo ?? ""}
                        onChange={(e) => setAberta({ ...aberta, prazo: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Responsável</Label>
                      <Select
                        value={aberta.assigned_to ?? SEM_RESPONSAVEL}
                        onValueChange={(v) =>
                          setAberta({ ...aberta, assigned_to: v === SEM_RESPONSAVEL ? null : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SEM_RESPONSAVEL}>Sem responsável</SelectItem>
                          {pessoas.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome} · {p.role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div>
                  <Label>Briefing</Label>
                  {podeGerenciar ? (
                    <Textarea
                      value={aberta.briefing ?? ""}
                      onChange={(e) => setAberta({ ...aberta, briefing: e.target.value })}
                      rows={4}
                      placeholder="O que precisa ser produzido, referências, tom..."
                    />
                  ) : (
                    <p className="whitespace-pre-wrap rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-muted-foreground">
                      {aberta.briefing || "Sem briefing."}
                    </p>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Status</Label>
                    <Select
                      value={aberta.status}
                      onValueChange={(v) => mudarStatus(aberta, v)}
                      disabled={!podeMover(aberta)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Link do arquivo</Label>
                    <Input
                      value={aberta.arquivo_url ?? ""}
                      onChange={(e) => setAberta({ ...aberta, arquivo_url: e.target.value })}
                      disabled={!podeMover(aberta)}
                      placeholder="Drive, Frame.io, Dropbox..."
                    />
                  </div>
                </div>

                {aberta.arquivo_url && (
                  <a
                    href={aberta.arquivo_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir arquivo
                  </a>
                )}

                {/* ── Comentários ───────────────────────────────────── */}
                <div className="border-t border-border/60 pt-4">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Comentários ({comentarios.length})
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {comentarios.map((c) => (
                      <div key={c.id} className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {c.autor_id ? pessoaPorId.get(c.autor_id)?.nome ?? "Equipe" : "Equipe"}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60">
                            {format(parseISO(c.created_at), "dd/MM HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{c.texto}</p>
                      </div>
                    ))}
                    {comentarios.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>
                    )}
                  </div>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Textarea
                      value={novoComentario}
                      onChange={(e) => setNovoComentario(e.target.value)}
                      rows={2}
                      placeholder="Escrever um retorno de revisão..."
                      className="flex-1"
                    />
                    <Button onClick={comentar} disabled={!novoComentario.trim()} className="shrink-0 sm:self-end">
                      Comentar
                    </Button>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:justify-between">
                {podeGerenciar ? (
                  <Button variant="ghost" onClick={() => excluir(aberta)} className="text-destructive">
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Excluir
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setAberta(null)}>
                    Fechar
                  </Button>
                  <Button onClick={salvarDetalhe} disabled={salvando || !podeMover(aberta)}>
                    {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Salvar
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Nova demanda ────────────────────────────────────────────────── */}
      <Dialog open={criando} onOpenChange={setCriando}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova demanda</DialogTitle>
            <DialogDescription>Uma peça de vídeo ou arte para um cliente.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Cliente</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => setForm({ ...form, tipo: v as "video" | "arte", formato: "" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="arte">Arte</SelectItem>
                    <SelectItem value="video">Vídeo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Formato</Label>
                <Select value={form.formato} onValueChange={(v) => setForm({ ...form, formato: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolher" />
                  </SelectTrigger>
                  <SelectContent>
                    {(FORMATOS[form.tipo] ?? []).map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Título</Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ex.: Reel de oferta da semana"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Prazo</Label>
                <Input type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} />
              </div>
              <div>
                <Label>Responsável</Label>
                <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_RESPONSAVEL}>Sem responsável</SelectItem>
                    {pessoas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome} · {p.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Briefing</Label>
              <Textarea
                value={form.briefing}
                onChange={(e) => setForm({ ...form, briefing: e.target.value })}
                rows={4}
                placeholder="O que precisa ser produzido, referências, tom..."
              />
            </div>

            {pessoas.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum usuário com role <code>editor</code> ou <code>designer</code> ainda. Atribua os roles em
                Configurações para poder escolher responsável.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCriando(false)}>
              Cancelar
            </Button>
            <Button onClick={criar} disabled={salvando}>
              {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Criar demanda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
