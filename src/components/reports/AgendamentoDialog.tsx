import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/SearchableSelect";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { errorMessage } from "@/lib/utils";
import {
  AGENDA_PADRAO,
  DIAS_DA_SEMANA,
  cronValido,
  descreverCron,
  lerCron,
  montarCron,
  periodoPadraoDaFrequencia,
  proximaExecucao,
  type Agenda,
  type Frequencia,
} from "@/lib/report-agendamento";
import { descreverPeriodo, normalizarPeriodo, periodoDoModelo, type PeriodoSpec } from "@/lib/report-periodo";
import { METRICAS, metricasDoModelo, normalizarMetricas, type MetricaRelatorio } from "@/lib/report-metricas";
import { formatReportDate } from "@/lib/report-date";
import { SeletorDeMetricas } from "./SeletorDeMetricas";
import { SeletorDePeriodo } from "./SeletorDePeriodo";

export interface AgendamentoRow {
  id: string;
  client_id: string;
  cron: string;
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
  nome?: string | null;
  modo?: string | null;
  periodo?: Json | null;
  metricas?: Json | null;
  mensagem?: string | null;
  clients: { name: string; logo_url?: string | null } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientes: Array<{ id: string; name: string }>;
  /** Linha em edicao; ausente = novo agendamento. */
  agendamento?: AgendamentoRow | null;
  clienteInicial?: string | null;
  onSalvo: () => void;
}

const FREQUENCIAS: Array<{ valor: Frequencia; label: string }> = [
  { valor: "diaria", label: "Diária" },
  { valor: "semanal", label: "Semanal (escolher dias)" },
  { valor: "quinzenal", label: "Quinzenal (dias 1 e 15)" },
  { valor: "mensal", label: "Mensal (escolher dias do mês)" },
  { valor: "personalizada", label: "Personalizada (cron)" },
];

const HORAS = Array.from({ length: 24 }, (_, h) => h);
const DIAS_DO_MES = Array.from({ length: 31 }, (_, i) => i + 1);
const METRICAS_DO_BANCO = new Set(METRICAS.filter((m) => m.noBanco).map((m) => m.key));
const METRICAS_INICIAIS: MetricaRelatorio[] = ["spend", "impressions", "clicks", "ctr", "results", "costPerResult"];

function erroDeColuna(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column/i.test(error.message ?? "");
}

export function AgendamentoDialog({ open, onOpenChange, clientes, agendamento, clienteInicial, onSalvo }: Props) {
  const editando = Boolean(agendamento);
  const [clienteId, setClienteId] = useState("");
  const [nome, setNome] = useState("");
  const [agenda, setAgenda] = useState<Agenda>(AGENDA_PADRAO);
  const [modo, setModo] = useState<"atualizado" | "ultimo_pdf">("atualizado");
  const [periodoProprio, setPeriodoProprio] = useState(false);
  const [periodo, setPeriodo] = useState<PeriodoSpec>({ tipo: "ultimos_dias", dias: 7 });
  const [metricasProprias, setMetricasProprias] = useState(false);
  const [metricas, setMetricas] = useState<MetricaRelatorio[]>(METRICAS_INICIAIS);
  const [mensagem, setMensagem] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [infoCliente, setInfoCliente] = useState<{ modelo: unknown; temWhatsapp: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    const a = agendamento;
    setClienteId(a?.client_id ?? clienteInicial ?? "");
    setNome(a?.nome ?? "");
    setAgenda(a ? lerCron(a.cron) : AGENDA_PADRAO);
    // Linha antiga (modo null) reenvia o ultimo PDF; nova comeca no modo atualizado.
    setModo(a ? (a.modo === "atualizado" ? "atualizado" : "ultimo_pdf") : "atualizado");
    const p = normalizarPeriodo(a?.periodo);
    setPeriodoProprio(Boolean(p));
    setPeriodo(p ?? { tipo: "ultimos_dias", dias: 7 });
    const m = normalizarMetricas(a?.metricas);
    setMetricasProprias(m.length > 0);
    setMetricas(m.length ? m : METRICAS_INICIAIS);
    setMensagem(a?.mensagem ?? "");
    setAtivo(a?.is_active ?? true);
  }, [open, agendamento, clienteInicial]);

  useEffect(() => {
    if (!open || !clienteId) {
      setInfoCliente(null);
      return;
    }
    let ativoEfeito = true;
    supabase
      .from("clients")
      .select("report_template, whatsapp_number, whatsapp_group_jid")
      .eq("id", clienteId)
      .maybeSingle()
      .then(({ data }) => {
        if (!ativoEfeito) return;
        setInfoCliente({
          modelo: data?.report_template ?? null,
          temWhatsapp: Boolean(data?.whatsapp_number || data?.whatsapp_group_jid),
        });
      });
    return () => {
      ativoEfeito = false;
    };
  }, [open, clienteId]);

  const cron = montarCron(agenda);
  const cronOk = cronValido(cron);
  const proxima = useMemo(() => (cronOk ? proximaExecucao(cron) : null), [cron, cronOk]);

  const metricasDoCliente = useMemo(() => {
    const doModelo = metricasDoModelo(infoCliente?.modelo)?.filter((k) => METRICAS_DO_BANCO.has(k));
    return doModelo?.length ? doModelo : null;
  }, [infoCliente]);
  const periodoDoCliente = useMemo(() => periodoDoModelo(infoCliente?.modelo), [infoCliente]);

  function mudarFrequencia(f: Frequencia) {
    setAgenda((a) => ({ ...a, frequencia: f, cron: f === "personalizada" ? a.cron || montarCron(a) : a.cron }));
  }

  function alternarDiaSemana(d: number) {
    setAgenda((a) => ({ ...a, diasSemana: a.diasSemana.includes(d) ? a.diasSemana.filter((x) => x !== d) : [...a.diasSemana, d] }));
  }

  function alternarDiaMes(d: number) {
    setAgenda((a) => ({ ...a, diasMes: a.diasMes.includes(d) ? a.diasMes.filter((x) => x !== d) : [...a.diasMes, d] }));
  }

  async function salvar() {
    if (!clienteId) return toast.error("Selecione o cliente");
    if (!cronOk) return toast.error("Frequência inválida: confira os dias ou a expressão cron");
    if (agenda.frequencia === "semanal" && agenda.diasSemana.length === 0) return toast.error("Marque ao menos um dia da semana");
    if (agenda.frequencia === "mensal" && agenda.diasMes.length === 0) return toast.error("Marque ao menos um dia do mês");

    setSalvando(true);
    try {
      const legado = { client_id: clienteId, cron, is_active: ativo };
      const completo = {
        ...legado,
        nome: nome.trim() || null,
        modo,
        periodo: modo === "atualizado" && periodoProprio ? (periodo as unknown as Json) : null,
        metricas: modo === "atualizado" && metricasProprias && metricas.length ? (metricas as unknown as Json) : null,
        mensagem: mensagem.trim() || null,
        updated_at: new Date().toISOString(),
      };

      let error;
      if (agendamento) {
        ({ error } = await supabase.from("report_schedules").update(completo).eq("id", agendamento.id));
        if (erroDeColuna(error)) {
          ({ error } = await supabase.from("report_schedules").update(legado).eq("id", agendamento.id));
          if (!error) toast.warning("Salvo só frequência e cliente: falta aplicar a migration de relatórios personalizados no banco");
        }
      } else {
        const { data: sessao } = await supabase.auth.getSession();
        const tenantId = sessao.session?.user.id;
        if (!tenantId) throw new Error("Sessão expirada. Entre de novo.");
        ({ error } = await supabase.from("report_schedules").insert({ ...completo, tenant_id: tenantId }));
        if (erroDeColuna(error)) {
          ({ error } = await supabase.from("report_schedules").insert({ ...legado, tenant_id: tenantId }));
          if (!error) toast.warning("Criado no modo antigo (reenvio do último PDF): falta aplicar a migration de relatórios personalizados no banco");
        }
      }
      if (error) throw error;

      toast.success(editando ? "Agendamento atualizado" : "Agendamento criado");
      onOpenChange(false);
      onSalvo();
    } catch (err) {
      toast.error(errorMessage(err, "Erro ao salvar o agendamento"));
    } finally {
      setSalvando(false);
    }
  }

  const periodoEfetivo = periodoProprio ? periodo : periodoDoCliente ?? periodoPadraoDaFrequencia(cron);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
          <DialogDescription>O relatório sai sozinho no WhatsApp do cliente (número ou grupo cadastrado).</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <Label className="text-xs">Cliente</Label>
              <SearchableSelect
                options={clientes.map((c) => ({ value: c.id, label: c.name }))}
                value={clienteId}
                onChange={setClienteId}
                placeholder="Selecione o cliente"
                searchPlaceholder="Buscar cliente..."
                className="text-sm"
                disabled={editando}
              />
              {infoCliente && !infoCliente.temWhatsapp && (
                <p className="flex items-start gap-1 text-xs text-amber-500">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  Cliente sem WhatsApp ou grupo cadastrado: o envio vai falhar até cadastrar.
                </p>
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-xs" htmlFor="ag-nome">
                Nome do agendamento (opcional)
              </Label>
              <Input id="ag-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Semanal de resultados" className="text-sm" />
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border/60 p-3 sm:p-4">
            <p className="text-sm font-semibold">Quando enviar</p>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <div className="min-w-0 space-y-1">
                <Label className="text-xs">Frequência</Label>
                <Select value={agenda.frequencia} onValueChange={(v) => mudarFrequencia(v as Frequencia)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIAS.map((f) => (
                      <SelectItem key={f.valor} value={f.valor}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {agenda.frequencia !== "personalizada" && (
                <div className="min-w-0 space-y-1">
                  <Label className="text-xs">Horário</Label>
                  <Select value={String(agenda.hora)} onValueChange={(v) => setAgenda((a) => ({ ...a, hora: Number(v) }))}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HORAS.map((h) => (
                        <SelectItem key={h} value={String(h)}>
                          {String(h).padStart(2, "0")}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {agenda.frequencia === "semanal" && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dias da semana">
                {DIAS_DA_SEMANA.map((d) => {
                  const marcado = agenda.diasSemana.includes(d.valor);
                  return (
                    <Button
                      key={d.valor}
                      type="button"
                      size="sm"
                      variant={marcado ? "default" : "outline"}
                      aria-pressed={marcado}
                      className="h-8 min-w-12 px-2"
                      onClick={() => alternarDiaSemana(d.valor)}
                    >
                      {d.curto}
                    </Button>
                  );
                })}
              </div>
            )}

            {agenda.frequencia === "mensal" && (
              <div className="space-y-1">
                <div className="grid grid-cols-7 gap-1 sm:max-w-md" role="group" aria-label="Dias do mês">
                  {DIAS_DO_MES.map((d) => {
                    const marcado = agenda.diasMes.includes(d);
                    return (
                      <Button
                        key={d}
                        type="button"
                        size="sm"
                        variant={marcado ? "default" : "outline"}
                        aria-pressed={marcado}
                        className="h-8 px-0 text-xs"
                        onClick={() => alternarDiaMes(d)}
                      >
                        {d}
                      </Button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">Dia que não existe no mês (ex.: 31 em abril) é pulado.</p>
              </div>
            )}

            {agenda.frequencia === "personalizada" && (
              <div className="space-y-1">
                <Input
                  value={agenda.cron ?? ""}
                  onChange={(e) => setAgenda((a) => ({ ...a, cron: e.target.value }))}
                  placeholder="0 9 * * 1-5"
                  className="font-mono text-sm"
                  aria-label="Expressão cron"
                />
                <p className="text-[11px] text-muted-foreground">
                  minuto hora dia-do-mês mês dia-da-semana (horário de Brasília). O minuto é ignorado: o envio roda de hora em hora.
                </p>
              </div>
            )}

            <p className="break-words text-xs text-muted-foreground">
              {cronOk ? descreverCron(cron) : "Expressão inválida"}
              {proxima && ` · próximo envio ${formatReportDate(proxima.toISOString())}`}
            </p>
          </section>

          <section className="space-y-3 rounded-xl border border-border/60 p-3 sm:p-4">
            <p className="text-sm font-semibold">O que enviar</p>
            <RadioGroup value={modo} onValueChange={(v) => setModo(v as typeof modo)} className="grid gap-2 sm:grid-cols-2">
              <Label
                htmlFor="modo-atualizado"
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/60 p-3 font-normal has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5"
              >
                <RadioGroupItem id="modo-atualizado" value="atualizado" className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Relatório com dados atualizados</span>
                  <span className="block text-xs text-muted-foreground">
                    Monta na hora com o período e as métricas abaixo; o cliente recebe o resumo e o link com o PDF.
                  </span>
                </span>
              </Label>
              <Label
                htmlFor="modo-pdf"
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/60 p-3 font-normal has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5"
              >
                <RadioGroupItem id="modo-pdf" value="ultimo_pdf" className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Reenviar o último PDF gerado</span>
                  <span className="block text-xs text-muted-foreground">Manda o relatório mais recente feito à mão em Relatórios do cliente.</span>
                </span>
              </Label>
            </RadioGroup>

            {modo === "atualizado" && (
              <div className="space-y-5 pt-1">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={periodoProprio} onCheckedChange={setPeriodoProprio} />
                    Período próprio deste agendamento
                  </label>
                  {periodoProprio ? (
                    <SeletorDePeriodo value={periodo} onChange={setPeriodo} permitirIntervalo={false} legendaResumo="Se enviasse hoje: dados de" />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {periodoDoCliente ? "Do modelo do cliente" : "Pela frequência"}: {descreverPeriodo(periodoEfetivo)}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={metricasProprias} onCheckedChange={setMetricasProprias} />
                    Métricas próprias deste agendamento
                  </label>
                  {metricasProprias ? (
                    <SeletorDeMetricas value={metricas} onChange={setMetricas} somenteDoBanco />
                  ) : (
                    <p className="break-words text-xs text-muted-foreground">
                      {metricasDoCliente
                        ? `Do modelo do cliente: ${metricasDoCliente.map((k) => METRICAS.find((m) => m.key === k)?.label).join(", ")}`
                        : "O cliente não tem modelo salvo: vão investimento, impressões, cliques, CTR, resultados e custo por resultado. Salve um modelo em Relatórios do cliente."}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs" htmlFor="ag-msg">
                Mensagem do gestor (opcional)
              </Label>
              <Textarea
                id="ag-msg"
                rows={3}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Ex.: Bom dia! Segue o resumo da semana. Qualquer dúvida estou por aqui."
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Vai no começo da mensagem{modo === "atualizado" ? " e como observação no relatório" : ""}.
              </p>
            </div>
          </section>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={ativo} onCheckedChange={setAtivo} />
            {ativo ? "Ativo" : "Pausado (não envia até reativar)"}
          </label>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editando ? "Salvar alterações" : "Criar agendamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
