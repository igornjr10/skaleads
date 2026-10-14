import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarClock, CalendarPlus, Columns3, Crown, Hourglass, Inbox, ListChecks, Plus, Repeat, Rows3, Search, Send, Shuffle, Users, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientAvatar } from "@/components/ClientAvatar";
import { DemandaDetalhe } from "@/components/demandas/DemandaDetalhe";
import { DistribuicaoDialog } from "@/components/demandas/DistribuicaoDialog";
import { NovaDemandaDialog } from "@/components/demandas/NovaDemandaDialog";
import { useAuth } from "@/hooks/useAuth";
import { useDemandas } from "@/hooks/useDemandas";
import { useEstadoDaTela } from "@/hooks/useEstadoDaTela";
import { errorMessage } from "@/lib/utils";
import { rotuloPapel, veTodosOsClientes } from "@/lib/permissoes";
import {
  CATEGORIAS, PRIORIDADES, STATUS_DEMANDA, type Demanda,
  cargaPorPessoa, categoriaLabel, corresponsaveisDe, estaAberta, estaAtrasada, estaCom, estaProgramada, hojeISO,
  idsDosClientes, paraDemanda, prioridadeMeta, progressoChecklist, progressoClientes, rotuloInicio, rotuloPrazo, statusMeta,
} from "@/lib/demandas";

type Escopo = "comigo" | "pedidas" | "todas";
type Modo = "quadro" | "lista" | "equipe";

const TODOS = "todos";
const SEM = "sem";

function iniciais(nome: string) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("");
}

export default function Demandas() {
  const { user, role } = useAuth();
  const isAdmin = veTodosOsClientes(role);
  const {
    demandas, setDemandas, substituir, remover,
    clientesDaCarteira, clientesAtivos, clientePorId, pessoas, pessoaPorId,
    vinculos, definirVinculos, loading,
  } = useDemandas();

  // Filtros sobrevivem a abrir um cliente e voltar.
  const [escopo, setEscopo] = useEstadoDaTela<Escopo>("demandas:escopo", isAdmin ? "todas" : "comigo");
  const [modoSalvo, setModo] = useEstadoDaTela<Modo>("demandas:modo", isAdmin ? "equipe" : "quadro");
  const modo: Modo = modoSalvo === "equipe" && !isAdmin ? "quadro" : modoSalvo;
  const [verProgramadas, setVerProgramadas] = useState(false);
  const [distribuindo, setDistribuindo] = useState(false);
  const [busca, setBusca] = useEstadoDaTela("demandas:busca", "");
  const [responsavel, setResponsavel] = useEstadoDaTela("demandas:responsavel", TODOS);
  const [cliente, setCliente] = useEstadoDaTela("demandas:cliente", TODOS);
  const [categoria, setCategoria] = useEstadoDaTela("demandas:categoria", TODOS);
  const [prioridade, setPrioridade] = useEstadoDaTela("demandas:prioridade", TODOS);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [aberta, setAberta] = useState<Demanda | null>(null);
  const [criando, setCriando] = useState(false);

  const hoje = hojeISO();

  // Aviso do sino/WhatsApp leva a /demandas?demanda=<id>: abre direto o detalhe.
  const [params, setParams] = useSearchParams();
  const idDoLink = params.get("demanda");
  useEffect(() => {
    if (!idDoLink || loading) return;
    const alvo = demandas.find(d => d.id === idDoLink);
    if (alvo) setAberta(alvo);
    else toast.error("Essa demanda não existe mais ou não está com você");
    // So quando o link chega ou a lista termina de carregar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idDoLink, loading]);

  function fecharDetalhe() {
    setAberta(null);
    if (idDoLink) {
      const proximos = new URLSearchParams(params);
      proximos.delete("demanda");
      setParams(proximos, { replace: true });
    }
  }

  // Todos os filtros menos o de programada: a visao Equipe conta as programadas a parte.
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return demandas.filter(d => {
      const clientesDela = idsDosClientes(d, vinculos);
      const equipe = [d.assigned_to, ...corresponsaveisDe(d, vinculos)].filter(Boolean);
      if (escopo === "comigo" && !estaCom(d, user?.id, vinculos)) return false;
      if (escopo === "pedidas" && d.created_by !== user?.id) return false;
      if (responsavel === SEM && equipe.length > 0) return false;
      if (responsavel !== TODOS && responsavel !== SEM && !equipe.includes(responsavel)) return false;
      if (cliente === SEM && clientesDela.length > 0) return false;
      if (cliente !== TODOS && cliente !== SEM && !clientesDela.includes(cliente)) return false;
      if (categoria !== TODOS && d.categoria !== categoria) return false;
      if (prioridade !== TODOS && d.prioridade !== prioridade) return false;
      if (!termo) return true;
      const nomes = clientesDela.map(id => clientePorId.get(id)?.name ?? "").join(" ");
      return d.titulo.toLowerCase().includes(termo) || nomes.toLowerCase().includes(termo);
    });
  }, [demandas, escopo, responsavel, cliente, categoria, prioridade, busca, clientePorId, user?.id, vinculos]);

  const visiveis = useMemo(() => filtradas.filter(d => estaProgramada(d, hoje) === verProgramadas), [filtradas, verProgramadas, hoje]);

  const resumo = useMemo(() => {
    const abertas = demandas.filter(d => estaAberta(d) && !estaProgramada(d, hoje));
    const minha = (d: Demanda) => estaCom(d, user?.id, vinculos);
    return {
      programadas: demandas.filter(d => estaProgramada(d, hoje) && (isAdmin || minha(d) || d.created_by === user?.id)).length,
      atrasadas: abertas.filter(d => (isAdmin || minha(d)) && estaAtrasada(d, hoje)).length,
      hoje: abertas.filter(d => minha(d) && d.prazo === hoje).length,
      revisar: demandas.filter(d => d.status === "revisao" && (d.created_by === user?.id || isAdmin)).length,
      comigo: abertas.filter(minha).length,
    };
  }, [demandas, hoje, isAdmin, user?.id, vinculos]);

  const vista: Modo = verProgramadas && modo === "equipe" ? "lista" : modo;
  const nomeDe = (id: string | null) => (id ? pessoaPorId.get(id)?.nome ?? "—" : "Sistema");

  const carga = useMemo(() => cargaPorPessoa(filtradas, vinculos, hoje), [filtradas, vinculos, hoje]);

  function verDaPessoa(id: string | null) {
    setResponsavel(id ?? SEM);
    setModo("lista");
  }

  function podeMover(d: Demanda) {
    return isAdmin || d.created_by === user?.id || estaCom(d, user?.id, vinculos);
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
    if (status === "concluida" && d.recorrencia) toast.success("Concluída. A próxima da recorrência já está na fila.");
  }

  function soltar(status: string) {
    const d = demandas.find(x => x.id === arrastando);
    setArrastando(null);
    if (d) mudarStatus(d, status);
  }

  function Equipe({ d }: { d: Demanda }) {
    const resp = d.assigned_to ? pessoaPorId.get(d.assigned_to) : null;
    const outros = corresponsaveisDe(d, vinculos).map(id => pessoaPorId.get(id)?.nome ?? "—");
    return (
      <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <Crown className="h-3 w-3 shrink-0 text-amber-400" aria-label="Líder" />
        <span className="truncate" title="Líder">{resp?.nome ?? "Sem responsável"}</span>
        {d.distribuida_auto && <Shuffle className="h-3 w-3 shrink-0 text-primary" aria-label="Distribuída automaticamente" />}
        {outros.length > 0 && (
          <span className="flex shrink-0 -space-x-1.5" title={`Executores: ${outros.join(", ")}`}>
            {outros.slice(0, 3).map((n, i) => (
              <span key={i} className="flex h-5 w-5 items-center justify-center rounded-full border border-card bg-primary/15 text-[9px] font-semibold text-primary">
                {iniciais(n)}
              </span>
            ))}
            {outros.length > 3 && <span className="pl-2.5 text-[10px]">+{outros.length - 3}</span>}
          </span>
        )}
      </div>
    );
  }

  function Clientes({ d }: { d: Demanda }) {
    const ids = idsDosClientes(d, vinculos);
    if (ids.length === 0) return null;
    if (ids.length === 1) {
      const c = clientePorId.get(ids[0]);
      return (
        <div className="flex min-w-0 items-center gap-2">
          <ClientAvatar name={c?.name ?? "?"} logoUrl={c?.logo_url ?? null} className="h-5 w-5" />
          <span className="truncate text-xs text-muted-foreground">{c?.name ?? "Cliente"}</span>
        </div>
      );
    }
    const prog = progressoClientes(d, vinculos);
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {ids.length} clientes</span>
          <span className="tabular-nums">{prog.feitos}/{prog.total}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(prog.feitos / prog.total) * 100}%` }} />
        </div>
      </div>
    );
  }

  function cartao(d: Demanda) {
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
        className={`w-full min-w-0 space-y-2 rounded-2xl border border-border/60 bg-card/60 p-3 text-left transition-colors hover:border-border hover:bg-card ${arrastando === d.id ? "opacity-40" : ""}`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 flex-1 break-words text-sm font-medium leading-snug">{d.titulo}</span>
          <Badge variant="outline" className={`shrink-0 text-[10px] ${prio.cor}`}>{prio.label}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="max-w-full truncate text-[10px] font-normal">{categoriaLabel(d.categoria)}</Badge>
          {d.prazo && (
            <Badge variant={atrasada ? "destructive" : "outline"} className="gap-1 text-[10px]">
              {atrasada ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
              {rotuloPrazo(d)}
            </Badge>
          )}
          {check.total > 0 && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <ListChecks className="h-3 w-3" /> {check.feitos}/{check.total}
            </Badge>
          )}
          {d.recorrencia && (
            <Badge variant="outline" className="gap-1 text-[10px]" title="Demanda recorrente">
              <Repeat className="h-3 w-3" />
            </Badge>
          )}
          {d.aguardando_cliente && (
            <Badge variant="outline" className="gap-1 border-amber-500/40 text-[10px] text-amber-500">
              <Hourglass className="h-3 w-3" /> Cliente
            </Badge>
          )}
          {estaProgramada(d, hoje) && (
            <Badge variant="outline" className="gap-1 border-primary/40 text-[10px] text-primary">
              <CalendarPlus className="h-3 w-3" /> {rotuloInicio(d.inicia_em)}
            </Badge>
          )}
        </div>
        <Clientes d={d} />
        <Equipe d={d} />
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground/80">
          <Send className="h-3 w-3 shrink-0" />
          <span className="truncate">Pediu: {nomeDe(d.created_by)}</span>
        </div>
      </button>
    );
  }

  const opcoesEscopo: { id: Escopo; label: string }[] = [
    { id: "comigo", label: "Comigo" },
    { id: "pedidas", label: "Pedidas por mim" },
    { id: "todas", label: isAdmin ? "Toda a equipe" : "Todas" },
  ];

  const filtrando = busca || responsavel !== TODOS || cliente !== TODOS || categoria !== TODOS || prioridade !== TODOS;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Inbox className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Demandas</h1>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? "Tudo o que a equipe está tocando, por status." : "O que está com você e o que você pediu."}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {[
              { label: "Atrasadas", valor: resumo.atrasadas, alerta: resumo.atrasadas > 0 },
              { label: "Para hoje", valor: resumo.hoje, alerta: false },
              { label: "Revisar", valor: resumo.revisar, alerta: false },
              { label: "Comigo", valor: resumo.comigo, alerta: false },
            ].map(({ label, valor, alerta }) => (
              <div key={label} className={`min-w-[88px] rounded-2xl border px-3 py-2.5 text-center ${alerta ? "border-destructive/40 bg-destructive/5" : "border-border/60 bg-card/60"}`}>
                <div className={`text-xl font-semibold tabular-nums sm:text-2xl ${alerta ? "text-destructive" : ""}`}>{valor}</div>
                <div className="whitespace-nowrap text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setVerProgramadas(v => !v)}
              title={verProgramadas ? "Voltar para as que já chegaram" : "Ver as que ainda vão chegar"}
              className={`min-w-[88px] rounded-2xl border px-3 py-2.5 text-center transition-colors ${verProgramadas ? "border-primary/50 bg-primary/10" : "border-border/60 bg-card/60 hover:border-primary/40"}`}
            >
              <div className={`text-xl font-semibold tabular-nums sm:text-2xl ${verProgramadas ? "text-primary" : ""}`}>{resumo.programadas}</div>
              <div className="whitespace-nowrap text-[10px] uppercase tracking-wide text-muted-foreground">Programadas</div>
            </button>
          </div>
          <div className="flex shrink-0 gap-2">
            {isAdmin && (
              <Button variant="outline" onClick={() => setDistribuindo(true)} title="Quem recebe as demandas criadas sem responsável">
                <Shuffle className="mr-1.5 h-4 w-4" /> Distribuição
              </Button>
            )}
            <Button onClick={() => setCriando(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Nova demanda
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="flex shrink-0 overflow-x-auto rounded-xl border border-border/60 p-0.5">
          {opcoesEscopo.map(o => (
            <Button key={o.id} variant={escopo === o.id ? "secondary" : "ghost"} size="sm" className="shrink-0" onClick={() => setEscopo(o.id)}>
              {o.label}
            </Button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por título ou cliente..." className="pl-9" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {isAdmin && (
            <Select value={responsavel} onValueChange={setResponsavel}>
              <SelectTrigger className="min-w-0 sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os responsáveis</SelectItem>
                <SelectItem value={SEM}>Sem responsável</SelectItem>
                {pessoas.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={cliente} onValueChange={setCliente}>
            <SelectTrigger className="min-w-0 sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os clientes</SelectItem>
              <SelectItem value={SEM}>Sem cliente</SelectItem>
              {[...clientePorId.values()].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="min-w-0 sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Toda categoria</SelectItem>
              {CATEGORIAS.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={prioridade} onValueChange={setPrioridade}>
            <SelectTrigger className="min-w-0 sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Toda prioridade</SelectItem>
              {PRIORIDADES.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {filtrando && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => { setBusca(""); setResponsavel(TODOS); setCliente(TODOS); setCategoria(TODOS); setPrioridade(TODOS); }}
            >
              Limpar filtros
            </Button>
          )}
          <div className="flex rounded-xl border border-border/60 p-0.5">
            {isAdmin && (
              <Button variant={modo === "equipe" ? "secondary" : "ghost"} size="sm" onClick={() => setModo("equipe")} className="gap-1.5">
                <UsersRound className="h-4 w-4" /> Equipe
              </Button>
            )}
            <Button variant={modo === "quadro" ? "secondary" : "ghost"} size="sm" onClick={() => setModo("quadro")} className="gap-1.5">
              <Columns3 className="h-4 w-4" /> Quadro
            </Button>
            <Button variant={modo === "lista" ? "secondary" : "ghost"} size="sm" onClick={() => setModo("lista")} className="gap-1.5">
              <Rows3 className="h-4 w-4" /> Lista
            </Button>
          </div>
        </div>
      </div>

      {verProgramadas && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          <span className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-primary" />
            Programadas: chegam para quem executa (com aviso) no dia marcado, às 7h.
          </span>
          <Button variant="ghost" size="sm" onClick={() => setVerProgramadas(false)}>Voltar para as de agora</Button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : vista === "equipe" ? (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {carga.map(c => {
            const pessoa = c.id ? pessoaPorId.get(c.id) : null;
            const nomePessoa = c.id ? pessoa?.nome ?? "—" : "Sem responsável";
            return (
              <div key={c.id ?? SEM} className={`flex min-w-0 flex-col gap-3 rounded-2xl border p-4 ${c.atrasadas > 0 ? "border-destructive/40 bg-destructive/[0.03]" : "border-border/60 bg-card/60"}`}>
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${c.id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {c.id ? iniciais(nomePessoa) : "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{nomePessoa}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {pessoa ? rotuloPapel(pessoa.role) : "Fila sem dono"} · {c.abertas.length} aberta{c.abertas.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => verDaPessoa(c.id)}>Ver todas</Button>
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-center">
                  {[
                    { label: "Atrasadas", valor: c.atrasadas, cor: c.atrasadas ? "text-destructive" : "" },
                    { label: "Hoje", valor: c.hoje, cor: c.hoje ? "text-amber-400" : "" },
                    { label: "Revisão", valor: c.revisao, cor: "" },
                    { label: "Programadas", valor: c.programadas, cor: c.programadas ? "text-primary" : "" },
                  ].map(k => (
                    <div key={k.label} className="rounded-xl border border-border/50 bg-background/40 px-1 py-1.5">
                      <div className={`text-base font-semibold tabular-nums ${k.cor}`}>{k.valor}</div>
                      <div className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  {c.abertas.slice(0, 5).map(d => {
                    const st = statusMeta(d.status);
                    const atrasada = estaAtrasada(d, hoje);
                    const lider = d.assigned_to === c.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setAberta(d)}
                        className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-background/60"
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${d.prioridade === "urgente" ? "bg-red-500" : d.prioridade === "alta" ? "bg-amber-400" : d.prioridade === "media" ? "bg-sky-400" : "bg-slate-500"}`} title={prioridadeMeta(d.prioridade).label} />
                        <span className="min-w-0 flex-1 truncate text-xs" title={d.titulo}>{d.titulo}</span>
                        {c.id && !lider && <span className="shrink-0 text-[10px] text-muted-foreground">executa</span>}
                        <span className={`shrink-0 text-[11px] tabular-nums ${atrasada ? "font-medium text-destructive" : "text-muted-foreground"}`}>{d.prazo ? rotuloPrazo(d).split(" · ")[0] : "—"}</span>
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${st.cor}`}>{st.label}</span>
                      </button>
                    );
                  })}
                  {c.abertas.length > 5 && (
                    <button type="button" onClick={() => verDaPessoa(c.id)} className="w-full px-2 pt-1 text-left text-[11px] text-primary hover:underline">
                      + {c.abertas.length - 5} demanda{c.abertas.length - 5 === 1 ? "" : "s"}
                    </button>
                  )}
                  {c.abertas.length === 0 && <p className="px-2 py-2 text-[11px] text-muted-foreground">Nada aberto agora.</p>}
                </div>
              </div>
            );
          })}
          {carga.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground md:col-span-2 2xl:col-span-3">
              Nenhuma demanda aberta com esses filtros.
            </div>
          )}
        </div>
      ) : vista === "quadro" ? (
        // Colunas com largura minima: com o menu aberto, cinco colunas espremidas cortavam titulo e etiquetas.
        <div className="-mx-1 overflow-x-auto px-1 pb-2">
          <div className="grid auto-cols-[minmax(250px,1fr)] grid-flow-col gap-3">
            {STATUS_DEMANDA.map(coluna => {
              const itens = visiveis.filter(d => d.status === coluna.id);
              return (
                <div key={coluna.id} className="flex min-w-0 flex-col gap-2" onDragOver={e => e.preventDefault()} onDrop={() => soltar(coluna.id)}>
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
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/60">
          <div className="hidden gap-3 border-b border-border/60 bg-card/40 px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.9fr)]">
            <span>Demanda</span><span>Cliente</span><span>Pediu</span><span>Líder · executores</span><span>{verProgramadas ? "Chega / prazo" : "Prazo"}</span><span>Status</span>
          </div>
          {visiveis.map(d => {
            const st = statusMeta(d.status);
            const atrasada = estaAtrasada(d, hoje);
            const ids = idsDosClientes(d, vinculos);
            const prog = progressoClientes(d, vinculos);
            const outros = corresponsaveisDe(d, vinculos).map(nomeDe);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setAberta(d)}
                className="grid w-full grid-cols-1 gap-1.5 border-b border-border/40 px-4 py-3 text-left transition-colors last:border-0 hover:bg-card/60 lg:items-center lg:gap-3 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.9fr)]"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant="outline" className={`shrink-0 text-[10px] ${prioridadeMeta(d.prioridade).cor}`}>{prioridadeMeta(d.prioridade).label}</Badge>
                  <span className="truncate text-sm font-medium" title={d.titulo}>{d.titulo}</span>
                  {d.recorrencia && <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="hidden shrink-0 text-[11px] text-muted-foreground xl:inline">· {categoriaLabel(d.categoria)}</span>
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {ids.length === 0 ? "—" : ids.length === 1 ? clientePorId.get(ids[0])?.name ?? "—" : `${ids.length} clientes · ${prog.feitos}/${prog.total} feitos`}
                </span>
                <span className="truncate text-xs text-muted-foreground"><span className="lg:hidden">Pediu: </span>{nomeDe(d.created_by)}</span>
                <span className="flex min-w-0 items-center gap-1 text-xs" title={outros.length ? `Executores: ${outros.join(", ")}` : undefined}>
                  <Crown className="h-3 w-3 shrink-0 text-amber-400" />
                  <span className="truncate font-medium">{d.assigned_to ? nomeDe(d.assigned_to) : "Sem responsável"}</span>
                  {d.distribuida_auto && <Shuffle className="h-3 w-3 shrink-0 text-primary" aria-label="Distribuída automaticamente" />}
                  {outros.length > 0 && <span className="truncate text-muted-foreground">· {outros.join(", ")}</span>}
                </span>
                <span className={`text-xs ${atrasada ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                  {verProgramadas && d.inicia_em ? `${rotuloInicio(d.inicia_em)} · ` : ""}{d.prazo ? rotuloPrazo(d) : "—"}
                </span>
                <span><span className={`whitespace-nowrap rounded-lg px-2 py-0.5 text-[11px] font-semibold ring-1 ${st.cor}`}>{st.label}</span></span>
              </button>
            );
          })}
          {visiveis.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {verProgramadas ? "Nenhuma demanda programada." : "Nenhuma demanda com esses filtros."}
            </div>
          )}
        </div>
      )}

      <DemandaDetalhe
        demanda={aberta}
        onClose={fecharDetalhe}
        onChange={d => { substituir(d); setAberta(d); }}
        onDelete={id => { remover(id); fecharDetalhe(); toast.success("Demanda excluída"); }}
        clientesDaCarteira={clientesDaCarteira}
        clientePorId={clientePorId}
        pessoas={pessoas}
        pessoaPorId={pessoaPorId}
        vinculos={vinculos}
        clientesAtivos={clientesAtivos}
        onVinculos={definirVinculos}
      />

      {isAdmin && <DistribuicaoDialog open={distribuindo} onOpenChange={setDistribuindo} pessoas={pessoas} />}

      <NovaDemandaDialog
        open={criando}
        onOpenChange={setCriando}
        onCreated={d => setDemandas(atual => [...atual, d])}
        clientes={clientesDaCarteira}
        pessoas={pessoas}
        vinculos={vinculos}
        clientesAtivos={clientesAtivos}
        onVinculos={definirVinculos}
      />
    </div>
  );
}
