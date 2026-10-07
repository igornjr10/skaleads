import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, GripVertical, Loader2, Pencil, Plus, Repeat } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { ClientAvatar } from "@/components/ClientAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  STATUS_OCORRENCIA,
  descreverRegra,
  isoLocal,
  prioridadeDe,
  somarDias,
  venceEm,
  type StatusOcorrencia,
} from "@/lib/rotinas";

export interface RotinaRow {
  id: string;
  titulo: string;
  descricao: string | null;
  client_id: string | null;
  assigned_to: string | null;
  equipe_id: string | null;
  prioridade: string;
  periodicidade: string;
  dias_semana: number[] | null;
  dia_mes: number | null;
  data_pontual: string | null;
  horario_limite: string | null;
  ativa: boolean;
}

export interface ExecucaoRow {
  id: string;
  rotina_id: string;
  data_ref: string;
  done: boolean;
  status: StatusOcorrencia;
  mover_para: string | null;
  lembrete_wa_at: string | null;
  done_at: string | null;
  done_by: string | null;
  observacao: string | null;
}

export interface Ocorrencia {
  rotina: RotinaRow;
  /** Dia em que vence pela regra; a baixa e o lembrete sao gravados nele. */
  dataRef: string;
  /** Coluna onde aparece: dataRef ou o dia para onde foi remanejada. */
  coluna: string;
  execucao: ExecucaoRow | undefined;
}

const ORDEM_PRIORIDADE: Record<string, number> = { urgente: 0, moderada: 1, leve: 2 };
const ORDEM_STATUS: Record<string, number> = { andamento: 0, pendente: 1, concluida: 2 };

interface Props {
  inicioSemana: Date;
  hojeISO: string;
  rotinas: RotinaRow[];
  execPorChave: Map<string, ExecucaoRow>;
  nomeDaPessoa: (id: string) => string | undefined;
  clientePorId: Map<string, { name: string; logo_url: string | null }>;
  podeGerenciar: boolean;
  podeDarBaixa: (rotina: RotinaRow) => boolean;
  lembreteEnviando: string | null;
  onStatus: (oc: Ocorrencia, status: StatusOcorrencia) => void;
  onMover: (oc: Ocorrencia, novaData: string) => void;
  onEditar: (rotina: RotinaRow) => void;
  onNova: (dataISO: string) => void;
  onLembrete: (oc: Ocorrencia) => void;
}

export function chaveOcorrencia(oc: { rotina: { id: string }; dataRef: string }) {
  return `${oc.rotina.id}|${oc.dataRef}`;
}

export function SemanaPipeline(props: Props) {
  const { inicioSemana, rotinas, execPorChave, podeGerenciar, podeDarBaixa, onMover } = props;
  const [arrastando, setArrastando] = useState<Ocorrencia | null>(null);

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );

  const dias = useMemo(
    () => Array.from({ length: 7 }, (_, i) => somarDias(inicioSemana, i)),
    [inicioSemana]
  );

  const porColuna = useMemo(() => {
    const isos = new Set(dias.map(isoLocal));
    const mapa = new Map<string, Ocorrencia[]>(dias.map((d) => [isoLocal(d), []]));

    for (const dia of dias) {
      const dataRef = isoLocal(dia);
      for (const rotina of rotinas) {
        if (!venceEm(rotina, dia)) continue;
        const execucao = execPorChave.get(`${rotina.id}|${dataRef}`);
        const movida = execucao?.mover_para;
        const coluna = movida && isos.has(movida) ? movida : dataRef;
        mapa.get(coluna)!.push({ rotina, dataRef, coluna, execucao });
      }
    }

    for (const lista of mapa.values()) {
      lista.sort(
        (a, b) =>
          (ORDEM_STATUS[a.execucao?.status ?? "pendente"] ?? 1) - (ORDEM_STATUS[b.execucao?.status ?? "pendente"] ?? 1) ||
          (ORDEM_PRIORIDADE[a.rotina.prioridade] ?? 1) - (ORDEM_PRIORIDADE[b.rotina.prioridade] ?? 1) ||
          (a.rotina.horario_limite ?? "99").localeCompare(b.rotina.horario_limite ?? "99") ||
          a.rotina.titulo.localeCompare(b.rotina.titulo)
      );
    }
    return mapa;
  }, [dias, rotinas, execPorChave]);

  // Pontual muda a propria rotina (so ADM); recorrente remaneja so a ocorrencia,
  // o que o responsavel tambem pode.
  function podeMover(oc: Ocorrencia) {
    if (oc.rotina.periodicidade === "pontual") return podeGerenciar;
    return podeDarBaixa(oc.rotina);
  }

  function aoComecar(e: DragStartEvent) {
    setArrastando((e.active.data.current as { oc: Ocorrencia } | undefined)?.oc ?? null);
  }

  function aoSoltar(e: DragEndEvent) {
    setArrastando(null);
    const oc = (e.active.data.current as { oc: Ocorrencia } | undefined)?.oc;
    const destino = e.over?.id;
    if (!oc || typeof destino !== "string" || destino === oc.coluna) return;
    onMover(oc, destino);
  }

  return (
    <DndContext sensors={sensores} onDragStart={aoComecar} onDragEnd={aoSoltar} onDragCancel={() => setArrastando(null)}>
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <div className="grid min-w-[1120px] grid-cols-7 gap-3">
          {dias.map((dia) => {
            const iso = isoLocal(dia);
            return (
              <Coluna
                key={iso}
                dia={dia}
                iso={iso}
                ocorrencias={porColuna.get(iso) ?? []}
                podeMover={podeMover}
                {...props}
              />
            );
          })}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {arrastando && (
          <div className="w-[150px] rotate-2 opacity-90">
            <CartaoConteudo oc={arrastando} {...props} compacto />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function Coluna({
  dia,
  iso,
  ocorrencias,
  podeMover,
  ...props
}: Props & { dia: Date; iso: string; ocorrencias: Ocorrencia[]; podeMover: (oc: Ocorrencia) => boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: iso });
  const hoje = iso === props.hojeISO;
  const feitas = ocorrencias.filter((o) => o.execucao?.status === "concluida").length;

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[420px] flex-col rounded-2xl border p-2 transition-colors ${
        isOver
          ? "border-emerald-500/60 bg-emerald-500/[0.06]"
          : hoje
          ? "border-emerald-500/30 bg-card/60"
          : "border-border/60 bg-card/30"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-1 px-1">
        <div className="min-w-0">
          <div className={`text-xs font-semibold capitalize ${hoje ? "text-emerald-400" : ""}`}>
            {format(dia, "EEEE", { locale: ptBR }).replace("-feira", "")}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {format(dia, "dd/MM")} · {feitas}/{ocorrencias.length}
          </div>
        </div>
        {props.podeGerenciar && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            title="Nova demanda neste dia"
            onClick={() => props.onNova(iso)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {ocorrencias.map((oc) => (
          <Cartao key={chaveOcorrencia(oc)} oc={oc} arrastavel={podeMover(oc)} {...props} />
        ))}
        {ocorrencias.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/40 px-2 py-6 text-center text-[11px] text-muted-foreground">
            Nada para este dia
          </div>
        )}
      </div>
    </div>
  );
}

function Cartao({ oc, arrastavel, ...props }: Props & { oc: Ocorrencia; arrastavel: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: chaveOcorrencia(oc),
    data: { oc },
    disabled: !arrastavel,
  });

  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-30" : ""}>
      <CartaoConteudo oc={oc} alca={arrastavel ? { ...attributes, ...listeners } : undefined} {...props} />
    </div>
  );
}

function CartaoConteudo({
  oc,
  alca,
  compacto,
  ...props
}: Props & { oc: Ocorrencia; alca?: Record<string, unknown>; compacto?: boolean }) {
  const { rotina, execucao } = oc;
  const prioridade = prioridadeDe(rotina.prioridade);
  const status = execucao?.status ?? "pendente";
  const statusInfo = STATUS_OCORRENCIA.find((s) => s.id === status) ?? STATUS_OCORRENCIA[0];
  const responsavel = rotina.assigned_to ? props.nomeDaPessoa(rotina.assigned_to) : undefined;
  const cliente = rotina.client_id ? props.clientePorId.get(rotina.client_id) : undefined;
  const liberado = props.podeDarBaixa(rotina);
  const enviando = props.lembreteEnviando === chaveOcorrencia(oc);
  const remanejada = oc.coluna !== oc.dataRef;

  return (
    <div
      className={`group rounded-xl border border-l-4 bg-background/80 p-2.5 shadow-sm ${prioridade.borda} ${
        status === "concluida" ? "border-y-border/40 border-r-border/40 opacity-70" : "border-y-border/60 border-r-border/60"
      }`}
    >
      <div className="flex items-start gap-1">
        {alca && (
          <button
            type="button"
            {...alca}
            className="-ml-1 mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
            title="Arraste para outro dia"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <p
          className={`min-w-0 flex-1 text-[13px] font-medium leading-snug ${
            status === "concluida" ? "text-muted-foreground line-through" : ""
          }`}
        >
          {rotina.titulo}
        </p>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${prioridade.badge}`}>
          {prioridade.label}
        </Badge>
        {rotina.periodicidade !== "pontual" && (
          <Badge variant="outline" className="gap-0.5 px-1.5 py-0 text-[10px] text-muted-foreground" title={descreverRegra(rotina)}>
            <Repeat className="h-2.5 w-2.5" />
            {descreverRegra(rotina)}
          </Badge>
        )}
        {rotina.horario_limite && (
          <Badge variant="outline" className="gap-0.5 px-1.5 py-0 text-[10px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            {rotina.horario_limite.slice(0, 5)}
          </Badge>
        )}
        {remanejada && (
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-muted-foreground">
            de {oc.dataRef.slice(8, 10)}/{oc.dataRef.slice(5, 7)}
          </Badge>
        )}
      </div>

      {!compacto && (
        <>
          <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            <div className="truncate">{responsavel ?? "Sem responsável"}</div>
            {cliente && (
              <div className="flex items-center gap-1 truncate">
                <ClientAvatar name={cliente.name} logoUrl={cliente.logo_url} className="h-3.5 w-3.5" />
                <span className="truncate">{cliente.name}</span>
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center gap-1">
            <Select
              value={status}
              disabled={!liberado}
              onValueChange={(v) => props.onStatus(oc, v as StatusOcorrencia)}
            >
              <SelectTrigger className={`h-7 flex-1 rounded-lg px-2 text-[11px] ${statusInfo.classe}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OCORRENCIA.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {rotina.assigned_to && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-green-500 hover:text-green-400"
                disabled={enviando}
                title={
                  execucao?.lembrete_wa_at
                    ? `Lembrete enviado às ${format(new Date(execucao.lembrete_wa_at), "HH:mm")}. Enviar de novo`
                    : "Lembrar no WhatsApp do responsável"
                }
                onClick={() => props.onLembrete(oc)}
              >
                {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WhatsAppIcon className="h-3.5 w-3.5" />}
              </Button>
            )}

            {props.podeGerenciar && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                title="Editar demanda"
                onClick={() => props.onEditar(rotina)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
