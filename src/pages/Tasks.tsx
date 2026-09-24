import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  CalendarClock,
  Columns3,
  Database,
  ListTodo,
  Loader2,
  Lock,
  MessageCircle,
  Plus,
  Rows3,
  Search,
  Trash2,
  User as UserIcon,
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

interface Tarefa {
  id: string;
  titulo: string;
  descricao: string | null;
  client_id: string | null;
  status: string;
  prioridade: string;
  prazo: string | null;
  assigned_to: string | null;
  created_by: string | null;
  concluida_at: string | null;
  created_at: string;
}

interface Observacao {
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
  { id: "fazendo", label: "Em andamento", cor: "bg-blue-500/12 text-blue-300 ring-blue-500/20" },
  { id: "revisao", label: "Em revisão", cor: "bg-amber-500/12 text-amber-300 ring-amber-500/20" },
  { id: "concluida", label: "Concluída", cor: "bg-emerald-500/12 text-emerald-300 ring-emerald-500/20" },
] as const;

const PRIORIDADES = [
  { id: "baixa", label: "Baixa", cor: "text-slate-400 border-slate-500/30" },
  { id: "media", label: "Média", cor: "text-sky-400 border-sky-500/30" },
  { id: "alta", label: "Alta", cor: "text-amber-400 border-amber-500/30" },
  { id: "urgente", label: "Urgente", cor: "text-red-400 border-red-500/30" },
] as const;

const SEM_RESPONSAVEL = "sem-responsavel";
const SEM_CLIENTE = "sem-cliente";

function statusMeta(id: string) {
  return STATUS.find((s) => s.id === id) ?? STATUS[0];
}

function prioridadeMeta(id: string) {
  return PRIORIDADES.find((p) => p.id === id) ?? PRIORIDADES[1];
}

function hojeISO() {
  return format(new Date(), "yyyy-MM-dd");
}

export default function Tasks() {
  const { user, role } = useAuth();
  const podeGerenciar = role === "owner" || role === "admin";

  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [semTabela, setSemTabela] = useState(false);

  const [modo, setModo] = useState<"quadro" | "lista">("quadro");
  const [busca, setBusca] = useState("");
  const [clienteFiltro, setClienteFiltro] = useState("todos");
  const [responsavelFiltro, setResponsavelFiltro] = useState("todos");
  const [prioridadeFiltro, setPrioridadeFiltro] = useState("todas");
  const [soMinhas, setSoMinhas] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);

  const [aberta, setAberta] = useState<Tarefa | null>(null);
  const [observacoes, setObservacoes] = useState<Observacao[]>([]);
  const [novaObservacao, setNovaObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    client_id: SEM_CLIENTE,
    prioridade: "media",
    prazo: "",
    assigned_to: SEM_RESPONSAVEL,
  });

  useEffect(() => {
    carregar();
  }, []);

  const abertaId = aberta?.id;
  useEffect(() => {
    if (!abertaId) return;
    carregarObservacoes(abertaId);
  }, [abertaId]);

  async function carregar() {
    setLoading(true);

    const [tarefasRes, clientesRes, rolesRes, profilesRes] = await Promise.all([
      supabase.from("tasks").select("*").order("prazo", { ascending: true, nullsFirst: false }),
      supabase.from("clients").select("id, name, logo_url").neq("status", "archived").order("name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    // A migration pode nao ter rodado ainda neste ambiente.
    if (tarefasRes.error?.code === "42P01") {
      setSemTabela(true);
      setLoading(false);
      return;
    }

    if (tarefasRes.error) {
      toast.error(errorMessage(tarefasRes.error, "Nao foi possivel carregar as tarefas"));
    }

    const perfis = new Map(
      ((profilesRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => [
        p.id,
        p.full_name || p.email || p.id.slice(0, 8),
      ])
    );

    // Diferente da Producao, aqui qualquer pessoa da equipe pode receber tarefa,
    // entao a lista sai de profiles e o role e so um rotulo no seletor.
    const papeis = new Map(((rolesRes.data ?? []) as { user_id: string; role: string }[]).map((r) => [r.user_id, r.role]));
    const time = [...perfis.entries()]
      .map(([id, nome]) => ({ id, nome, role: papeis.get(id) ?? "viewer" }))
      .sort((a, b) => a.nome.localeCompare(b.nome));

    setTarefas((tarefasRes.data as Tarefa[]) ?? []);
    setClientes((clientesRes.data as ClienteResumo[]) ?? []);
    setPessoas(time);
    setLoading(false);
  }

  async function carregarObservacoes(taskId: string) {
    const { data, error } = await supabase
      .from("task_comments")
      .select("id, task_id, autor_id, texto, created_at")
      .eq("task_id", taskId)
      .order("created_at");
    if (error) return toast.error(errorMessage(error, "Nao foi possivel carregar as observacoes"));
    setObservacoes((data as Observacao[]) ?? []);
  }

  const clientePorId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const pessoaPorId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return tarefas.filter((t) => {
      if (clienteFiltro === SEM_CLIENTE && t.client_id !== null) return false;
      if (clienteFiltro !== SEM_CLIENTE && clienteFiltro !== "todos" && t.client_id !== clienteFiltro) return false;

      if (responsavelFiltro === SEM_RESPONSAVEL && t.assigned_to !== null) return false;
      if (responsavelFiltro !== SEM_RESPONSAVEL && responsavelFiltro !== "todos" && t.assigned_to !== responsavelFiltro)
        return false;

      if (prioridadeFiltro !== "todas" && t.prioridade !== prioridadeFiltro) return false;
      if (soMinhas && t.assigned_to !== user?.id) return false;
      if (!termo) return true;
      const cliente = t.client_id ? clientePorId.get(t.client_id)?.name ?? "" : "";
      return t.titulo.toLowerCase().includes(termo) || cliente.toLowerCase().includes(termo);
    });
  }, [tarefas, clienteFiltro, responsavelFiltro, prioridadeFiltro, soMinhas, busca, clientePorId, user?.id]);

  const resumo = useMemo(() => {
    const hoje = hojeISO();
    const abertas = visiveis.filter((t) => t.status !== "concluida");
    return {
      atrasadas: abertas.filter((t) => t.prazo && t.prazo < hoje).length,
      hoje: abertas.filter((t) => t.prazo === hoje).length,
      minhas: abertas.filter((t) => t.assigned_to === user?.id).length,
      abertas: abertas.length,
    };
  }, [visiveis, user?.id]);

  function podeMover(tarefa: Tarefa) {
    return podeGerenciar || tarefa.assigned_to === user?.id;
  }

  async function mudarStatus(tarefa: Tarefa, status: string) {
    if (status === tarefa.status) return;
    if (!podeMover(tarefa)) return toast.error("Esta tarefa nao esta atribuida a voce");

    const anterior = tarefa.status;
    setTarefas((atual) => atual.map((t) => (t.id === tarefa.id ? { ...t, status } : t)));
    setAberta((atual) => (atual && atual.id === tarefa.id ? { ...atual, status } : atual));

    const { error } = await supabase.from("tasks").update({ status }).eq("id", tarefa.id);
    if (error) {
      setTarefas((atual) => atual.map((t) => (t.id === tarefa.id ? { ...t, status: anterior } : t)));
      setAberta((atual) => (atual && atual.id === tarefa.id ? { ...atual, status: anterior } : atual));
      toast.error(errorMessage(error, "Nao foi possivel mudar o status"));
    }
  }

  async function salvarDetalhe() {
    if (!aberta) return;
    if (!aberta.titulo.trim()) return toast.error("A tarefa precisa de um titulo");
    setSalvando(true);

    // Quem nao gerencia so pode tocar no status — o trigger no banco recusa o
    // resto, entao nem enviamos o payload completo.
    const payload = podeGerenciar
      ? {
          titulo: aberta.titulo.trim(),
          descricao: aberta.descricao,
          client_id: aberta.client_id,
          prioridade: aberta.prioridade,
          prazo: aberta.prazo || null,
          assigned_to: aberta.assigned_to,
          status: aberta.status,
        }
      : { status: aberta.status };

    const { error } = await supabase.from("tasks").update(payload).eq("id", aberta.id);
    setSalvando(false);

    if (error) return toast.error(errorMessage(error, "Nao foi possivel salvar"));

    setTarefas((atual) => atual.map((t) => (t.id === aberta.id ? { ...t, ...payload } : t)));
    toast.success("Tarefa atualizada");
    setAberta(null);
  }

  async function observar() {
    if (!aberta || !novaObservacao.trim() || !user) return;

    const texto = novaObservacao.trim();
    setNovaObservacao("");

    const { data, error } = await supabase
      .from("task_comments")
      .insert({ task_id: aberta.id, autor_id: user.id, texto })
      .select("id, task_id, autor_id, texto, created_at")
      .single();

    if (error) {
      setNovaObservacao(texto);
      return toast.error(errorMessage(error, "Nao foi possivel salvar a observacao"));
    }

    setObservacoes((atual) => [...atual, data as Observacao]);
  }

  async function criar() {
    if (!form.titulo.trim()) return toast.error("A tarefa precisa de um titulo");
    setSalvando(true);

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || null,
        client_id: form.client_id === SEM_CLIENTE ? null : form.client_id,
        prioridade: form.prioridade,
        prazo: form.prazo || null,
        assigned_to: form.assigned_to === SEM_RESPONSAVEL ? null : form.assigned_to,
        created_by: user?.id ?? null,
      })
      .select("*")
      .single();

    setSalvando(false);
    if (error) return toast.error(errorMessage(error, "Nao foi possivel criar a tarefa"));

    setTarefas((atual) => [...atual, data as Tarefa]);
    setCriando(false);
    setForm({
      titulo: "",
      descricao: "",
      client_id: SEM_CLIENTE,
      prioridade: "media",
      prazo: "",
      assigned_to: SEM_RESPONSAVEL,
    });
    toast.success("Tarefa criada");
  }

  async function excluir(tarefa: Tarefa) {
    const backup = tarefas;
    setTarefas((atual) => atual.filter((t) => t.id !== tarefa.id));
    setAberta(null);

    const { error } = await supabase.from("tasks").delete().eq("id", tarefa.id);
    if (error) {
      setTarefas(backup);
      toast.error(errorMessage(error, "Nao foi possivel excluir"));
    }
  }

  if (semTabela) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Database className="h-8 w-8 text-muted-foreground" />
          <h2 className="text-base font-semibold">Tarefas ainda não instaladas no banco</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Rode a migration <code className="text-primary">20260916000000_tasks.sql</code> no SQL Editor do Supabase e
            recarregue esta página.
          </p>
        </CardContent>
      </Card>
    );
  }

  const hoje = hojeISO();

  function cartao(tarefa: Tarefa) {
    const cliente = tarefa.client_id ? clientePorId.get(tarefa.client_id) : null;
    const responsavel = tarefa.assigned_to ? pessoaPorId.get(tarefa.assigned_to) : null;
    const atrasada = tarefa.prazo && tarefa.prazo < hoje && tarefa.status !== "concluida";
    const prio = prioridadeMeta(tarefa.prioridade);

    return (
      <button
        key={tarefa.id}
        type="button"
        draggable={podeMover(tarefa)}
        onDragStart={() => setArrastando(tarefa.id)}
        onDragEnd={() => setArrastando(null)}
        onClick={() => setAberta(tarefa)}
        className={`w-full rounded-2xl border border-border/60 bg-card/60 p-3 text-left transition-colors hover:border-border hover:bg-card ${
          arrastando === tarefa.id ? "opacity-40" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex-1 text-sm font-medium leading-snug">{tarefa.titulo}</span>
          <Badge variant="outline" className={`shrink-0 text-[10px] ${prio.cor}`}>
            {prio.label}
          </Badge>
        </div>

        {cliente && (
          <div className="mt-2 flex items-center gap-2">
            <ClientAvatar name={cliente.name} logoUrl={cliente.logo_url} className="h-5 w-5" />
            <span className="truncate text-xs text-muted-foreground">{cliente.name}</span>
          </div>
        )}

        {tarefa.prazo && (
          <div className="mt-2">
            <Badge variant={atrasada ? "destructive" : "outline"} className="gap-1 text-[10px]">
              {atrasada ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
              {format(parseISO(tarefa.prazo), "dd MMM", { locale: ptBR })}
            </Badge>
          </div>
        )}

        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <UserIcon className="h-3 w-3" />
          {responsavel ? responsavel.nome : "Sem responsável"}
        </div>
      </button>
    );
  }

  function soltarNaColuna(status: string) {
    if (!arrastando) return;
    const tarefa = tarefas.find((t) => t.id === arrastando);
    setArrastando(null);
    if (tarefa) mudarStatus(tarefa, status);
  }

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <ListTodo className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tarefas</h1>
            <p className="text-sm text-muted-foreground">
              O que cada pessoa da equipe está tocando, com observações em cada tarefa.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Atrasadas", valor: resumo.atrasadas, destaque: resumo.atrasadas > 0 },
              { label: "Para hoje", valor: resumo.hoje, destaque: false },
              { label: "Minhas", valor: resumo.minhas, destaque: false },
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
              Nova tarefa
            </Button>
          )}
        </div>
      </div>

      {!podeGerenciar && (
        <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/40 px-4 py-3 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Seu perfil ({role ?? "sem role"}) move o status das tarefas atribuídas a você e comenta em qualquer uma. Criar
          e distribuir tarefas é de owner/admin.
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

        <Select value={responsavelFiltro} onValueChange={setResponsavelFiltro}>
          <SelectTrigger className="lg:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os responsáveis</SelectItem>
            <SelectItem value={SEM_RESPONSAVEL}>Sem responsável</SelectItem>
            {pessoas.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={clienteFiltro} onValueChange={setClienteFiltro}>
          <SelectTrigger className="lg:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os clientes</SelectItem>
            <SelectItem value={SEM_CLIENTE}>Sem cliente</SelectItem>
            {clientes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={prioridadeFiltro} onValueChange={setPrioridadeFiltro}>
          <SelectTrigger className="lg:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Toda prioridade</SelectItem>
            {PRIORIDADES.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant={soMinhas ? "default" : "outline"} onClick={() => setSoMinhas((v) => !v)} className="shrink-0">
          Minhas tarefas
        </Button>

        <div className="flex shrink-0 rounded-xl border border-border/60 p-0.5">
          <Button
            variant={modo === "quadro" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setModo("quadro")}
            className="gap-1.5"
          >
            <Columns3 className="h-4 w-4" />
            Quadro
          </Button>
          <Button
            variant={modo === "lista" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setModo("lista")}
            className="gap-1.5"
          >
            <Rows3 className="h-4 w-4" />
            Lista
          </Button>
        </div>
      </div>

      {/* ── Quadro / Lista ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : modo === "quadro" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STATUS.map((coluna) => {
            const itens = visiveis.filter((t) => t.status === coluna.id);
            return (
              <div
                key={coluna.id}
                className="flex flex-col gap-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => soltarNaColuna(coluna.id)}
              >
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 px-3 py-2">
                  <span className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ring-1 ${coluna.cor}`}>
                    {coluna.label}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{itens.length}</span>
                </div>

                <div className="space-y-2">
                  {itens.map(cartao)}
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
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/60">
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 border-b border-border/60 bg-card/40 px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground lg:grid">
            <span>Tarefa</span>
            <span>Cliente</span>
            <span>Responsável</span>
            <span>Prazo</span>
            <span>Status</span>
          </div>

          {visiveis.map((tarefa) => {
            const cliente = tarefa.client_id ? clientePorId.get(tarefa.client_id) : null;
            const responsavel = tarefa.assigned_to ? pessoaPorId.get(tarefa.assigned_to) : null;
            const atrasada = tarefa.prazo && tarefa.prazo < hoje && tarefa.status !== "concluida";
            const prio = prioridadeMeta(tarefa.prioridade);
            const st = statusMeta(tarefa.status);

            return (
              <button
                key={tarefa.id}
                type="button"
                onClick={() => setAberta(tarefa)}
                className="grid w-full grid-cols-1 gap-2 border-b border-border/40 px-4 py-3 text-left transition-colors last:border-0 hover:bg-card/60 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] lg:items-center lg:gap-3"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`shrink-0 text-[10px] ${prio.cor}`}>
                    {prio.label}
                  </Badge>
                  <span className="truncate text-sm font-medium">{tarefa.titulo}</span>
                </div>

                <span className="truncate text-xs text-muted-foreground">{cliente?.name ?? "—"}</span>
                <span className="truncate text-xs text-muted-foreground">{responsavel?.nome ?? "Sem responsável"}</span>

                <span className={`text-xs ${atrasada ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                  {tarefa.prazo ? format(parseISO(tarefa.prazo), "dd MMM yyyy", { locale: ptBR }) : "—"}
                </span>

                <span>
                  <span className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ring-1 ${st.cor}`}>{st.label}</span>
                </span>
              </button>
            );
          })}

          {visiveis.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma tarefa com esses filtros.</div>
          )}
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
                  {(aberta.client_id ? clientePorId.get(aberta.client_id)?.name : null) ?? "Sem cliente"} ·{" "}
                  {prioridadeMeta(aberta.prioridade).label}
                  {aberta.concluida_at &&
                    ` · concluída em ${format(parseISO(aberta.concluida_at), "dd/MM/yyyy", { locale: ptBR })}`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {podeGerenciar && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label>Título</Label>
                      <Input value={aberta.titulo} onChange={(e) => setAberta({ ...aberta, titulo: e.target.value })} />
                    </div>
                    <div>
                      <Label>Cliente</Label>
                      <Select
                        value={aberta.client_id ?? SEM_CLIENTE}
                        onValueChange={(v) => setAberta({ ...aberta, client_id: v === SEM_CLIENTE ? null : v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SEM_CLIENTE}>Sem cliente</SelectItem>
                          {clientes.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Prioridade</Label>
                      <Select
                        value={aberta.prioridade}
                        onValueChange={(v) => setAberta({ ...aberta, prioridade: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORIDADES.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.label}
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
                    <div>
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
                  <Label>Descrição</Label>
                  {podeGerenciar ? (
                    <Textarea
                      value={aberta.descricao ?? ""}
                      onChange={(e) => setAberta({ ...aberta, descricao: e.target.value })}
                      rows={4}
                      placeholder="O que precisa ser feito, contexto, links..."
                    />
                  ) : (
                    <p className="whitespace-pre-wrap rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-muted-foreground">
                      {aberta.descricao || "Sem descrição."}
                    </p>
                  )}
                </div>

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
                  {!podeMover(aberta) && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Só o responsável ou um gestor muda o status desta tarefa.
                    </p>
                  )}
                </div>

                {/* ── Observações ───────────────────────────────────── */}
                <div className="border-t border-border/60 pt-4">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Observações ({observacoes.length})
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {observacoes.map((o) => (
                      <div key={o.id} className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {o.autor_id ? pessoaPorId.get(o.autor_id)?.nome ?? "Equipe" : "Equipe"}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60">
                            {format(parseISO(o.created_at), "dd/MM HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{o.texto}</p>
                      </div>
                    ))}
                    {observacoes.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhuma observação ainda.</p>
                    )}
                  </div>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Textarea
                      value={novaObservacao}
                      onChange={(e) => setNovaObservacao(e.target.value)}
                      rows={2}
                      placeholder="Deixar uma observação para quem está na tarefa..."
                      className="flex-1"
                    />
                    <Button onClick={observar} disabled={!novaObservacao.trim()} className="shrink-0 sm:self-end">
                      Enviar
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

      {/* ── Nova tarefa ─────────────────────────────────────────────────── */}
      <Dialog open={criando} onOpenChange={setCriando}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
            <DialogDescription>Atribua para alguém da equipe. O responsável recebe aviso no sino.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Título</Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ex.: Revisar verba de setembro do cliente X"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
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
              <div>
                <Label>Cliente</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_CLIENTE}>Sem cliente</SelectItem>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Prioridade</Label>
                <Select value={form.prioridade} onValueChange={(v) => setForm({ ...form, prioridade: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORIDADES.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prazo</Label>
                <Input type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} />
              </div>
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                rows={4}
                placeholder="O que precisa ser feito, contexto, links..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCriando(false)}>
              Cancelar
            </Button>
            <Button onClick={criar} disabled={salvando}>
              {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Criar tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
