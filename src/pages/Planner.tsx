import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Database,
  KeyRound,
  ListChecks,
  Plus,
  Rocket,
  Search,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Cliente {
  id: string;
  name: string;
  logo_url: string | null;
  status: string;
  created_at: string;
}

interface Tarefa {
  id: string;
  client_id: string;
  fase: string;
  titulo: string;
  done: boolean;
  done_at: string | null;
  posicao: number;
}

const FASES = [
  { id: "acessos", label: "Acessos", icon: KeyRound },
  { id: "rastreamento", label: "Rastreamento", icon: Target },
  { id: "estrategia", label: "Estratégia", icon: ListChecks },
  { id: "operacao", label: "Operação", icon: Rocket },
  { id: "geral", label: "Geral", icon: ClipboardList },
] as const;

function faseMeta(id: string) {
  return FASES.find((f) => f.id === id) ?? FASES[FASES.length - 1];
}

export default function Planner() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [semTabela, setSemTabela] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"onboarding" | "todos" | "prontos">("onboarding");
  const [aberto, setAberto] = useState<Set<string>>(new Set());
  const [novoTitulo, setNovoTitulo] = useState<Record<string, string>>({});
  const [novaFase, setNovaFase] = useState<Record<string, string>>({});

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);

    const [clientesRes, tarefasRes] = await Promise.all([
      supabase.from("clients").select("id, name, logo_url, status, created_at").order("created_at", { ascending: false }),
      supabase.from("client_tasks").select("id, client_id, fase, titulo, done, done_at, posicao").order("posicao"),
    ]);

    // A migration do planner pode nao ter rodado ainda neste ambiente.
    if (tarefasRes.error?.code === "42P01") {
      setSemTabela(true);
      setLoading(false);
      return;
    }

    setClientes((clientesRes.data as Cliente[]) ?? []);
    setTarefas((tarefasRes.data as Tarefa[]) ?? []);
    setLoading(false);
  }

  const porCliente = useMemo(() => {
    const mapa = new Map<string, Tarefa[]>();
    for (const t of tarefas) {
      const lista = mapa.get(t.client_id) ?? [];
      lista.push(t);
      mapa.set(t.client_id, lista);
    }
    return mapa;
  }, [tarefas]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return clientes
      .filter((c) => (termo ? c.name.toLowerCase().includes(termo) : true))
      .filter((c) => {
        const lista = porCliente.get(c.id) ?? [];
        const pendentes = lista.filter((t) => !t.done).length;
        if (filtro === "onboarding") return lista.length === 0 || pendentes > 0;
        if (filtro === "prontos") return lista.length > 0 && pendentes === 0;
        return true;
      })
      .sort((a, b) => {
        const pa = (porCliente.get(a.id) ?? []).filter((t) => !t.done).length;
        const pb = (porCliente.get(b.id) ?? []).filter((t) => !t.done).length;
        return pb - pa;
      });
  }, [clientes, porCliente, busca, filtro]);

  const resumo = useMemo(() => {
    const emOnboarding = clientes.filter((c) => {
      const lista = porCliente.get(c.id) ?? [];
      return lista.length > 0 && lista.some((t) => !t.done);
    }).length;
    return {
      emOnboarding,
      pendentes: tarefas.filter((t) => !t.done).length,
      concluidas: tarefas.filter((t) => t.done).length,
    };
  }, [clientes, porCliente, tarefas]);

  async function alternar(tarefa: Tarefa) {
    const novo = !tarefa.done;
    setTarefas((atual) => atual.map((t) => (t.id === tarefa.id ? { ...t, done: novo } : t)));

    const { error } = await supabase.from("client_tasks").update({ done: novo }).eq("id", tarefa.id);
    if (error) {
      setTarefas((atual) => atual.map((t) => (t.id === tarefa.id ? { ...t, done: tarefa.done } : t)));
      toast.error(error.message);
    }
  }

  async function gerarChecklist(clienteId: string) {
    const { error } = await supabase.rpc("seed_client_tasks", { _client_id: clienteId });
    if (error) return toast.error(error.message);
    toast.success("Checklist padrão aplicado");
    carregar();
  }

  async function adicionar(clienteId: string) {
    const titulo = (novoTitulo[clienteId] ?? "").trim();
    if (!titulo) return;
    const fase = novaFase[clienteId] ?? "geral";
    const lista = porCliente.get(clienteId) ?? [];
    const posicao = Math.max(0, ...lista.map((t) => t.posicao)) + 10;

    const { data, error } = await supabase
      .from("client_tasks")
      .insert({ client_id: clienteId, titulo, fase, posicao })
      .select("id, client_id, fase, titulo, done, done_at, posicao")
      .single();

    if (error) return toast.error(error.message);
    setTarefas((atual) => [...atual, data as Tarefa]);
    setNovoTitulo((atual) => ({ ...atual, [clienteId]: "" }));
  }

  async function remover(tarefa: Tarefa) {
    const backup = tarefas;
    setTarefas((atual) => atual.filter((t) => t.id !== tarefa.id));
    const { error } = await supabase.from("client_tasks").delete().eq("id", tarefa.id);
    if (error) {
      setTarefas(backup);
      toast.error(error.message);
    }
  }

  function alternarAberto(id: string) {
    setAberto((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  if (semTabela) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Database className="h-8 w-8 text-muted-foreground" />
          <h2 className="text-base font-semibold">Planner ainda não instalado no banco</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Rode a migration <code className="text-primary">20260812000006_client_tasks.sql</code> no SQL Editor do
            Supabase e recarregue esta página.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Planner</h1>
            <p className="text-sm text-muted-foreground">
              O que precisa acontecer quando um cliente novo entra na carteira.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Em onboarding", valor: resumo.emOnboarding },
            { label: "Pendentes", valor: resumo.pendentes },
            { label: "Concluídas", valor: resumo.concluidas },
          ].map(({ label, valor }) => (
            <div key={label} className="rounded-2xl border border-border/60 bg-card/60 px-4 py-3 text-center">
              <div className="text-2xl font-semibold tabular-nums">{valor}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente..."
            className="pl-9"
          />
        </div>
        <Select value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
          <SelectTrigger className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="onboarding">Com pendências</SelectItem>
            <SelectItem value="prontos">Onboarding concluído</SelectItem>
            <SelectItem value="todos">Todos os clientes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Lista ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            <p className="text-sm font-medium">Nada pendente por aqui</p>
            <p className="text-xs text-muted-foreground">
              {filtro === "onboarding" ? "Todo cliente com checklist está em dia." : "Nenhum cliente neste filtro."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visiveis.map((cliente) => {
            const lista = porCliente.get(cliente.id) ?? [];
            const feitas = lista.filter((t) => t.done).length;
            const pct = lista.length ? Math.round((feitas / lista.length) * 100) : 0;
            const expandido = aberto.has(cliente.id);

            return (
              <Card key={cliente.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => alternarAberto(cliente.id)}
                  className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-white/[0.02]"
                >
                  {cliente.logo_url ? (
                    <img src={cliente.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                      {cliente.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold">{cliente.name}</h3>
                      {lista.length > 0 && pct === 100 && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      )}
                    </div>
                    {lista.length > 0 ? (
                      <div className="mt-2 flex items-center gap-3">
                        <Progress value={pct} className="h-1.5 max-w-xs" />
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {feitas}/{lista.length}
                        </span>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Sem checklist ainda</p>
                    )}
                  </div>

                  {lista.length === 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        gerarChecklist(cliente.id);
                      }}
                    >
                      Gerar checklist
                    </Button>
                  ) : (
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expandido ? "rotate-180" : ""}`}
                    />
                  )}
                </button>

                {expandido && lista.length > 0 && (
                  <div className="border-t border-border/60 bg-background/40 p-5">
                    <div className="space-y-5">
                      {FASES.filter((f) => lista.some((t) => t.fase === f.id)).map((fase) => {
                        const itens = lista.filter((t) => t.fase === fase.id);
                        const Icone = fase.icon;
                        return (
                          <div key={fase.id}>
                            <div className="flex items-center gap-2">
                              <Icone className="h-3.5 w-3.5 text-emerald-400" />
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {fase.label}
                              </span>
                              <span className="text-[11px] tabular-nums text-muted-foreground/60">
                                {itens.filter((t) => t.done).length}/{itens.length}
                              </span>
                            </div>

                            <div className="mt-2 space-y-1">
                              {itens.map((tarefa) => (
                                <div
                                  key={tarefa.id}
                                  className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.03]"
                                >
                                  <Checkbox
                                    checked={tarefa.done}
                                    onCheckedChange={() => alternar(tarefa)}
                                    className="shrink-0"
                                  />
                                  <span
                                    className={`flex-1 text-sm ${
                                      tarefa.done ? "text-muted-foreground line-through" : "text-foreground"
                                    }`}
                                  >
                                    {tarefa.titulo}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => remover(tarefa)}
                                    className="shrink-0 text-muted-foreground/0 transition-colors hover:text-destructive group-hover:text-muted-foreground/60"
                                    title="Remover item"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Item avulso: cada cliente tem uma exigencia que o padrao nao cobre */}
                    <div className="mt-5 flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row">
                      <Input
                        value={novoTitulo[cliente.id] ?? ""}
                        onChange={(e) => setNovoTitulo((a) => ({ ...a, [cliente.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && adicionar(cliente.id)}
                        placeholder="Adicionar item para este cliente..."
                        className="flex-1"
                      />
                      <Select
                        value={novaFase[cliente.id] ?? "geral"}
                        onValueChange={(v) => setNovaFase((a) => ({ ...a, [cliente.id]: v }))}
                      >
                        <SelectTrigger className="sm:w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FASES.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={() => adicionar(cliente.id)} className="shrink-0">
                        <Plus className="mr-1.5 h-4 w-4" />
                        Adicionar
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
