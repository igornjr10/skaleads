import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CalendarClock, Columns3, Inbox, ListChecks, Plus, Rows3, Search, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientAvatar } from "@/components/ClientAvatar";
import { DemandaDetalhe } from "@/components/demandas/DemandaDetalhe";
import { NovaDemandaDialog } from "@/components/demandas/NovaDemandaDialog";
import { useAuth } from "@/hooks/useAuth";
import { useDemandas } from "@/hooks/useDemandas";
import { errorMessage } from "@/lib/utils";
import { veTodosOsClientes } from "@/lib/permissoes";
import {
  CATEGORIAS, PRIORIDADES, STATUS_DEMANDA, type Demanda,
  categoriaLabel, estaAberta, estaAtrasada, hojeISO, paraDemanda, prioridadeMeta, progressoChecklist, statusMeta,
} from "@/lib/demandas";

type Escopo = "comigo" | "pedidas" | "todas";

const TODOS = "todos";
const SEM = "sem";

export default function Demandas() {
  const { user, role } = useAuth();
  const isAdmin = veTodosOsClientes(role);
  const {
    demandas, setDemandas, substituir, remover,
    clientesDaCarteira, clientePorId, pessoas, pessoaPorId, loading,
  } = useDemandas();

  const [escopo, setEscopo] = useState<Escopo>(isAdmin ? "todas" : "comigo");
  const [modo, setModo] = useState<"quadro" | "lista">("quadro");
  const [busca, setBusca] = useState("");
  const [responsavel, setResponsavel] = useState(TODOS);
  const [cliente, setCliente] = useState(TODOS);
  const [categoria, setCategoria] = useState(TODOS);
  const [prioridade, setPrioridade] = useState(TODOS);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [aberta, setAberta] = useState<Demanda | null>(null);
  const [criando, setCriando] = useState(false);

  const hoje = hojeISO();

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return demandas.filter(d => {
      if (escopo === "comigo" && d.assigned_to !== user?.id) return false;
      if (escopo === "pedidas" && d.created_by !== user?.id) return false;
      if (responsavel === SEM && d.assigned_to) return false;
      if (responsavel !== TODOS && responsavel !== SEM && d.assigned_to !== responsavel) return false;
      if (cliente === SEM && d.client_id) return false;
      if (cliente !== TODOS && cliente !== SEM && d.client_id !== cliente) return false;
      if (categoria !== TODOS && d.categoria !== categoria) return false;
      if (prioridade !== TODOS && d.prioridade !== prioridade) return false;
      if (!termo) return true;
      const nomeCliente = d.client_id ? clientePorId.get(d.client_id)?.name ?? "" : "";
      return d.titulo.toLowerCase().includes(termo) || nomeCliente.toLowerCase().includes(termo);
    });
  }, [demandas, escopo, responsavel, cliente, categoria, prioridade, busca, clientePorId, user?.id]);

  const resumo = useMemo(() => {
    const abertas = demandas.filter(estaAberta);
    return {
      atrasadas: abertas.filter(d => (isAdmin || d.assigned_to === user?.id) && estaAtrasada(d, hoje)).length,
      hoje: abertas.filter(d => d.assigned_to === user?.id && d.prazo === hoje).length,
      revisar: demandas.filter(d => d.status === "revisao" && (d.created_by === user?.id || isAdmin)).length,
      comigo: abertas.filter(d => d.assigned_to === user?.id).length,
    };
  }, [demandas, hoje, isAdmin, user?.id]);

  function podeMover(d: Demanda) {
    return isAdmin || d.created_by === user?.id || d.assigned_to === user?.id;
  }

  async function mudarStatus(d: Demanda, status: string) {
    if (status === d.status) return;
    if (!podeMover(d)) return toast.error("Esta demanda não está com você");
    const anterior = d;
    substituir({ ...d, status });
    const { data, error } = await supabase.from("tasks").update({ status }).eq("id", d.id).select("*").single();
    if (error) {
      substituir(anterior);
      return toast.error(errorMessage(error, "Não foi possível mudar o status"));
    }
    substituir(paraDemanda(data));
  }

  function soltar(status: string) {
    const d = demandas.find(x => x.id === arrastando);
    setArrastando(null);
    if (d) mudarStatus(d, status);
  }

  function cartao(d: Demanda) {
    const c = d.client_id ? clientePorId.get(d.client_id) : null;
    const resp = d.assigned_to ? pessoaPorId.get(d.assigned_to) : null;
    const atrasada = estaAtrasada(d, hoje);
    const prio = prioridadeMeta(d.prioridade);
    const check = progressoChecklist(d.checklist);
    return (
      <button
        key={d.id}
        type="button"
        draggable={podeMover(d)}
        onDragStart={() => setArrastando(d.id)}
        onDragEnd={() => setArrastando(null)}
        onClick={() => setAberta(d)}
        className={`w-full rounded-2xl border border-border/60 bg-card/60 p-3 text-left transition-colors hover:border-border hover:bg-card ${arrastando === d.id ? "opacity-40" : ""}`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex-1 text-sm font-medium leading-snug">{d.titulo}</span>
          <Badge variant="outline" className={`shrink-0 text-[10px] ${prio.cor}`}>{prio.label}</Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px] font-normal">{categoriaLabel(d.categoria)}</Badge>
          {d.prazo && (
            <Badge variant={atrasada ? "destructive" : "outline"} className="gap-1 text-[10px]">
              {atrasada ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
              {format(parseISO(d.prazo), "dd MMM", { locale: ptBR })}
            </Badge>
          )}
          {check.total > 0 && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <ListChecks className="h-3 w-3" /> {check.feitos}/{check.total}
            </Badge>
          )}
        </div>
        {c && (
          <div className="mt-2 flex items-center gap-2">
            <ClientAvatar name={c.name} logoUrl={c.logo_url} className="h-5 w-5" />
            <span className="truncate text-xs text-muted-foreground">{c.name}</span>
          </div>
        )}
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <UserIcon className="h-3 w-3" /> {resp?.nome ?? "Sem responsável"}
        </div>
      </button>
    );
  }

  const opcoesEscopo: { id: Escopo; label: string }[] = [
    { id: "comigo", label: "Comigo" },
    { id: "pedidas", label: "Pedidas por mim" },
    { id: "todas", label: isAdmin ? "Toda a equipe" : "Todas" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Inbox className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Demandas</h1>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? "Tudo o que a equipe está tocando, por status." : "O que está com você e o que você pediu."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Atrasadas", valor: resumo.atrasadas, alerta: resumo.atrasadas > 0 },
              { label: "Para hoje", valor: resumo.hoje, alerta: false },
              { label: "Para revisar", valor: resumo.revisar, alerta: false },
              { label: "Comigo", valor: resumo.comigo, alerta: false },
            ].map(({ label, valor, alerta }) => (
              <div key={label} className={`rounded-2xl border px-4 py-3 text-center ${alerta ? "border-destructive/40 bg-destructive/5" : "border-border/60 bg-card/60"}`}>
                <div className={`text-2xl font-semibold tabular-nums ${alerta ? "text-destructive" : ""}`}>{valor}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          <Button onClick={() => setCriando(true)} className="shrink-0">
            <Plus className="mr-1.5 h-4 w-4" /> Nova demanda
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
        <div className="flex shrink-0 rounded-xl border border-border/60 p-0.5">
          {opcoesEscopo.map(o => (
            <Button key={o.id} variant={escopo === o.id ? "secondary" : "ghost"} size="sm" onClick={() => setEscopo(o.id)}>
              {o.label}
            </Button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por título ou cliente..." className="pl-9" />
        </div>
        {isAdmin && (
          <Select value={responsavel} onValueChange={setResponsavel}>
            <SelectTrigger className="lg:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os responsáveis</SelectItem>
              <SelectItem value={SEM}>Sem responsável</SelectItem>
              {pessoas.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={cliente} onValueChange={setCliente}>
          <SelectTrigger className="lg:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os clientes</SelectItem>
            <SelectItem value={SEM}>Sem cliente</SelectItem>
            {[...clientePorId.values()].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="lg:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Toda categoria</SelectItem>
            {CATEGORIAS.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={prioridade} onValueChange={setPrioridade}>
          <SelectTrigger className="lg:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Toda prioridade</SelectItem>
            {PRIORIDADES.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex shrink-0 rounded-xl border border-border/60 p-0.5">
          <Button variant={modo === "quadro" ? "secondary" : "ghost"} size="sm" onClick={() => setModo("quadro")} className="gap-1.5">
            <Columns3 className="h-4 w-4" /> Quadro
          </Button>
          <Button variant={modo === "lista" ? "secondary" : "ghost"} size="sm" onClick={() => setModo("lista")} className="gap-1.5">
            <Rows3 className="h-4 w-4" /> Lista
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : modo === "quadro" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {STATUS_DEMANDA.map(coluna => {
            const itens = visiveis.filter(d => d.status === coluna.id);
            return (
              <div key={coluna.id} className="flex flex-col gap-2" onDragOver={e => e.preventDefault()} onDrop={() => soltar(coluna.id)}>
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 px-3 py-2">
                  <span className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ring-1 ${coluna.cor}`}>{coluna.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{itens.length}</span>
                </div>
                <div className="space-y-2">
                  {itens.map(cartao)}
                  {itens.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-border/50 px-3 py-6 text-center text-[11px] text-muted-foreground">vazio</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/60">
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-3 border-b border-border/60 bg-card/40 px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground lg:grid">
            <span>Demanda</span><span>Categoria</span><span>Cliente</span><span>Responsável</span><span>Prazo</span><span>Status</span>
          </div>
          {visiveis.map(d => {
            const st = statusMeta(d.status);
            const atrasada = estaAtrasada(d, hoje);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setAberta(d)}
                className="grid w-full grid-cols-1 gap-2 border-b border-border/40 px-4 py-3 text-left transition-colors last:border-0 hover:bg-card/60 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] lg:items-center lg:gap-3"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`shrink-0 text-[10px] ${prioridadeMeta(d.prioridade).cor}`}>{prioridadeMeta(d.prioridade).label}</Badge>
                  <span className="truncate text-sm font-medium">{d.titulo}</span>
                </div>
                <span className="truncate text-xs text-muted-foreground">{categoriaLabel(d.categoria)}</span>
                <span className="truncate text-xs text-muted-foreground">{d.client_id ? clientePorId.get(d.client_id)?.name ?? "—" : "—"}</span>
                <span className="truncate text-xs text-muted-foreground">{d.assigned_to ? pessoaPorId.get(d.assigned_to)?.nome ?? "—" : "Sem responsável"}</span>
                <span className={`text-xs ${atrasada ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                  {d.prazo ? format(parseISO(d.prazo), "dd MMM yyyy", { locale: ptBR }) : "—"}
                </span>
                <span><span className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ring-1 ${st.cor}`}>{st.label}</span></span>
              </button>
            );
          })}
          {visiveis.length === 0 && <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma demanda com esses filtros.</div>}
        </div>
      )}

      <DemandaDetalhe
        demanda={aberta}
        onClose={() => setAberta(null)}
        onChange={d => { substituir(d); setAberta(d); }}
        onDelete={id => { remover(id); setAberta(null); toast.success("Demanda excluída"); }}
        clientesDaCarteira={clientesDaCarteira}
        clientePorId={clientePorId}
        pessoas={pessoas}
        pessoaPorId={pessoaPorId}
      />

      <NovaDemandaDialog
        open={criando}
        onOpenChange={setCriando}
        onCreated={d => setDemandas(atual => [...atual, d])}
        clientes={clientesDaCarteira}
        pessoas={pessoas}
      />
    </div>
  );
}
