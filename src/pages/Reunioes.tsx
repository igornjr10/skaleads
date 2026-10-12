import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle, CalendarClock, CalendarDays, Building2, ChevronRight, History, ListTodo, Plus, RefreshCw, Search, Users, Video,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientAvatar } from "@/components/ClientAvatar";
import { SearchableSelect } from "@/components/SearchableSelect";
import { ReuniaoDetalhe } from "@/components/reunioes/ReuniaoDetalhe";
import { ReuniaoDialog } from "@/components/reunioes/ReuniaoDialog";
import { useReunioes } from "@/components/reunioes/useReunioes";
import { useAuth } from "@/hooks/useAuth";
import { useEstadoDaTela } from "@/hooks/useEstadoDaTela";
import { veTodosOsClientes } from "@/lib/permissoes";
import { cn } from "@/lib/utils";
import {
  type Reuniao, STATUS_REUNIAO, agruparPorDia, aguardaRegistro, chaveDoDia, dataEHora, duracaoLegivel, estaAcontecendo,
  horario, rotuloDoDia, separarReunioes, statusReuniaoMeta,
} from "@/lib/reunioes";

type Visao = "proximas" | "historico" | "cliente";

const TODOS = "todos";
const COMIGO = "comigo";
const SEM_CLIENTE = "sem";

function Indicador({ icone: Icone, rotulo, valor, destaque }: { icone: typeof CalendarDays; rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className={cn(
      "flex min-w-0 items-center gap-3 rounded-2xl border border-border/60 bg-card/60 p-3 shadow-card",
      destaque && valor > 0 && "border-amber-500/40",
    )}>
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary", destaque && valor > 0 && "bg-amber-500/10 text-amber-400")}>
        <Icone className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold tabular-nums leading-none">{valor}</p>
        <p className="truncate text-xs text-muted-foreground" title={rotulo}>{rotulo}</p>
      </div>
    </div>
  );
}

function Vazio({ titulo, texto, acao }: { titulo: string; texto: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-card/30 px-4 py-12 text-center">
      <CalendarClock className="h-10 w-10 text-muted-foreground/60" />
      <div className="space-y-1">
        <p className="font-semibold">{titulo}</p>
        <p className="max-w-md text-sm text-muted-foreground">{texto}</p>
      </div>
      {acao}
    </div>
  );
}

export default function Reunioes() {
  const { user, role } = useAuth();
  const isAdmin = veTodosOsClientes(role);
  const {
    reunioes, participantes, clientes, clientePorId, pessoas, pessoaPorId,
    loading, erro, semTabela, recarregar, substituir, remover, definirParticipantes,
  } = useReunioes();

  const [visao, setVisao] = useEstadoDaTela<Visao>("reunioes:visao", "proximas");
  const [busca, setBusca] = useEstadoDaTela("reunioes:busca", "");
  const [filtroCliente, setFiltroCliente] = useEstadoDaTela("reunioes:cliente", TODOS);
  const [filtroPessoa, setFiltroPessoa] = useEstadoDaTela("reunioes:pessoa", TODOS);
  const [filtroStatus, setFiltroStatus] = useEstadoDaTela("reunioes:status", TODOS);
  const [clienteDaVisao, setClienteDaVisao] = useEstadoDaTela("reunioes:cliente-da-visao", "");

  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<{ aberto: boolean; reuniao: Reuniao | null; cliente?: string | null }>({ aberto: false, reuniao: null });
  const [agora, setAgora] = useState(() => new Date());

  // Proximas viram historico sozinhas com o passar do tempo.
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const [params, setParams] = useSearchParams();
  const idDoLink = params.get("reuniao");
  useEffect(() => {
    if (!idDoLink || loading || semTabela) return;
    if (reunioes.some(r => r.id === idDoLink)) setAbertaId(idDoLink);
    else toast.error("Essa reunião não existe mais ou não está no seu acesso");
    // So quando o link chega ou a lista termina de carregar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idDoLink, loading, semTabela]);

  function fecharDetalhe() {
    setAbertaId(null);
    if (idDoLink) {
      const proximos = new URLSearchParams(params);
      proximos.delete("reuniao");
      setParams(proximos, { replace: true });
    }
  }

  const aberta = abertaId ? reunioes.find(r => r.id === abertaId) ?? null : null;
  const participantesDe = (id: string) => participantes.get(id) ?? [];
  const podeGerenciar = (r: Reuniao) => isAdmin || (!!user && r.created_by === user.id);
  const podeRegistrar = (r: Reuniao) => podeGerenciar(r) || (!!user && participantesDe(r.id).includes(user.id));
  const nomeDoCliente = (id: string | null) => (id ? clientePorId.get(id)?.name ?? "Cliente fora da sua carteira" : null);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return reunioes.filter(r => {
      if (filtroCliente === SEM_CLIENTE ? r.client_id : filtroCliente !== TODOS && r.client_id !== filtroCliente) return false;
      if (filtroPessoa !== TODOS) {
        const alvo = filtroPessoa === COMIGO ? user?.id : filtroPessoa;
        if (!alvo || !(participantes.get(r.id) ?? []).includes(alvo)) return false;
      }
      if (filtroStatus === "pendente" ? !aguardaRegistro(r, agora) : filtroStatus !== TODOS && r.status !== filtroStatus) return false;
      if (termo) {
        const cliente = r.client_id ? clientePorId.get(r.client_id)?.name ?? "" : "";
        const texto = `${r.titulo} ${cliente} ${r.pauta ?? ""} ${r.decisoes ?? ""} ${r.local ?? ""}`.toLowerCase();
        if (!texto.includes(termo)) return false;
      }
      return true;
    });
  }, [reunioes, participantes, busca, filtroCliente, filtroPessoa, filtroStatus, clientePorId, user?.id, agora]);

  const { proximas, historico } = useMemo(() => separarReunioes(filtradas, agora), [filtradas, agora]);

  const indicadores = useMemo(() => {
    const hoje = chaveDoDia(agora);
    const semana = agora.getTime() + 7 * 86_400_000;
    let deHoje = 0, daSemana = 0, pendentes = 0, acoesAbertas = 0;
    for (const r of reunioes) {
      if (r.status === "agendada" && chaveDoDia(r.inicio) === hoje) deHoje++;
      const t = new Date(r.inicio).getTime();
      if (r.status === "agendada" && t >= agora.getTime() && t <= semana) daSemana++;
      if (aguardaRegistro(r, agora)) pendentes++;
      acoesAbertas += r.acoes.filter(a => !a.feito && !a.task_id).length;
    }
    return { deHoje, daSemana, pendentes, acoesAbertas };
  }, [reunioes, agora]);

  const resumoPorCliente = useMemo(() => {
    const mapa = new Map<string, { total: number; realizadas: number; ultima: string | null; proxima: string | null }>();
    for (const r of reunioes) {
      if (!r.client_id) continue;
      const s = mapa.get(r.client_id) ?? { total: 0, realizadas: 0, ultima: null, proxima: null };
      s.total++;
      if (r.status === "realizada") {
        s.realizadas++;
        if (!s.ultima || r.inicio > s.ultima) s.ultima = r.inicio;
      }
      if (r.status === "agendada" && new Date(r.inicio) >= agora && (!s.proxima || r.inicio < s.proxima)) s.proxima = r.inicio;
      mapa.set(r.client_id, s);
    }
    return mapa;
  }, [reunioes, agora]);

  const filtrosAtivos = busca.trim() !== "" || filtroCliente !== TODOS || filtroPessoa !== TODOS || filtroStatus !== TODOS;
  function limparFiltros() {
    setBusca("");
    setFiltroCliente(TODOS);
    setFiltroPessoa(TODOS);
    setFiltroStatus(TODOS);
  }

  const opcoesCliente = useMemo(() => [
    { value: TODOS, label: "Todos os clientes" },
    { value: SEM_CLIENTE, label: "Reuniões internas" },
    ...clientes.map(c => ({ value: c.id, label: c.name })),
  ], [clientes]);

  function abrirNova(cliente?: string | null) {
    setDialogo({ aberto: true, reuniao: null, cliente: cliente ?? null });
  }

  function cartao(r: Reuniao, mostrarData = false) {
    const st = statusReuniaoMeta(r.status);
    const cliente = r.client_id ? clientePorId.get(r.client_id) : null;
    const pessoasDaReuniao = participantesDe(r.id);
    const acoesAbertas = r.acoes.filter(a => !a.feito).length;
    const agoraMesmo = estaAcontecendo(r, agora);
    const pendente = aguardaRegistro(r, agora);
    return (
      <li key={r.id}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setAbertaId(r.id)}
          onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setAbertaId(r.id); } }}
          className={cn(
            "group flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-2xl border border-border/60 bg-card/60 p-3 text-left shadow-card transition-colors hover:border-primary/40 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:items-center sm:p-4",
            agoraMesmo && "border-primary/50 ring-1 ring-primary/30",
            r.status === "cancelada" && "opacity-60",
          )}
        >
          <div className="w-14 shrink-0 text-center sm:w-16">
            <p className={cn("text-base font-bold tabular-nums", r.status === "cancelada" && "line-through")}>{horario(r.inicio)}</p>
            <p className="text-[11px] text-muted-foreground">{duracaoLegivel(r.duracao_min)}</p>
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <p className="min-w-0 truncate font-semibold" title={r.titulo}>{r.titulo}</p>
              {agoraMesmo && <Badge className="h-5 bg-primary/20 px-1.5 text-[10px] text-primary hover:bg-primary/20">Agora</Badge>}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {mostrarData && <span>{dataEHora(r.inicio)}</span>}
              <span className="flex min-w-0 items-center gap-1.5">
                {r.client_id ? (
                  <>
                    <ClientAvatar name={cliente?.name ?? "?"} logoUrl={cliente?.logo_url} className="h-4 w-4" />
                    <span className="max-w-[180px] truncate" title={nomeDoCliente(r.client_id) ?? ""}>{nomeDoCliente(r.client_id)}</span>
                  </>
                ) : (
                  <><Building2 className="h-3.5 w-3.5" /> Interna</>
                )}
              </span>
              <span
                className="flex items-center gap-1"
                title={pessoasDaReuniao.map(id => pessoaPorId.get(id)?.nome ?? "?").join(", ") || "Sem participantes"}
              >
                <Users className="h-3.5 w-3.5" /> {pessoasDaReuniao.length}
              </span>
              {acoesAbertas > 0 && (
                <span className="flex items-center gap-1"><ListTodo className="h-3.5 w-3.5" /> {acoesAbertas} {acoesAbertas === 1 ? "ação" : "ações"}</span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
            {pendente
              ? <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">Registrar</Badge>
              : <Badge variant="outline" className={st.classe}>{st.label}</Badge>}
            {r.meet_url && r.status === "agendada" && !pendente && (
              <Button asChild size="sm" variant={agoraMesmo ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={e => e.stopPropagation()}>
                <a href={r.meet_url} target="_blank" rel="noopener noreferrer"><Video className="mr-1 h-3.5 w-3.5" /> Meet</a>
              </Button>
            )}
            <ChevronRight className="hidden h-4 w-4 text-muted-foreground group-hover:text-primary sm:block" />
          </div>
        </div>
      </li>
    );
  }

  function listaPorDia(lista: Reuniao[], vazio: ReactNode) {
    if (!lista.length) return <>{vazio}</>;
    return (
      <div className="space-y-5">
        {agruparPorDia(lista, agora).map(g => (
          <section key={g.dia} className="space-y-2">
            <h3 className={cn("flex items-center gap-2 text-sm font-semibold", g.hoje ? "text-primary" : "text-muted-foreground")}>
              {g.hoje && <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px] shadow-primary" />}
              {g.rotulo}
              <span className="text-xs font-normal text-muted-foreground">({g.itens.length})</span>
            </h3>
            <ul className={cn("space-y-2", g.hoje && "rounded-2xl border border-primary/20 bg-primary/5 p-2")}>
              {g.itens.map(r => cartao(r))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  const vazioFiltrado = filtrosAtivos
    ? <Vazio titulo="Nada com esses filtros" texto="Mude ou limpe os filtros para ver mais reuniões." acao={<Button variant="outline" size="sm" onClick={limparFiltros}>Limpar filtros</Button>} />
    : null;

  function conteudo() {
    if (loading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />)}
        </div>
      );
    }
    if (erro) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-10 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="max-w-md break-words text-sm">{erro}</p>
          <Button variant="outline" size="sm" onClick={recarregar}><RefreshCw className="mr-2 h-4 w-4" /> Tentar de novo</Button>
        </div>
      );
    }

    if (visao === "proximas") {
      return (
        listaPorDia(
          proximas,
          vazioFiltrado ?? (
            <Vazio
              titulo="Nenhuma reunião marcada"
              texto="Agende alinhamentos com clientes e com o time. Tudo o que for combinado vira ação com dono e prazo."
              acao={<Button size="sm" onClick={() => abrirNova()}><Plus className="mr-2 h-4 w-4" /> Agendar reunião</Button>}
            />
          ),
        )
      );
    }

    if (visao === "historico") {
      return (
        listaPorDia(
          historico,
          vazioFiltrado ?? <Vazio titulo="Sem histórico ainda" texto="Reuniões que já passaram, realizadas ou canceladas, aparecem aqui com o registro." />,
        )
      );
    }

    if (!clienteDaVisao) {
      const comReuniao = clientes.filter(c => resumoPorCliente.has(c.id));
      const semReuniao = clientes.filter(c => !resumoPorCliente.has(c.id));
      if (!clientes.length) return <Vazio titulo="Nenhum cliente na sua carteira" texto="Quando houver clientes, o histórico de reuniões de cada um aparece aqui." />;
      return (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {[...comReuniao, ...semReuniao].map(c => {
            const s = resumoPorCliente.get(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setClienteDaVisao(c.id)}
                  className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-border/60 bg-card/60 p-3 text-left shadow-card transition-colors hover:border-primary/40"
                >
                  <ClientAvatar name={c.name} logoUrl={c.logo_url} className="h-9 w-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" title={c.name}>{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s
                        ? `${s.realizadas} realizada${s.realizadas === 1 ? "" : "s"}${s.ultima ? ` · última ${rotuloDoDia(chaveDoDia(s.ultima), agora).toLowerCase()}` : ""}${s.proxima ? ` · próxima ${dataEHora(s.proxima)}` : ""}`
                        : "Nenhuma reunião registrada"}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      );
    }

    const doCliente = reunioes.filter(r => r.client_id === clienteDaVisao).sort((a, b) => b.inicio.localeCompare(a.inicio));
    const s = resumoPorCliente.get(clienteDaVisao);
    const cliente = clientePorId.get(clienteDaVisao);
    const acoesAbertas = doCliente.reduce((n, r) => n + r.acoes.filter(a => !a.feito).length, 0);
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <ClientAvatar name={cliente?.name ?? "?"} logoUrl={cliente?.logo_url} className="h-10 w-10" />
            <div className="min-w-0">
              <p className="truncate font-semibold" title={cliente?.name}>{cliente?.name ?? "Cliente"}</p>
              <p className="text-xs text-muted-foreground">
                {s?.total ?? 0} reuniões · {s?.realizadas ?? 0} realizadas · {acoesAbertas} ações abertas
                {s?.ultima ? ` · última em ${dataEHora(s.ultima)}` : ""}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => abrirNova(clienteDaVisao)}><Plus className="mr-2 h-4 w-4" /> Agendar com este cliente</Button>
        </div>
        {doCliente.length ? (
          <ul className="space-y-2">{doCliente.map(r => cartao(r, true))}</ul>
        ) : (
          <Vazio titulo="Nenhuma reunião com este cliente" texto="Agende a primeira para começar o histórico." />
        )}
      </div>
    );
  }

  if (semTabela) {
    return (
      <div className="mx-auto max-w-xl space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
        <p className="font-semibold">Reuniões ainda não foi ativada: falta aplicar a migration.</p>
        <p className="text-sm text-muted-foreground">Rode supabase/migrations/20261012140000_reunioes.sql no SQL Editor do Supabase e recarregue a página.</p>
        <Button variant="outline" size="sm" onClick={recarregar}><RefreshCw className="mr-2 h-4 w-4" /> Verificar de novo</Button>
      </div>
    );
  }

  const opcoesVisao: { id: Visao; label: string; icone: typeof CalendarDays; n?: number }[] = [
    { id: "proximas", label: "Próximas", icone: CalendarDays, n: loading ? undefined : proximas.length },
    { id: "historico", label: "Histórico", icone: History, n: loading ? undefined : historico.length },
    { id: "cliente", label: "Por cliente", icone: Building2 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <CalendarClock className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Reuniões</h1>
            <p className="text-sm text-muted-foreground">Agenda, registro e o que foi combinado virando demanda.</p>
          </div>
        </div>
        <Button onClick={() => abrirNova(visao === "cliente" ? clienteDaVisao || null : null)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" /> Agendar reunião
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Indicador icone={CalendarClock} rotulo="Hoje" valor={indicadores.deHoje} />
        <Indicador icone={CalendarDays} rotulo="Próximos 7 dias" valor={indicadores.daSemana} />
        <Indicador icone={AlertTriangle} rotulo="Aguardando registro" valor={indicadores.pendentes} destaque />
        <Indicador icone={ListTodo} rotulo="Ações sem demanda" valor={indicadores.acoesAbertas} destaque />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1 rounded-2xl border border-border/60 bg-card/40 p-1 sm:w-fit">
          {opcoesVisao.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => setVisao(o.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none",
                visao === o.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <o.icone className="h-4 w-4" />
              {o.label}
              {o.n !== undefined && <span className="text-xs tabular-nums opacity-70">{o.n}</span>}
            </button>
          ))}
        </div>

        {visao === "cliente" ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="sm:w-80">
              <SearchableSelect
                options={clientes.map(c => ({ value: c.id, label: c.name }))}
                value={clienteDaVisao}
                onChange={setClienteDaVisao}
                placeholder="Escolha um cliente"
                searchPlaceholder="Buscar cliente..."
                emptyText="Nenhum cliente"
              />
            </div>
            {clienteDaVisao && <Button variant="ghost" size="sm" onClick={() => setClienteDaVisao("")}>Ver todos os clientes</Button>}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_200px_180px_auto]">
            <div className="relative sm:col-span-2 xl:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por título, cliente, pauta..." className="pl-9" />
            </div>
            <SearchableSelect options={opcoesCliente} value={filtroCliente} onChange={v => setFiltroCliente(v || TODOS)} searchPlaceholder="Buscar cliente..." />
            <Select value={filtroPessoa} onValueChange={setFiltroPessoa}>
              <SelectTrigger><SelectValue placeholder="Participante" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os participantes</SelectItem>
                <SelectItem value={COMIGO}>Comigo</SelectItem>
                {pessoas.filter(p => p.id !== user?.id).map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os status</SelectItem>
                {STATUS_REUNIAO.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                <SelectItem value="pendente">Aguardando registro</SelectItem>
              </SelectContent>
            </Select>
            {filtrosAtivos && <Button variant="ghost" onClick={limparFiltros}>Limpar</Button>}
          </div>
        )}
      </div>

      {conteudo()}

      <ReuniaoDetalhe
        reuniao={aberta}
        open={!!aberta}
        onOpenChange={v => { if (!v) fecharDetalhe(); }}
        participantes={aberta ? participantesDe(aberta.id) : []}
        cliente={aberta?.client_id ? clientePorId.get(aberta.client_id) ?? null : null}
        pessoas={pessoas}
        podeGerenciar={aberta ? podeGerenciar(aberta) : false}
        podeRegistrar={aberta ? podeRegistrar(aberta) : false}
        onMudou={substituir}
        onEditar={() => aberta && setDialogo({ aberto: true, reuniao: aberta })}
        onExcluida={id => { fecharDetalhe(); remover(id); }}
      />

      <ReuniaoDialog
        open={dialogo.aberto}
        onOpenChange={v => setDialogo(d => ({ ...d, aberto: v }))}
        reuniao={dialogo.reuniao}
        participantesAtuais={dialogo.reuniao ? participantesDe(dialogo.reuniao.id) : []}
        clientes={clientes}
        pessoas={pessoas}
        clienteInicial={dialogo.cliente}
        podeDefinirParticipantes={dialogo.reuniao ? podeGerenciar(dialogo.reuniao) : true}
        onSalva={(r, ids) => {
          substituir(r);
          definirParticipantes(r.id, ids);
          if (!dialogo.reuniao) setAbertaId(r.id);
        }}
      />
    </div>
  );
}
