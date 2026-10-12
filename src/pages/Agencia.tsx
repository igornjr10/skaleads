import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format, startOfMonth, subDays, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle, ArrowRight, Bell, Bot, Building2, CalendarCheck, CalendarClock, CalendarX2, CheckCircle2, Clock,
  Crosshair, Gauge, Layers, ListTodo, NotebookPen, Sparkles, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { DemandaDetalhe } from "@/components/demandas/DemandaDetalhe";
import { type DemandaInicial, NovaDemandaDialog } from "@/components/demandas/NovaDemandaDialog";
import { MuralEquipe } from "@/components/agencia/MuralEquipe";
import { useAuth } from "@/hooks/useAuth";
import { useDemandas } from "@/hooks/useDemandas";
import { errorMessage } from "@/lib/utils";
import { veTodosOsClientes } from "@/lib/permissoes";
import { buscarTudo } from "@/lib/buscar-tudo";
import {
  type Demanda, categoriaLabel, estaAberta, estaAtrasada, hojeISO, prioridadeMeta, rotuloPrazo, statusMeta,
} from "@/lib/demandas";
import {
  type ClienteAgencia, type FaturaAgencia, type GastoDiario, type VisaoAgencia,
  MOTIVO_LABEL, montarVisaoAgencia,
} from "@/lib/agencia";
import { type Gargalo, analisarGargalos, cargaDaEquipe, pipelineDeDemandas } from "@/lib/gargalos";
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

/** Reuniao na Visao: da tabela `reunioes` ou demanda de categoria Reuniao. */
interface ReuniaoVisao {
  id: string;
  origem: "reuniao" | "demanda";
  titulo: string;
  client_id: string | null;
  dia: string;
  hora: string | null;
  quem: string | null;
  feita: boolean;
  feitaEm: string | null;
}

interface LinhaReuniao {
  id: string;
  titulo: string;
  client_id: string | null;
  inicio: string;
  status: string;
  created_by: string | null;
  updated_at?: string | null;
}

interface Base {
  clientes: ClienteAgencia[];
  faturas: FaturaAgencia[];
  gastos: GastoDiario[];
  relatoriosRecentes: string[];
  alertasAbertos: number;
}

type Aba = "atrasadas" | "vencem" | "andamento" | "pendentes" | "revisao" | "concluidas";

const ABAS: { id: Aba; label: string }[] = [
  { id: "atrasadas", label: "Atrasadas" },
  { id: "vencem", label: "Vencem em 48h" },
  { id: "andamento", label: "Em andamento" },
  { id: "pendentes", label: "Pendentes" },
  { id: "revisao", label: "Em revisão" },
  { id: "concluidas", label: "Concluídas na semana" },
];

const LIMITE_ABERTAS = 12;
const LIMITE_ATRASADAS = 3;
const TODOS = "todos";

function Kpi({ icon: Icon, titulo, valor, detalhe, alerta, onClick, para, ativo }: {
  icon: typeof Users;
  titulo: string;
  valor: string;
  detalhe?: React.ReactNode;
  alerta?: boolean;
  onClick?: () => void;
  para?: string;
  ativo?: boolean;
}) {
  const card = (
    <Card className={`h-full shadow-card transition-colors ${onClick || para ? "hover:border-primary/40" : ""} ${alerta ? "border-destructive/40" : ""} ${ativo ? "border-primary ring-1 ring-primary/30" : ""}`}>
      <CardContent className="flex items-start gap-3 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${alerta ? "bg-destructive/10 text-destructive ring-destructive/20" : "bg-primary/10 text-primary ring-primary/20"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{titulo}</div>
          <div className={`text-2xl font-semibold tabular-nums ${alerta ? "text-destructive" : ""}`}>{valor}</div>
          {detalhe && <div className="mt-0.5 text-xs text-muted-foreground">{detalhe}</div>}
        </div>
      </CardContent>
    </Card>
  );
  if (para) return <Link to={para} className="block">{card}</Link>;
  return onClick ? <button type="button" onClick={onClick} className="block w-full text-left">{card}</button> : card;
}

function iniciais(nome: string) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("");
}

function Avatares({ ids, nomeDe }: { ids: string[]; nomeDe: (id: string) => string }) {
  if (!ids.length) return <span className="text-xs text-muted-foreground">Sem responsável definido</span>;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex -space-x-2">
        {ids.slice(0, 4).map(id => (
          <span key={id} title={nomeDe(id)} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary/15 text-[10px] font-semibold text-primary">
            {iniciais(nomeDe(id))}
          </span>
        ))}
      </div>
      <span className="min-w-0 truncate text-xs text-muted-foreground">
        {ids.slice(0, 2).map(nomeDe).join(", ")}{ids.length > 2 && ` +${ids.length - 2}`}
      </span>
    </div>
  );
}

/** Sino do cabecalho: alertas de campanha, metas e clientes pedindo atencao. */
function SinoAtencao({ visao }: { visao: VisaoAgencia }) {
  const { atencao, alertasAbertos, metas } = visao;
  const total = atencao.length + alertasAbertos;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative h-10 w-10 shrink-0 rounded-2xl" aria-label={`${total} alertas`}>
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

function CardSetorRotina({ setor, nomeDe, onAbrir }: { setor: PipelineSetor; nomeDe: (id: string) => string; onAbrir: () => void }) {
  const fatia = (n: number) => (setor.total ? `${(n / setor.total) * 100}%` : "0%");
  return (
    <button type="button" onClick={onAbrir} className="group flex flex-col gap-3 rounded-2xl border bg-card/60 p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30">
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
      <div className="flex min-h-7 items-center"><Avatares ids={setor.responsaveis} nomeDe={nomeDe} /></div>
    </button>
  );
}

const COR_GRAVIDADE = {
  alta: "border-l-red-500",
  media: "border-l-amber-500",
  baixa: "border-l-slate-400",
} as const;

export default function Agencia() {
  const { role } = useAuth();
  const isAdmin = veTodosOsClientes(role);
  const {
    demandas, setDemandas, substituir, remover, clientesDaCarteira, clientePorId,
    pessoas, pessoaPorId, loading,
  } = useDemandas();
  const [params, setParams] = useSearchParams();

  const [base, setBase] = useState<Base | null>(null);
  const [rotina, setRotina] = useState<DadosRotina | null>(null);
  const [reunioesTabela, setReunioesTabela] = useState<LinhaReuniao[] | null>(null);
  const [periodo, setPeriodo] = useState<"hoje" | "semana">("hoje");
  const [pipelineDe, setPipelineDe] = useState<"demandas" | "rotina">("demandas");
  const [setorAberto, setSetorAberto] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("atrasadas");
  const [pessoaFiltro, setPessoaFiltro] = useState<string>(params.get("pessoa") ?? TODOS);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [selecao, setSelecao] = useState<{ titulo: string; ids: string[] } | null>(null);
  const [registro, setRegistro] = useState<{ inicial: DemandaInicial; descricao: string } | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const agora = useMemo(() => new Date(), []);
  const hoje = isoLocal(agora);
  const amanha = isoLocal(somarDias(agora, 1));
  const horaAgora = format(agora, "HH:mm");
  const semana = useMemo(() => {
    const inicio = inicioDaSemana(agora);
    return { de: isoLocal(inicio), ate: isoLocal(somarDias(inicio, 6)) };
  }, [agora]);

  useEffect(() => {
    (async () => {
      const inicioMesAnterior = format(startOfMonth(subMonths(agora, 1)), "yyyy-MM-dd");
      const seteDias = subDays(agora, 7).toISOString();
      try {
        const [clientes, faturas, gastos, relatorios, alertas, equipes, reunioes, rotinas, execucoes] = await Promise.all([
          supabase.from("clients").select("id, name, status, meta_sync_status, meta_ad_account_id, meta_balance_cents, alvo_resultados_mes, alvo_custo_resultado"),
          supabase
            .from("invoices")
            .select("client_id, due_date, amount, status, paid_at, paid_amount")
            .neq("status", "cancelada")
            .or(`status.in.(aberta,vencida),due_date.gte.${inicioMesAnterior}`),
          todosOsGastos(inicioMesAnterior),
          supabase.from("reports").select("client_id").gte("created_at", seteDias),
          supabase.from("alert_events").select("id", { count: "exact", head: true }).is("resolved_at", null).gte("triggered_at", seteDias),
          supabase.from("rotina_equipes").select("id, nome, ordem"),
          // Tabela do modulo Reunioes; sem ela a Visao segue so com as demandas de reuniao.
          supabase
            .from("reunioes" as never)
            .select("*")
            .gte("inicio", subDays(agora, 3).toISOString())
            .lte("inicio", `${semana.ate}T23:59:59-03:00`)
            .neq("status", "cancelada")
            .order("inicio"),
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
        for (const r of [clientes, faturas, relatorios]) if (r.error) throw r.error;
        setBase({
          clientes: (clientes.data ?? []) as ClienteAgencia[],
          faturas: (faturas.data ?? []) as FaturaAgencia[],
          gastos,
          relatoriosRecentes: ((relatorios.data ?? []) as { client_id: string | null }[]).map(r => r.client_id).filter((id): id is string => !!id),
          alertasAbertos: alertas.count ?? 0,
        });
        setReunioesTabela(reunioes.error ? null : ((reunioes.data ?? []) as unknown as LinhaReuniao[]));
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

  // Demandas vem do useDemandas (paginado e em tempo real): mudou o status em
  // qualquer tela, a Visao recalcula sozinha.
  const visao = useMemo(() => base && montarVisaoAgencia({
    hoje: hojeISO(agora),
    clientes: base.clientes,
    faturas: base.faturas,
    gastos: base.gastos,
    demandas,
    relatoriosRecentes: base.relatoriosRecentes,
    alertasAbertos: base.alertasAbertos,
  }), [base, demandas, agora]);

  const nomeDe = (id: string | null) => (id ? pessoaPorId.get(id)?.nome ?? "Equipe" : "Sem responsável");
  const nomeCliente = (id: string | null) => (id ? clientePorId.get(id)?.name ?? base?.clientes.find(c => c.id === id)?.name ?? null : null);
  const atrasadaAgora = (d: Demanda) =>
    estaAtrasada(d, hoje) || (estaAberta(d) && d.prazo === hoje && !!d.prazo_hora && d.prazo_hora.slice(0, 5) <= horaAgora);

  const numeros = useMemo(() => {
    const abertas = demandas.filter(estaAberta);
    const tresDias = subDays(agora, 3).toISOString();
    const reunioes: ReuniaoVisao[] = [
      ...demandas.filter(d => d.categoria === "reuniao" && d.prazo).map(d => ({
        id: d.id, origem: "demanda" as const, titulo: d.titulo, client_id: d.client_id, dia: d.prazo!,
        hora: d.prazo_hora?.slice(0, 5) ?? null, quem: d.assigned_to, feita: d.status === "concluida", feitaEm: d.concluida_at,
      })),
      ...(reunioesTabela ?? []).map(r => ({
        id: r.id, origem: "reuniao" as const, titulo: r.titulo, client_id: r.client_id,
        dia: isoLocal(new Date(r.inicio)), hora: format(new Date(r.inicio), "HH:mm"), quem: r.created_by,
        feita: r.status === "realizada", feitaEm: r.status === "realizada" ? r.updated_at ?? r.inicio : null,
      })),
    ];
    return {
      abertas,
      atrasadas: abertas.filter(atrasadaAgora),
      vencem: abertas.filter(d => d.prazo && (d.prazo === hoje || d.prazo === amanha) && !atrasadaAgora(d)),
      concluidasSemana: demandas.filter(d => d.status === "concluida" && (d.concluida_at ?? "").slice(0, 10) >= semana.de),
      reunioesProximas: reunioes
        .filter(r => !r.feita && r.dia >= hoje && r.dia <= semana.ate)
        .sort((a, b) => `${a.dia}${a.hora ?? ""}`.localeCompare(`${b.dia}${b.hora ?? ""}`)),
      reunioesHoje: reunioes.filter(r => r.dia === hoje).length,
      reunioesFeitas: reunioes
        .filter(r => r.feita && (r.feitaEm ?? "") >= tresDias)
        .sort((a, b) => (b.feitaEm ?? "").localeCompare(a.feitaEm ?? "")),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demandas, reunioesTabela, hoje, amanha, semana, agora]);

  const carga = useMemo(() => cargaDaEquipe(demandas, hoje, amanha), [demandas, hoje, amanha]);
  const sobrecarregados = carga.filter(c => c.pessoa && (c.abertas > LIMITE_ABERTAS || c.atrasadas >= LIMITE_ATRASADAS));

  const gargalos = useMemo(() => visao ? analisarGargalos({
    hoje,
    agoraMs: agora.getTime(),
    demandas,
    pessoas,
    nomeCliente,
    atencao: visao.atencao,
    limiteAbertas: LIMITE_ABERTAS,
    limiteAtrasadas: LIMITE_ATRASADAS,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }) : [], [visao, demandas, pessoas, hoje, agora]);

  const pipelineDemandas = useMemo(() => pipelineDeDemandas(demandas, hoje, semana.de), [demandas, hoje, semana]);

  const ocorrenciasHoje = useMemo(
    () => (rotina ? ocorrenciasNoPeriodo(rotina.rotinas, rotina.execucoes, hoje, hoje) : []),
    [rotina, hoje],
  );
  const pipelineRotina = useMemo(() => {
    if (!rotina) return [];
    const ocorrencias = periodo === "hoje" ? ocorrenciasHoje : ocorrenciasNoPeriodo(rotina.rotinas, rotina.execucoes, semana.de, semana.ate);
    return montarPipelineSetores(rotina.setores, ocorrencias);
  }, [rotina, periodo, ocorrenciasHoje, semana]);
  const setorRotinaAberto = pipelineRotina.find(s => s.id === setorAberto) ?? null;

  const lista = useMemo(() => {
    if (selecao) return demandas.filter(d => selecao.ids.includes(d.id));
    let base: Demanda[];
    switch (aba) {
      case "atrasadas": base = numeros.atrasadas; break;
      case "vencem": base = numeros.vencem; break;
      case "andamento": base = numeros.abertas.filter(d => d.status === "fazendo"); break;
      case "pendentes": base = numeros.abertas.filter(d => d.status === "a_fazer"); break;
      case "revisao": base = numeros.abertas.filter(d => d.status === "revisao" || d.status === "aprovado"); break;
      default: base = numeros.concluidasSemana;
    }
    return base
      .filter(d => pessoaFiltro === TODOS || d.assigned_to === pessoaFiltro)
      .filter(d => !categoriaFiltro || d.categoria === categoriaFiltro)
      .sort((a, b) => aba === "concluidas"
        ? (b.concluida_at ?? "").localeCompare(a.concluida_at ?? "")
        : `${a.prazo ?? "9999"}${a.prazo_hora ?? ""}`.localeCompare(`${b.prazo ?? "9999"}${b.prazo_hora ?? ""}`));
  }, [selecao, demandas, aba, numeros, pessoaFiltro, categoriaFiltro]);

  // Abre na primeira aba com algo dentro: atrasada pesa mais que pendente.
  const abaEscolhida = useRef(false);
  useEffect(() => {
    if (loading || abaEscolhida.current) return;
    abaEscolhida.current = true;
    const contagem: Record<Aba, number> = {
      atrasadas: numeros.atrasadas.length,
      vencem: numeros.vencem.length,
      andamento: numeros.abertas.filter(d => d.status === "fazendo").length,
      pendentes: numeros.abertas.filter(d => d.status === "a_fazer").length,
      revisao: numeros.abertas.filter(d => d.status === "revisao" || d.status === "aprovado").length,
      concluidas: numeros.concluidasSemana.length,
    };
    const primeira = ABAS.find(a => contagem[a.id] > 0);
    if (primeira) setAba(primeira.id);
  }, [loading, numeros]);

  // Link de notificacao: ?demanda= abre a demanda, ?registrar= a reuniao concluida.
  const idAberta = params.get("demanda");
  const aberta = idAberta ? demandas.find(d => d.id === idAberta) ?? null : null;
  const registrar = params.get("registrar");
  useEffect(() => {
    if (!registrar || loading) return;
    const reuniao = demandas.find(d => d.id === registrar);
    if (reuniao) abrirRegistro(reuniao);
    setParams(p => { p.delete("registrar"); return p; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrar, loading]);

  function abrirDemanda(id: string | null) {
    setParams(p => {
      if (id) p.set("demanda", id); else p.delete("demanda");
      return p;
    }, { replace: !id });
  }

  function abrirRegistro(reuniao: Pick<Demanda, "titulo" | "client_id" | "prazo" | "prazo_hora">) {
    setRegistro({
      inicial: {
        client_id: reuniao.client_id,
        descricao: `Combinado na reunião "${reuniao.titulo}"${reuniao.prazo ? ` de ${rotuloPrazo(reuniao)}` : ""}.`,
      },
      descricao: `Cada combinado da reunião "${reuniao.titulo}" vira uma demanda com dono e prazo.`,
    });
  }

  function focar(nova: Aba, opcoes: { pessoa?: string; categoria?: string | null } = {}) {
    setSelecao(null);
    setAba(nova);
    if (opcoes.pessoa !== undefined) setPessoaFiltro(opcoes.pessoa);
    if (opcoes.categoria !== undefined) setCategoriaFiltro(opcoes.categoria);
    listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function abrirGargalo(g: Gargalo) {
    if (g.demandas?.length === 1) return abrirDemanda(g.demandas[0]);
    if (g.demandas?.length) {
      setSelecao({ titulo: g.titulo, ids: g.demandas });
      listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (g.pessoa) return focar("pendentes", { pessoa: g.pessoa, categoria: null });
  }

  if (!visao || loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-96 rounded-2xl lg:col-span-2" /><Skeleton className="h-96 rounded-2xl" /></div>
      </div>
    );
  }

  const { clientes } = visao;
  const maiorCarga = Math.max(1, ...carga.map(c => c.abertas));
  const filtrosAtivos = pessoaFiltro !== TODOS || !!categoriaFiltro;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Visão da agência</h1>
            <p className="text-sm text-muted-foreground">
              {format(agora, "EEEE, d 'de' MMMM", { locale: ptBR })} · o que precisa de você hoje.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="h-10 rounded-2xl">
            <Link to="/agencia/automacoes"><Bot className="mr-1.5 h-4 w-4" /> Central de automações</Link>
          </Button>
          <SinoAtencao visao={visao} />
        </div>
      </div>

      {/* ── Indicadores ─────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
          titulo="Demandas pendentes"
          valor={String(numeros.abertas.length)}
          detalhe={`${numeros.abertas.filter(d => d.status === "fazendo").length} em andamento · ${ocorrenciasHoje.filter(o => o.status !== "concluida").length} rotina${ocorrenciasHoje.filter(o => o.status !== "concluida").length === 1 ? "" : "s"} hoje`}
          onClick={() => focar("pendentes")}
          ativo={!selecao && aba === "pendentes"}
        />
        <Kpi
          icon={CalendarX2}
          titulo="Atrasadas"
          valor={String(numeros.atrasadas.length)}
          detalhe={numeros.atrasadas.length > 0 ? "Prazo passou sem entrega" : "Tudo dentro do prazo"}
          alerta={numeros.atrasadas.length > 0}
          onClick={() => focar("atrasadas")}
          ativo={!selecao && aba === "atrasadas"}
        />
        <Kpi
          icon={CheckCircle2}
          titulo="Concluídas na semana"
          valor={String(numeros.concluidasSemana.length)}
          detalhe={`desde ${semana.de.slice(8, 10)}/${semana.de.slice(5, 7)}`}
          onClick={() => focar("concluidas")}
          ativo={!selecao && aba === "concluidas"}
        />
        <Kpi
          icon={Clock}
          titulo="Vencem em 48h"
          valor={String(numeros.vencem.length)}
          detalhe={`${numeros.vencem.filter(d => d.prazo === hoje).length} hoje · ${numeros.vencem.filter(d => d.prazo === amanha).length} amanhã`}
          onClick={() => focar("vencem")}
          ativo={!selecao && aba === "vencem"}
        />
        <Kpi
          icon={Gauge}
          titulo="Carga da equipe"
          valor={sobrecarregados.length ? `${sobrecarregados.length} acima` : "Equilibrada"}
          detalhe={sobrecarregados.length ? sobrecarregados.slice(0, 2).map(c => nomeDe(c.pessoa)).join(", ") : `${carga.filter(c => c.pessoa).length} pessoas com demanda aberta`}
          alerta={sobrecarregados.length > 0}
          onClick={() => document.getElementById("carga-equipe")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
        <Kpi
          icon={CalendarClock}
          titulo="Reuniões agendadas"
          valor={String(numeros.reunioesProximas.length)}
          detalhe={`${numeros.reunioesHoje} hoje · até domingo`}
          onClick={() => document.getElementById("reunioes")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
        <Kpi
          icon={AlertTriangle}
          titulo="Clientes pedindo atenção"
          valor={String(visao.atencao.length)}
          detalhe={visao.atencao.length ? visao.atencao.slice(0, 2).map(c => c.name).join(", ") : "Nenhum agora"}
          alerta={visao.atencao.some(c => c.motivos.includes("fatura_vencida") || c.motivos.includes("custo_acima"))}
          onClick={() => document.getElementById("gargalos")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Centro: demandas prioritarias e equipe ─────────────────── */}
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card ref={listaRef} className="scroll-mt-20 shadow-card">
            <CardHeader className="space-y-3 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base"><ListTodo className="h-4 w-4 text-primary" /> Demandas prioritárias</CardTitle>
                <Select value={pessoaFiltro} onValueChange={v => { setSelecao(null); setPessoaFiltro(v); }}>
                  <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Toda a equipe</SelectItem>
                    {pessoas.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selecao ? (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{selecao.titulo}</span>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => setSelecao(null)}><X className="mr-1 h-3.5 w-3.5" /> Limpar</Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {ABAS.map(a => {
                    const n = a.id === "atrasadas" ? numeros.atrasadas.length
                      : a.id === "vencem" ? numeros.vencem.length
                      : a.id === "concluidas" ? numeros.concluidasSemana.length
                      : a.id === "andamento" ? numeros.abertas.filter(d => d.status === "fazendo").length
                      : a.id === "pendentes" ? numeros.abertas.filter(d => d.status === "a_fazer").length
                      : numeros.abertas.filter(d => d.status === "revisao" || d.status === "aprovado").length;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAba(a.id)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${aba === a.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                      >
                        {a.label} <span className="tabular-nums opacity-70">{n}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {filtrosAtivos && !selecao && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  Filtrando:
                  {pessoaFiltro !== TODOS && <Badge variant="secondary">{nomeDe(pessoaFiltro)}</Badge>}
                  {categoriaFiltro && <Badge variant="secondary">{categoriaLabel(categoriaFiltro)}</Badge>}
                  <button type="button" className="hover:text-foreground" onClick={() => { setPessoaFiltro(TODOS); setCategoriaFiltro(null); }}>limpar</button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {lista.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {aba === "atrasadas" && !selecao ? "Nenhuma demanda atrasada. 🎉" : "Nada aqui."}
                </p>
              ) : (
                <div className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
                  {lista.slice(0, 60).map(d => {
                    const atrasada = atrasadaAgora(d);
                    const status = statusMeta(d.status);
                    const cliente = nomeCliente(d.client_id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => abrirDemanda(d.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border border-l-4 bg-card/60 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 ${atrasada ? "border-l-red-500" : d.prazo === hoje ? "border-l-amber-500" : "border-l-transparent"}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`truncate text-sm font-medium ${d.status === "concluida" ? "text-muted-foreground line-through" : ""}`}>{d.titulo}</span>
                            {d.aguardando_cliente && <Badge variant="outline" className="shrink-0 border-amber-500/40 px-1.5 py-0 text-[10px] text-amber-500">aguardando cliente</Badge>}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span>{nomeDe(d.assigned_to)}</span>
                            {cliente && <span>{cliente}</span>}
                            <span>{categoriaLabel(d.categoria)}</span>
                            <span className={atrasada ? "font-medium text-red-500" : ""}>
                              {d.status === "concluida" && d.concluida_at ? `entregue ${format(new Date(d.concluida_at), "dd/MM")}` : rotuloPrazo(d)}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] ring-1 ${status.cor}`}>{status.label}</span>
                          <span className={`text-[10px] ${prioridadeMeta(d.prioridade).cor.split(" ")[0]}`}>{prioridadeMeta(d.prioridade).label}</span>
                        </div>
                      </button>
                    );
                  })}
                  {lista.length > 60 && <p className="pt-1 text-center text-xs text-muted-foreground">+{lista.length - 60} — veja todas em <Link to="/demandas" className="text-primary hover:underline">Demandas</Link></p>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card id="carga-equipe" className="scroll-mt-20 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Gauge className="h-4 w-4 text-primary" /> Carga da equipe</CardTitle>
              <p className="text-xs text-muted-foreground">Demandas abertas por responsável. Clique para ver as dela.</p>
            </CardHeader>
            <CardContent>
              {carga.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Ninguém com demanda aberta.</p>
              ) : (
                <div className="space-y-1">
                  {carga.map(c => {
                    const acima = !!c.pessoa && (c.abertas > LIMITE_ABERTAS || c.atrasadas >= LIMITE_ATRASADAS);
                    return (
                      <button
                        key={c.pessoa ?? "sem"}
                        type="button"
                        onClick={() => focar("pendentes", { pessoa: c.pessoa ?? TODOS, categoria: null })}
                        className="grid w-full grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted/40"
                      >
                        <span className={`truncate text-sm ${acima ? "font-semibold text-destructive" : ""}`}>{nomeDe(c.pessoa)}</span>
                        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                          <div className="bg-red-500" style={{ width: `${(c.atrasadas / maiorCarga) * 100}%` }} />
                          <div className="bg-amber-500" style={{ width: `${(c.vencemLogo / maiorCarga) * 100}%` }} />
                          <div className="bg-primary/60" style={{ width: `${((c.abertas - c.atrasadas - c.vencemLogo) / maiorCarga) * 100}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {c.abertas}{c.atrasadas > 0 && <span className="text-red-500"> · {c.atrasadas} atras.</span>}
                        </span>
                      </button>
                    );
                  })}
                  <div className="flex flex-wrap gap-3 px-2 pt-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> atrasadas</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> vencem hoje/amanhã</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary/60" /> demais</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Lateral: gargalos, reunioes e mural ─────────────────────── */}
        <div className="min-w-0 space-y-6">
          <Card id="gargalos" className="scroll-mt-20 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" /> Gargalos e recomendações</CardTitle>
              <p className="text-xs text-muted-foreground">O que está travando a operação, o impacto e o que fazer.</p>
            </CardHeader>
            <CardContent>
              {gargalos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum gargalo identificado. Operação fluindo.</p>
              ) : (
                <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                  {gargalos.map(g => (
                    <div key={g.id} className={`rounded-xl border border-l-4 bg-card/60 p-3 ${COR_GRAVIDADE[g.gravidade]}`}>
                      <div className="text-sm font-medium leading-snug">{g.titulo}</div>
                      <p className="mt-1 text-xs text-muted-foreground"><strong className="font-medium text-foreground/80">Impacto:</strong> {g.impacto}</p>
                      <p className="mt-1 text-xs text-muted-foreground"><strong className="font-medium text-foreground/80">Sugestão:</strong> {g.sugestao}</p>
                      <div className="mt-2 flex gap-1.5">
                        {(g.demandas?.length || g.pessoa) && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => abrirGargalo(g)}>
                            {g.demandas?.length === 1 ? "Abrir demanda" : "Ver demandas"}
                          </Button>
                        )}
                        {g.link && <Button asChild size="sm" variant="ghost" className="h-7 text-xs"><Link to={g.link}>Abrir <ArrowRight className="ml-1 h-3 w-3" /></Link></Button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card id="reunioes" className="scroll-mt-20 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4 text-primary" /> Reuniões</CardTitle>
              <p className="text-xs text-muted-foreground">
                Agendadas até domingo{reunioesTabela !== null && <> · <Link to="/reunioes" className="text-primary hover:underline">abrir Reuniões</Link></>}
              </p>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {numeros.reunioesProximas.length === 0 && numeros.reunioesFeitas.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma reunião marcada.</p>
              )}
              {numeros.reunioesProximas.map(r => {
                const conteudo = (
                  <>
                    <div className="w-12 shrink-0 text-center">
                      <div className="text-[10px] uppercase text-muted-foreground">{r.dia === hoje ? "hoje" : format(new Date(`${r.dia}T12:00:00`), "EEE", { locale: ptBR })}</div>
                      <div className="text-sm font-semibold tabular-nums">{r.hora ?? "—"}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{r.titulo}</div>
                      <div className="truncate text-xs text-muted-foreground">{[nomeCliente(r.client_id), r.quem && nomeDe(r.quem)].filter(Boolean).join(" · ")}</div>
                    </div>
                  </>
                );
                const classe = "flex w-full items-center gap-3 rounded-xl border bg-card/60 px-3 py-2 text-left hover:bg-muted/40";
                return r.origem === "reuniao"
                  ? <Link key={r.id} to={`/reunioes?reuniao=${r.id}`} className={classe}>{conteudo}</Link>
                  : <button key={r.id} type="button" onClick={() => abrirDemanda(r.id)} className={classe}>{conteudo}</button>;
              })}
              {numeros.reunioesFeitas.length > 0 && (
                <div className="space-y-1.5 border-t pt-2">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Feitas — registre o que saiu delas</div>
                  {numeros.reunioesFeitas.slice(0, 4).map(r => (
                    <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl px-1 py-1">
                      <div className="min-w-0">
                        <div className="truncate text-sm">{r.titulo}</div>
                        <div className="truncate text-xs text-muted-foreground">{nomeCliente(r.client_id) ?? "Interna"}</div>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => abrirRegistro({ titulo: r.titulo, client_id: r.client_id, prazo: r.dia, prazo_hora: r.hora })}>
                        <NotebookPen className="mr-1 h-3.5 w-3.5" /> Registrar tarefas
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <MuralEquipe nomeDe={nomeDe} clientes={clientesDaCarteira} clientePorId={clientePorId} />
        </div>
      </div>

      {/* ── Pipeline por setor ───────────────────────────────────────── */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Layers className="h-4 w-4 text-primary" /> Pipeline por setor</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {pipelineDe === "demandas" ? "Fila de Demandas por área e responsável. Clique num setor para ver as demandas dele." : "Demandas fixas e recorrentes de cada área, cadastradas na Rotina."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex rounded-xl border p-0.5">
              {(["demandas", "rotina"] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPipelineDe(p)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${pipelineDe === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {p === "demandas" ? "Demandas" : "Rotina"}
                </button>
              ))}
            </div>
            {pipelineDe === "rotina" && (
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
            )}
          </div>
        </CardHeader>
        <CardContent>
          {pipelineDe === "demandas" ? (
            pipelineDemandas.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma demanda aberta ou entregue nesta semana.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {pipelineDemandas.map(s => {
                  const total = s.aFazer + s.andamento + s.revisao + s.concluidasSemana || 1;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => focar(s.atrasadas ? "atrasadas" : "pendentes", { categoria: s.id, pessoa: TODOS })}
                      className={`group flex flex-col gap-3 rounded-2xl border bg-card/60 p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 ${s.atrasadas ? "border-destructive/40" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{s.nome}</div>
                          <div className={`text-xs ${s.atrasadas ? "text-destructive" : "text-muted-foreground"}`}>
                            {s.atrasadas ? `${s.atrasadas} atrasada${s.atrasadas === 1 ? "" : "s"}` : `${s.abertas} aberta${s.abertas === 1 ? "" : "s"}`}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                        <div className="bg-slate-400" style={{ width: `${(s.aFazer / total) * 100}%` }} />
                        <div className="bg-blue-500" style={{ width: `${(s.andamento / total) * 100}%` }} />
                        <div className="bg-amber-500" style={{ width: `${(s.revisao / total) * 100}%` }} />
                        <div className="bg-emerald-500" style={{ width: `${(s.concluidasSemana / total) * 100}%` }} />
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-center">
                        {[
                          { rotulo: "A fazer", valor: s.aFazer, classe: "" },
                          { rotulo: "Fazendo", valor: s.andamento, classe: "text-blue-500" },
                          { rotulo: "Revisão", valor: s.revisao, classe: "text-amber-500" },
                          { rotulo: "Semana", valor: s.concluidasSemana, classe: "text-emerald-500" },
                        ].map(c => (
                          <div key={c.rotulo} className="rounded-xl bg-muted/40 px-0.5 py-1.5">
                            <div className={`text-base font-semibold tabular-nums ${c.classe}`}>{c.valor}</div>
                            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{c.rotulo}</div>
                          </div>
                        ))}
                      </div>
                      <div className="flex min-h-7 items-center"><Avatares ids={s.responsaveis} nomeDe={nomeDe} /></div>
                    </button>
                  );
                })}
              </div>
            )
          ) : !rotina ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
          ) : pipelineRotina.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhum setor cadastrado. <Link to="/rotina" className="text-primary hover:underline">Crie as equipes na Rotina</Link>.
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {pipelineRotina.map(setor => (
                  <CardSetorRotina key={setor.id} setor={setor} nomeDe={nomeDe} onAbrir={() => setSetorAberto(setor.id)} />
                ))}
              </div>
              {pipelineRotina.every(s => s.total === 0) && (
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Nenhuma demanda fixa {periodo === "hoje" ? "para hoje" : "nesta semana"}.{" "}
                  <Link to="/rotina" className="text-primary hover:underline">Cadastrar na Rotina</Link>
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!setorRotinaAberto} onOpenChange={v => !v && setSetorAberto(null)}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          {setorRotinaAberto && (
            <>
              <SheetHeader className="border-b p-5 text-left">
                <SheetTitle>{setorRotinaAberto.nome}</SheetTitle>
                <SheetDescription>
                  {periodo === "hoje" ? "Hoje" : "Esta semana"} · {setorRotinaAberto.pendente} pendente{setorRotinaAberto.pendente === 1 ? "" : "s"} · {setorRotinaAberto.andamento} em andamento · {setorRotinaAberto.concluida} concluída{setorRotinaAberto.concluida === 1 ? "" : "s"}
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
                {setorRotinaAberto.ocorrencias.length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">Nada programado para este setor.</p>
                )}
                {setorRotinaAberto.ocorrencias.map((o, i) => {
                  const status = STATUS_OCORRENCIA.find(s => s.id === o.status) ?? STATUS_OCORRENCIA[0];
                  const novoDia = periodo === "semana" && (i === 0 || setorRotinaAberto.ocorrencias[i - 1].dia !== o.dia);
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
                          {o.rotina.client_id && nomeCliente(o.rotina.client_id) && <span>{nomeCliente(o.rotina.client_id)}</span>}
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
                  <Link to={setorRotinaAberto.id === SEM_SETOR ? "/rotina" : `/rotina?equipe=${setorRotinaAberto.id}`}>
                    Abrir na Rotina <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <DemandaDetalhe
        demanda={aberta}
        onClose={() => abrirDemanda(null)}
        onChange={substituir}
        onDelete={id => { remover(id); abrirDemanda(null); toast.success("Demanda excluída"); }}
        clientesDaCarteira={clientesDaCarteira}
        clientePorId={clientePorId}
        pessoas={pessoas}
        pessoaPorId={pessoaPorId}
      />

      <NovaDemandaDialog
        open={!!registro}
        onOpenChange={v => !v && setRegistro(null)}
        onCreated={d => { setDemandas(atual => [...atual, d]); toast.success("Tarefa da reunião registrada"); }}
        clientes={clientesDaCarteira}
        pessoas={pessoas}
        inicial={registro?.inicial}
        descricaoDialogo={registro?.descricao}
      />

      {isAdmin && (
        <p className="text-center text-xs text-muted-foreground">
          <CalendarCheck className="mr-1 inline h-3.5 w-3.5" />
          Avisos de prazo, atrasos, reuniões e resumo diário saem sozinhos. Ajuste em{" "}
          <Link to="/agencia/automacoes" className="text-primary hover:underline">Central de automações</Link>.
        </p>
      )}
    </div>
  );
}
