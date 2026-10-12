import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  CheckCircle2,
  FilePlus2,
  FileText,
  History,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { RelatorioEditor } from "@/components/reports/RelatorioEditor";
import { AgendamentoDialog, type AgendamentoRow } from "@/components/reports/AgendamentoDialog";
import { HistoricoAgendamento, buscarEnvios, type EnvioDoHistorico } from "@/components/reports/HistoricoAgendamento";
import { CampoBusca, casaBusca } from "@/components/CampoBusca";
import { ClientAvatar } from "@/components/ClientAvatar";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { useEstadoDaTela } from "@/hooks/useEstadoDaTela";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatReportDate } from "@/lib/report-date";
import { descreverCron, periodoPadraoDaFrequencia, proximaExecucao } from "@/lib/report-agendamento";
import { descreverPeriodo, normalizarPeriodo } from "@/lib/report-periodo";
import { normalizarMetricas } from "@/lib/report-metricas";
import { errorMessage } from "@/lib/utils";

interface Client {
  id: string;
  name: string;
}

type FiltroStatus = "todos" | "ativos" | "pausados";

function tituloDoAgendamento(s: AgendamentoRow) {
  const cliente = s.clients?.name || "Cliente";
  return s.nome?.trim() ? `${s.nome.trim()} · ${cliente}` : cliente;
}

export default function ReportSchedules() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [aba, setAba] = useEstadoDaTela("relatorios:aba", "ia");
  const [busca, setBusca] = useEstadoDaTela("relatorios:agendamentos:busca", "");
  const [filtroStatus, setFiltroStatus] = useEstadoDaTela<FiltroStatus>("relatorios:agendamentos:status", "todos");

  const [schedules, setSchedules] = useState<AgendamentoRow[]>([]);
  const [envios, setEnvios] = useState<EnvioDoHistorico[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<AgendamentoRow | null>(null);
  const [clienteInicial, setClienteInicial] = useState<string | null>(null);
  const [historicoDe, setHistoricoDe] = useState<AgendamentoRow | null>(null);
  const [excluir, setExcluir] = useState<AgendamentoRow | null>(null);
  const [enviarAgora, setEnviarAgora] = useState<AgendamentoRow | null>(null);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("report_schedules")
      .select("*, clients(name, logo_url)")
      .order("created_at", { ascending: false });
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    const lista = (data as unknown as AgendamentoRow[]) || [];
    setSchedules(lista);
    setLoading(false);
    // Historico e complementar: se falhar, a lista continua de pe.
    buscarEnvios(lista.map((s) => s.id))
      .then(setEnvios)
      .catch(() => setEnvios([]));
  }, []);

  useEffect(() => {
    fetchSchedules();
    supabase
      .from("clients")
      .select("id, name")
      .order("name")
      .then(({ data }) => setClients(data || []));
  }, [fetchSchedules]);

  // Vem de Relatorios do cliente ("Agendar envio"): abre o formulario ja com ele.
  useEffect(() => {
    const cliente = searchParams.get("cliente");
    if (!cliente) return;
    setAba("agendamentos");
    setEmEdicao(null);
    setClienteInicial(cliente);
    setDialogAberto(true);
    const proximo = new URLSearchParams(searchParams);
    proximo.delete("cliente");
    setSearchParams(proximo, { replace: true });
  }, [searchParams, setSearchParams, setAba]);

  const ultimoEnvio = useMemo(() => {
    const mapa = new Map<string, { ultimo: EnvioDoHistorico; total: number }>();
    for (const e of envios) {
      if (!e.schedule_id) continue;
      const atual = mapa.get(e.schedule_id);
      if (atual) atual.total++;
      else mapa.set(e.schedule_id, { ultimo: e, total: 1 });
    }
    return mapa;
  }, [envios]);

  function novo() {
    setEmEdicao(null);
    setClienteInicial(null);
    setDialogAberto(true);
  }

  function editar(s: AgendamentoRow) {
    setEmEdicao(s);
    setClienteInicial(null);
    setDialogAberto(true);
  }

  async function toggleActive(schedule: AgendamentoRow) {
    const { error } = await supabase.from("report_schedules").update({ is_active: !schedule.is_active }).eq("id", schedule.id);
    if (error) {
      toast.error("Erro ao atualizar agendamento");
      return;
    }
    toast.success(schedule.is_active ? "Agendamento pausado" : "Agendamento reativado");
    setSchedules((prev) => prev.map((s) => (s.id === schedule.id ? { ...s, is_active: !s.is_active } : s)));
  }

  async function deleteSchedule(id: string) {
    const { error } = await supabase.from("report_schedules").delete().eq("id", id);
    setExcluir(null);
    if (error) {
      toast.error("Erro ao excluir agendamento");
      return;
    }
    toast.success("Agendamento excluído. Os relatórios já enviados continuam em Relatórios do cliente.");
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  async function dispararAgora(s: AgendamentoRow) {
    setEnviarAgora(null);
    setEnviandoId(s.id);
    try {
      const { data, error } = await supabase.functions.invoke("run-report-schedules", { body: { schedule_id: s.id } });
      if (data?.error) throw new Error(data.error);
      if (error) {
        const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(corpo?.error ?? error.message);
      }
      toast.success("Relatório enviado no WhatsApp do cliente");
    } catch (err) {
      toast.error(errorMessage(err, "Não foi possível enviar agora"));
    } finally {
      setEnviandoId(null);
      fetchSchedules();
    }
  }

  const visiveis = schedules.filter(
    (s) =>
      casaBusca(busca, s.clients?.name, s.nome) &&
      (filtroStatus === "todos" || (filtroStatus === "ativos" ? s.is_active : !s.is_active))
  );

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <FileText className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Relatórios para o cliente</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monte relatórios personalizados (ou com IA a partir dos prints), exporte em PDF e agende o envio pelo WhatsApp
          </p>
        </div>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="ia" className="gap-1.5">
            <FilePlus2 className="h-4 w-4" />
            Criar relatório
          </TabsTrigger>
          <TabsTrigger value="agendamentos" className="gap-1.5">
            <Calendar className="h-4 w-4" />
            Agendamentos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ia" className="mt-5">
          <RelatorioEditor />
        </TabsContent>

        <TabsContent value="agendamentos" className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <CampoBusca value={busca} onChange={setBusca} placeholder="Buscar cliente ou agendamento" className="min-w-0 max-w-sm flex-1" />
            <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as FiltroStatus)}>
              <SelectTrigger className="w-36 text-sm" aria-label="Filtrar por status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativos">Ativos</SelectItem>
                <SelectItem value="pausados">Pausados</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={novo} className="ml-auto">
              <Plus className="mr-2 h-4 w-4" />
              Novo agendamento
            </Button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : loadError ? (
            <div className="rounded-2xl border border-border/60 bg-card/60 p-8 text-center shadow-card">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
              <p className="font-medium">Não foi possível carregar os agendamentos</p>
              <p className="mt-1 break-words text-sm text-muted-foreground">{loadError}</p>
              <Button variant="outline" className="mt-4" onClick={fetchSchedules}>
                Tentar de novo
              </Button>
            </div>
          ) : schedules.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-border/60 bg-card/60 px-4 py-14 text-center shadow-card">
              <CalendarClock className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-medium">Nenhum agendamento configurado</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Escolha o cliente, os dias e o horário: o relatório com as métricas do período sai sozinho no WhatsApp dele.
              </p>
              <Button className="mt-4" onClick={novo}>
                <Plus className="mr-2 h-4 w-4" />
                Criar agendamento
              </Button>
            </div>
          ) : visiveis.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum agendamento encontrado com esses filtros</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {visiveis.map((s) => {
                const atualizado = s.modo === "atualizado";
                const periodo = normalizarPeriodo(s.periodo) ?? periodoPadraoDaFrequencia(s.cron);
                const qtdMetricas = normalizarMetricas(s.metricas).length;
                const proxima = s.is_active ? proximaExecucao(s.cron) : null;
                const hist = ultimoEnvio.get(s.id);
                const ultimoOk = hist && hist.ultimo.status === "ready" && hist.ultimo.sent_at;
                return (
                  <div key={s.id} className="min-w-0 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-card">
                    <div className="flex items-start gap-3">
                      <ClientAvatar name={s.clients?.name || "Cliente"} logoUrl={s.clients?.logo_url} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold" title={tituloDoAgendamento(s)}>
                            {tituloDoAgendamento(s)}
                          </p>
                          <Badge variant={s.is_active ? "default" : "secondary"}>{s.is_active ? "Ativo" : "Pausado"}</Badge>
                        </div>
                        <p className="mt-0.5 break-words text-sm text-muted-foreground">{descreverCron(s.cron)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Switch checked={s.is_active} onCheckedChange={() => toggleActive(s)} aria-label={s.is_active ? "Pausar" : "Ativar"} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ações do agendamento">
                              {enviandoId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => editar(s)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setHistoricoDe(s)}>
                              <History className="mr-2 h-4 w-4" />
                              Histórico de envios
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEnviarAgora(s)} disabled={enviandoId === s.id}>
                              <Send className="mr-2 h-4 w-4" />
                              Enviar agora
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setExcluir(s)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="gap-1 font-normal">
                        <WhatsAppIcon className="h-3 w-3 text-green-600" />
                        {atualizado ? "Dados atualizados + link" : "Reenvia o último PDF"}
                      </Badge>
                      {atualizado && (
                        <Badge variant="outline" className="font-normal">
                          {descreverPeriodo(periodo)}
                          {!normalizarPeriodo(s.periodo) && " (padrão)"}
                        </Badge>
                      )}
                      {atualizado && (
                        <Badge variant="outline" className="font-normal">
                          {qtdMetricas ? `${qtdMetricas} métricas` : "Métricas do modelo do cliente"}
                        </Badge>
                      )}
                    </div>

                    <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <p>{proxima ? `Próximo envio: ${formatReportDate(proxima.toISOString())}` : s.is_active ? "Sem próximo envio" : "Pausado"}</p>
                      {hist ? (
                        <button
                          type="button"
                          onClick={() => setHistoricoDe(s)}
                          className={`flex min-w-0 items-center gap-1 text-left hover:underline ${ultimoOk ? "" : "text-destructive"}`}
                        >
                          {ultimoOk ? <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" /> : <AlertTriangle className="h-3 w-3 shrink-0" />}
                          <span className="truncate">
                            {ultimoOk ? `Último: ${formatReportDate(hist.ultimo.sent_at)}` : "Último envio falhou"} · {hist.total}{" "}
                            {hist.total === 1 ? "envio" : "envios"}
                          </span>
                        </button>
                      ) : s.last_run_at ? (
                        <p>Último envio: {formatReportDate(s.last_run_at)}</p>
                      ) : (
                        <p>Ainda não enviou</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AgendamentoDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        clientes={clients}
        agendamento={emEdicao}
        clienteInicial={clienteInicial}
        onSalvo={fetchSchedules}
      />

      <HistoricoAgendamento
        scheduleId={historicoDe?.id ?? null}
        titulo={historicoDe ? `${tituloDoAgendamento(historicoDe)} · ${descreverCron(historicoDe.cron)}` : ""}
        onOpenChange={(aberto) => !aberto && setHistoricoDe(null)}
      />

      <AlertDialog open={!!excluir} onOpenChange={(aberto) => !aberto && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluir ? tituloDoAgendamento(excluir) : ""} deixa de receber relatórios automáticos. Para só interromper por um tempo, use o botão de
              pausar. Os relatórios já enviados continuam salvos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => excluir && deleteSchedule(excluir.id)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!enviarAgora} onOpenChange={(aberto) => !aberto && setEnviarAgora(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar agora para o cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              {enviarAgora ? tituloDoAgendamento(enviarAgora) : ""} recebe o relatório no WhatsApp neste momento, com a mesma configuração do
              agendamento. O envio fica no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => enviarAgora && dispararAgora(enviarAgora)}>Enviar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
