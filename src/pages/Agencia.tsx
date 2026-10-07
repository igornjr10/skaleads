import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, startOfMonth, subDays, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle, ArrowRight, Bell, Building2, CalendarClock, CalendarX2, Clock, Crosshair, Layers, ListTodo,
  Repeat, Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/utils";
import { buscarTudo } from "@/lib/buscar-tudo";
import { hojeISO } from "@/lib/demandas";
import {
  type ClienteAgencia, type DemandaAgencia, type FaturaAgencia, type GastoDiario, type VisaoAgencia,
  MOTIVO_LABEL, montarVisaoAgencia,
} from "@/lib/agencia";
import { inicioDaSemana, isoLocal, prioridadeDe, somarDias, STATUS_OCORRENCIA } from "@/lib/rotinas";
import {
  type ExecucaoDoSetor, type PipelineSetor, type RotinaDoSetor, type SetorRotina,
  SEM_SETOR, montarPipelineSetores, ocorrenciasNoPeriodo,
} from "@/lib/pipeline-setores";

function todosOsGastos(desde: string): Promise<GastoDiario[]> {
  return buscarTudo<GastoDiario>((de, ate) =>
    supabase.from("campaign_daily_metrics").select("client_id, date, spend, messages, calls, directions, leads").gte("date", desde).order("date").range(de, ate)
  );
}

interface DadosRotina {
  setores: SetorRotina[];
  rotinas: RotinaDoSetor[];
  execucoes: ExecucaoDoSetor[];
}

function Kpi({ icon: Icon, titulo, valor, detalhe, alerta, para }: {
  icon: typeof Users;
  titulo: string;
  valor: string;
  detalhe?: React.ReactNode;
  alerta?: boolean;
  para?: string;
}) {
  const card = (
    <Card className={`h-full shadow-card transition-colors ${para ? "hover:border-primary/40" : ""} ${alerta ? "border-destructive/40" : ""}`}>
      <CardContent className="flex items-start gap-3 p-5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${alerta ? "bg-destructive/10 text-destructive ring-destructive/20" : "bg-primary/10 text-primary ring-primary/20"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</div>
          <div className={`text-2xl font-semibold tabular-nums ${alerta ? "text-destructive" : ""}`}>{valor}</div>
          {detalhe && <div className="mt-0.5 text-xs text-muted-foreground">{detalhe}</div>}
        </div>
      </CardContent>
    </Card>
  );
  return para ? <Link to={para} className="block">{card}</Link> : card;
}

function iniciais(nome: string) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("");
}

/** Sino do cabeçalho: o que antes era o bloco "Precisa de atenção", sem ocupar a tela. */
function SinoAtencao({ visao }: { visao: VisaoAgencia }) {
  const { atencao, alertasAbertos, metas } = visao;
  const total = atencao.length + alertasAbertos;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative h-11 w-11 shrink-0 rounded-2xl" aria-label={`${total} alertas`}>
          <Bell className={`h-5 w-5 ${total > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
          {total > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold">Alertas</div>
          <div className="text-xs text-muted-foreground">Gerados automaticamente pela carteira</div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          <Link to="/alert-events" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted/50">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">Alertas de campanha abertos</span>
            <span className="tabular-nums font-semibold">{alertasAbertos}</span>
          </Link>
          {metas.comMeta > 0 && (
            <div className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm">
              <Crosshair className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">Abaixo da meta</span>
              <span className="tabular-nums font-semibold">{metas.abaixo}/{metas.comMeta}</span>
            </div>
          )}
          {atencao.length > 0 && (
            <div className="mt-1 border-t pt-2">
              <div className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <AlertTriangle className="h-3 w-3 text-amber-500" /> Clientes pedindo atenção ({atencao.length})
              </div>
              {atencao.map(c => (
                <Link key={c.id} to={`/clients/${c.id}`} className="block rounded-lg px-2 py-1.5 hover:bg-muted/50">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {c.motivos.map(m => (
                      <Badge key={m} variant={m === "fatura_vencida" ? "destructive" : "outline"} className="px-1.5 py-0 text-[10px] font-normal">{MOTIVO_LABEL[m]}</Badge>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          )}
          {total === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nada pedindo atenção agora.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CardSetor({ setor, nomeDe, onAbrir }: { setor: PipelineSetor; nomeDe: (id: string) => string; onAbrir: () => void }) {
  const fatia = (n: number) => (setor.total ? `${(n / setor.total) * 100}%` : "0%");
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="group flex flex-col gap-3 rounded-2xl border bg-card/60 p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold">{setor.nome}</div>
          <div className="text-xs text-muted-foreground">
            {setor.total === 0 ? "Nada programado" : `${setor.concluida} de ${setor.total} concluída${setor.total === 1 ? "" : "s"}`}
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        <div className="bg-blue-500" style={{ width: fatia(setor.andamento) }} />
        <div className="bg-emerald-500" style={{ width: fatia(setor.concluida) }} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { rotulo: "Pendentes", valor: setor.pendente, classe: "text-foreground" },
          { rotulo: "Andamento", valor: setor.andamento, classe: "text-blue-500" },
          { rotulo: "Concluídas", valor: setor.concluida, classe: "text-emerald-500" },
        ].map(c => (
          <div key={c.rotulo} className="rounded-xl bg-muted/40 px-1 py-1.5">
            <div className={`text-lg font-semibold tabular-nums ${c.classe}`}>{c.valor}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.rotulo}</div>
          </div>
        ))}
      </div>

      <div className="flex min-h-7 items-center gap-2">
        {setor.responsaveis.length === 0 ? (
          <span className="text-xs text-muted-foreground">Sem responsável definido</span>
        ) : (
          <>
            <div className="flex -space-x-2">
              {setor.responsaveis.slice(0, 4).map(id => (
                <span
                  key={id}
                  title={nomeDe(id)}
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary/15 text-[10px] font-semibold text-primary"
                >
                  {iniciais(nomeDe(id))}
                </span>
              ))}
            </div>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {setor.responsaveis.slice(0, 2).map(nomeDe).join(", ")}
              {setor.responsaveis.length > 2 && ` +${setor.responsaveis.length - 2}`}
            </span>
          </>
        )}
      </div>
    </button>
  );
}

export default function Agencia() {
  const [visao, setVisao] = useState<VisaoAgencia | null>(null);
  const [nomes, setNomes] = useState<Map<string, string>>(new Map());
  const [nomesClientes, setNomesClientes] = useState<Map<string, string>>(new Map());
  const [rotina, setRotina] = useState<DadosRotina | null>(null);
  const [periodo, setPeriodo] = useState<"hoje" | "semana">("hoje");
  const [setorAberto, setSetorAberto] = useState<string | null>(null);

  const agora = useMemo(() => new Date(), []);
  const hoje = isoLocal(agora);
  const semana = useMemo(() => {
    const inicio = inicioDaSemana(agora);
    return { de: isoLocal(inicio), ate: isoLocal(somarDias(inicio, 6)) };
  }, [agora]);

  useEffect(() => {
    (async () => {
      const inicioMesAnterior = format(startOfMonth(subMonths(agora, 1)), "yyyy-MM-dd");
      const seteDias = subDays(agora, 7).toISOString();
      try {
        const [clientes, faturas, gastos, demandas, relatorios, alertas, perfis, equipes, rotinas, execucoes] = await Promise.all([
          supabase.from("clients").select("id, name, status, meta_sync_status, meta_ad_account_id, meta_balance_cents, alvo_resultados_mes, alvo_custo_resultado"),
          supabase
            .from("invoices")
            .select("client_id, due_date, amount, status, paid_at, paid_amount")
            .neq("status", "cancelada")
            .or(`status.in.(aberta,vencida),due_date.gte.${inicioMesAnterior}`),
          todosOsGastos(inicioMesAnterior),
          supabase.from("tasks").select("status, prazo, assigned_to, categoria"),
          supabase.from("reports").select("client_id").gte("created_at", seteDias),
          supabase.from("alert_events").select("id", { count: "exact", head: true }).is("resolved_at", null).gte("triggered_at", seteDias),
          supabase.from("profiles").select("id, full_name, email"),
          supabase.from("rotina_equipes").select("id, nome, ordem"),
          supabase
            .from("rotinas")
            .select("id, titulo, equipe_id, assigned_to, client_id, prioridade, horario_limite, ativa, periodicidade, dias_semana, dia_mes, data_pontual")
            .eq("ativa", true),
          // A remanejada para dentro da semana entra mesmo com data_ref fora dela.
          supabase
            .from("rotina_execucoes")
            .select("rotina_id, data_ref, status, mover_para")
            .or(`and(data_ref.gte.${semana.de},data_ref.lte.${semana.ate}),and(mover_para.gte.${semana.de},mover_para.lte.${semana.ate})`),
        ]);
        for (const r of [clientes, faturas, demandas, relatorios]) if (r.error) throw r.error;

        setNomes(new Map(((perfis.data ?? []) as { id: string; full_name: string | null; email: string | null }[])
          .map(p => [p.id, p.full_name || p.email || "—"])));
        setNomesClientes(new Map(((clientes.data ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name])));
        setVisao(montarVisaoAgencia({
          hoje: hojeISO(agora),
          clientes: (clientes.data ?? []) as ClienteAgencia[],
          faturas: (faturas.data ?? []) as FaturaAgencia[],
          gastos,
          demandas: (demandas.data ?? []) as DemandaAgencia[],
          relatoriosRecentes: ((relatorios.data ?? []) as { client_id: string | null }[]).map(r => r.client_id).filter((id): id is string => !!id),
          alertasAbertos: alertas.count ?? 0,
        }));
        // Rotina e um modulo a parte: se a tabela nao responder, o resto do painel continua de pe.
        setRotina({
          setores: equipes.error ? [] : (equipes.data ?? []) as SetorRotina[],
          rotinas: rotinas.error ? [] : (rotinas.data ?? []) as RotinaDoSetor[],
          execucoes: execucoes.error ? [] : (execucoes.data ?? []) as ExecucaoDoSetor[],
        });
      } catch (err) {
        toast.error(errorMessage(err, "Não foi possível montar a visão da agência"));
      }
    })();
  }, [agora, semana]);

  const ocorrenciasHoje = useMemo(
    () => (rotina ? ocorrenciasNoPeriodo(rotina.rotinas, rotina.execucoes, hoje, hoje) : []),
    [rotina, hoje],
  );

  const pipeline = useMemo(() => {
    if (!rotina) return [];
    const ocorrencias = periodo === "hoje"
      ? ocorrenciasHoje
      : ocorrenciasNoPeriodo(rotina.rotinas, rotina.execucoes, semana.de, semana.ate);
    return montarPipelineSetores(rotina.setores, ocorrencias);
  }, [rotina, periodo, ocorrenciasHoje, semana]);

  const nomeDe = (id: string) => nomes.get(id) ?? "Equipe";
  const aberto = pipeline.find(s => s.id === setorAberto) ?? null;

  if (!visao) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  const { clientes, demandas } = visao;
  const rotinasHoje = {
    andamento: ocorrenciasHoje.filter(o => o.status === "andamento").length,
    concluidas: ocorrenciasHoje.filter(o => o.status === "concluida").length,
    total: ocorrenciasHoje.length,
  };
  const nadaProgramado = pipeline.every(s => s.total === 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Visão da agência</h1>
            <p className="text-sm text-muted-foreground">
              {format(agora, "EEEE, d 'de' MMMM", { locale: ptBR })} · o que a operação tem para hoje.
            </p>
          </div>
        </div>
        <SinoAtencao visao={visao} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi
          icon={Users}
          titulo="Clientes ativos"
          valor={String(clientes.ativos)}
          detalhe={clientes.metaComProblema > 0 ? `${clientes.metaComProblema} com Meta a reconectar` : `de ${clientes.total} na carteira`}
          alerta={clientes.metaComProblema > 0}
          para="/clients"
        />
        <Kpi
          icon={ListTodo}
          titulo="Demandas de hoje"
          valor={String(demandas.hoje)}
          detalhe={`${demandas.abertas} aberta${demandas.abertas === 1 ? "" : "s"} no total`}
          para="/demandas"
        />
        <Kpi
          icon={CalendarX2}
          titulo="Demandas atrasadas"
          valor={String(demandas.atrasadas)}
          detalhe={demandas.atrasadas > 0 ? "Prazo já passou e não foram entregues" : "Tudo dentro do prazo"}
          alerta={demandas.atrasadas > 0}
          para="/demandas"
        />
        <Kpi
          icon={CalendarClock}
          titulo="Reuniões de hoje"
          valor={String(demandas.reunioesHoje)}
          detalhe={demandas.reunioesHoje > 0 ? `${demandas.reunioesHojeFeitas} feita${demandas.reunioesHojeFeitas === 1 ? "" : "s"}` : "Nenhuma marcada para hoje"}
          para="/demandas"
        />
        <Kpi
          icon={Repeat}
          titulo="Rotinas em andamento"
          valor={String(rotinasHoje.andamento)}
          detalhe={rotinasHoje.total > 0 ? `${rotinasHoje.concluidas} de ${rotinasHoje.total} de hoje concluídas` : "Nenhuma rotina para hoje"}
          para="/rotina"
        />
      </div>

      <Card className="shadow-card">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-primary" /> Pipeline por setor
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">Demandas fixas e recorrentes de cada área, cadastradas na Rotina.</p>
          </div>
          <div className="inline-flex rounded-xl border p-0.5">
            {(["hoje", "semana"] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodo(p)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${periodo === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {p === "hoje" ? "Hoje" : "Semana"}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {!rotina ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
          ) : pipeline.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhum setor cadastrado. <Link to="/rotina" className="text-primary hover:underline">Crie as equipes na Rotina</Link>.
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {pipeline.map(setor => (
                  <CardSetor key={setor.id} setor={setor} nomeDe={nomeDe} onAbrir={() => setSetorAberto(setor.id)} />
                ))}
              </div>
              {nadaProgramado && (
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Nenhuma demanda fixa {periodo === "hoje" ? "para hoje" : "nesta semana"}.{" "}
                  <Link to="/rotina" className="text-primary hover:underline">Cadastrar na Rotina</Link>
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!aberto} onOpenChange={v => !v && setSetorAberto(null)}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          {aberto && (
            <>
              <SheetHeader className="border-b p-5 text-left">
                <SheetTitle>{aberto.nome}</SheetTitle>
                <SheetDescription>
                  {periodo === "hoje" ? "Hoje" : "Esta semana"} · {aberto.pendente} pendente{aberto.pendente === 1 ? "" : "s"} · {aberto.andamento} em andamento · {aberto.concluida} concluída{aberto.concluida === 1 ? "" : "s"}
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
                {aberto.ocorrencias.length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">Nada programado para este setor.</p>
                )}
                {aberto.ocorrencias.map((o, i) => {
                  const status = STATUS_OCORRENCIA.find(s => s.id === o.status) ?? STATUS_OCORRENCIA[0];
                  const novoDia = periodo === "semana" && (i === 0 || aberto.ocorrencias[i - 1].dia !== o.dia);
                  const [a, m, d] = o.dia.split("-").map(Number);
                  return (
                    <div key={`${o.rotina.id}|${o.dataRef}`}>
                      {novoDia && (
                        <div className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground first:pt-0">
                          {format(new Date(a, m - 1, d), "EEEE, dd/MM", { locale: ptBR })}{o.dia === hoje && " · hoje"}
                        </div>
                      )}
                      <div className={`rounded-xl border border-l-4 bg-card/60 px-3 py-2.5 ${prioridadeDe(o.rotina.prioridade).borda}`}>
                        <div className="flex items-start justify-between gap-2">
                          <span className={`text-sm font-medium ${o.status === "concluida" ? "text-muted-foreground line-through" : ""}`}>{o.rotina.titulo}</span>
                          <Badge variant="outline" className={`shrink-0 text-[10px] ${status.classe}`}>{status.label}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span>{o.rotina.assigned_to ? nomeDe(o.rotina.assigned_to) : "Sem responsável"}</span>
                          {o.rotina.client_id && nomesClientes.get(o.rotina.client_id) && <span>{nomesClientes.get(o.rotina.client_id)}</span>}
                          {o.rotina.horario_limite && (
                            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{o.rotina.horario_limite.slice(0, 5)}</span>
                          )}
                          {o.dia !== o.dataRef && <span>remanejada</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t p-4">
                <Button asChild className="w-full">
                  <Link to={aberto.id === SEM_SETOR ? "/rotina" : `/rotina?equipe=${aberto.id}`}>
                    Abrir na Rotina <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
