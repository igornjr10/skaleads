import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BellRing, Building2, CalendarDays, Clock, Loader2, Pencil, Repeat, UserRound, Users } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { ClientAvatar } from "@/components/ClientAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  STATUS_OCORRENCIA,
  descreverLembrete,
  descreverRegra,
  prioridadeDe,
  type StatusOcorrencia,
} from "@/lib/rotinas";
import { chaveOcorrencia, type Ocorrencia } from "./SemanaPipeline";

interface Props {
  oc: Ocorrencia | null;
  onFechar: () => void;
  nomeDaPessoa: (id: string) => string | undefined;
  nomeDaEquipe: (id: string) => string | undefined;
  clientePorId: Map<string, { name: string; logo_url: string | null }>;
  podeGerenciar: boolean;
  podeDarBaixa: (rotina: Ocorrencia["rotina"]) => boolean;
  lembreteEnviando: string | null;
  onStatus: (oc: Ocorrencia, status: StatusOcorrencia) => void;
  onObservacao: (oc: Ocorrencia, texto: string) => void;
  onLembrete: (oc: Ocorrencia) => void;
  onEditar: (rotina: Ocorrencia["rotina"]) => void;
}

function hora(iso: string | null | undefined) {
  return iso ? format(new Date(iso), "dd/MM 'às' HH:mm") : null;
}

function Linha({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** A demanda inteira de um dia da Rotina: o card do quadro e pequeno demais para ler. */
export function RotinaDetalhe(props: Props) {
  const { oc } = props;
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    setObservacao(oc?.execucao?.observacao ?? "");
  }, [oc?.rotina.id, oc?.dataRef, oc?.execucao?.observacao]);

  if (!oc) return <Sheet open={false} onOpenChange={() => props.onFechar()} />;

  const { rotina, execucao } = oc;
  const prioridade = prioridadeDe(rotina.prioridade);
  const status = execucao?.status ?? "pendente";
  const statusInfo = STATUS_OCORRENCIA.find((s) => s.id === status) ?? STATUS_OCORRENCIA[0];
  const liberado = props.podeDarBaixa(rotina);
  const cliente = rotina.client_id ? props.clientePorId.get(rotina.client_id) : undefined;
  const lembreteAuto = descreverLembrete(rotina);
  const enviando = props.lembreteEnviando === chaveOcorrencia(oc);
  const dia = format(parseISO(oc.coluna), "EEEE, dd 'de' MMMM", { locale: ptBR });

  return (
    <Sheet open onOpenChange={(v) => !v && props.onFechar()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className={`border-b border-l-4 p-5 text-left ${prioridade.borda}`}>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className={`text-[11px] ${prioridade.badge}`}>{prioridade.label}</Badge>
            <Badge variant="outline" className={`text-[11px] ${statusInfo.classe}`}>{statusInfo.label}</Badge>
          </div>
          <SheetTitle className="text-lg leading-snug">{rotina.titulo}</SheetTitle>
          <SheetDescription className="capitalize">{dia}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {rotina.descricao ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{rotina.descricao}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Sem descrição.</p>
          )}

          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <Linha icon={UserRound}>
              {rotina.assigned_to ? props.nomeDaPessoa(rotina.assigned_to) ?? "Equipe" : "Sem responsável"}
            </Linha>
            {cliente && (
              <Linha icon={Building2}>
                <span className="inline-flex items-center gap-1.5">
                  <ClientAvatar name={cliente.name} logoUrl={cliente.logo_url} className="h-4 w-4" />
                  {cliente.name}
                </span>
              </Linha>
            )}
            {rotina.equipe_id && props.nomeDaEquipe(rotina.equipe_id) && (
              <Linha icon={Users}>{props.nomeDaEquipe(rotina.equipe_id)}</Linha>
            )}
            <Linha icon={rotina.periodicidade === "pontual" ? CalendarDays : Repeat}>
              {rotina.periodicidade === "pontual" ? "Acontece uma vez" : descreverRegra(rotina)}
              {oc.coluna !== oc.dataRef && (
                <span className="text-muted-foreground"> · remanejada de {format(parseISO(oc.dataRef), "dd/MM")}</span>
              )}
            </Linha>
            <Linha icon={Clock}>{rotina.horario_limite ? `Até ${rotina.horario_limite.slice(0, 5)}` : "Sem horário limite"}</Linha>
            <Linha icon={BellRing}>
              {lembreteAuto ? `Lembrete automático: ${lembreteAuto.toLowerCase()}` : "Sem lembrete automático"}
              {execucao?.lembrete_auto_at && (
                <div className="text-xs text-muted-foreground">Automático enviado {hora(execucao.lembrete_auto_at)}</div>
              )}
              {execucao?.lembrete_wa_at && (
                <div className="text-xs text-muted-foreground">Lembrete manual enviado {hora(execucao.lembrete_wa_at)}</div>
              )}
            </Linha>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} disabled={!liberado} onValueChange={(v) => props.onStatus(oc, v as StatusOcorrencia)}>
              <SelectTrigger className={statusInfo.classe}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OCORRENCIA.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!liberado && <p className="text-xs text-muted-foreground">Só o responsável ou um ADM muda o status.</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rotina-observacao">Observação deste dia</Label>
            <Textarea
              id="rotina-observacao"
              rows={3}
              value={observacao}
              disabled={!liberado}
              placeholder="O que foi feito, o que ficou faltando"
              onChange={(e) => setObservacao(e.target.value)}
              onBlur={() => observacao !== (execucao?.observacao ?? "") && props.onObservacao(oc, observacao.trim())}
            />
          </div>
        </div>

        <div className="flex gap-2 border-t p-4">
          {rotina.assigned_to && (
            <Button variant="outline" className="flex-1" disabled={enviando} onClick={() => props.onLembrete(oc)}>
              {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WhatsAppIcon className="mr-2 h-4 w-4 text-green-500" />}
              Lembrar agora
            </Button>
          )}
          {props.podeGerenciar && (
            <Button variant="outline" className="flex-1" onClick={() => props.onEditar(rotina)}>
              <Pencil className="mr-2 h-4 w-4" /> Editar
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
