import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlarmClock, CalendarCheck, Search, User as UserIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Pessoa } from "@/hooks/useDemandas";
import { CANAIS_LEAD, type Etapa, type Lead, followUpPendente, posicaoEntre } from "@/lib/comercial";

const TODOS = "todos";
const MEUS = "meus";
const FILA = "fila";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function Pipeline({ etapas, leads, pessoaPorId, pessoas, meuId, onAbrir, onMover }: {
  etapas: Etapa[];
  leads: Lead[];
  pessoas: Pessoa[];
  pessoaPorId: Map<string, Pessoa>;
  meuId: string | undefined;
  onAbrir: (l: Lead) => void;
  /** Soltar na coluna: nova etapa e posicao; quem chama decide o que fazer com perdido. */
  onMover: (l: Lead, etapa: Etapa, posicao: number) => void;
}) {
  const [busca, setBusca] = useState("");
  const [dono, setDono] = useState(TODOS);
  const [arrastando, setArrastando] = useState<string | null>(null);

  const colunas = useMemo(() => [...etapas].sort((a, b) => a.posicao - b.posicao), [etapas]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return leads.filter(l => {
      if (dono === MEUS && l.responsavel_id !== meuId && l.closer_id !== meuId) return false;
      if (dono === FILA && l.responsavel_id) return false;
      if (dono !== TODOS && dono !== MEUS && dono !== FILA && l.responsavel_id !== dono && l.closer_id !== dono) return false;
      if (!termo) return true;
      return [l.contato_nome, l.empresa, l.cidade, l.segmento, l.instagram].some(v => v?.toLowerCase().includes(termo));
    });
  }, [leads, busca, dono, meuId]);

  function soltar(etapa: Etapa, antesDe: Lead | null) {
    const lead = leads.find(l => l.id === arrastando);
    setArrastando(null);
    if (!lead) return;
    const coluna = visiveis.filter(l => l.etapa_id === etapa.id && l.id !== lead.id).sort((a, b) => a.posicao - b.posicao);
    const i = antesDe ? coluna.findIndex(l => l.id === antesDe.id) : coluna.length;
    const posicao = posicaoEntre(coluna[i - 1]?.posicao ?? null, coluna[i]?.posicao ?? null);
    if (lead.etapa_id === etapa.id && lead.posicao === posicao) return;
    onMover(lead, etapa, posicao);
  }

  function cartao(l: Lead) {
    const resp = l.responsavel_id ? pessoaPorId.get(l.responsavel_id) : null;
    const pendente = followUpPendente(l);
    return (
      <button
        key={l.id}
        type="button"
        draggable
        onDragStart={() => setArrastando(l.id)}
        onDragEnd={() => setArrastando(null)}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.stopPropagation(); const etapa = colunas.find(c => c.id === l.etapa_id); if (etapa) soltar(etapa, l); }}
        onClick={() => onAbrir(l)}
        className={`w-full rounded-2xl border border-border/60 bg-card/60 p-3 text-left transition-colors hover:border-border hover:bg-card ${arrastando === l.id ? "opacity-40" : ""}`}
      >
        <div className="text-sm font-medium leading-snug">{l.empresa || l.contato_nome}</div>
        {l.empresa && <div className="truncate text-xs text-muted-foreground">{l.contato_nome}</div>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="text-[10px] font-normal">{CANAIS_LEAD.find(c => c.id === l.canal)?.label.split(" (")[0] ?? l.canal}</Badge>
          {l.valor_estimado ? <Badge variant="outline" className="text-[10px]">{brl(l.valor_estimado)}</Badge> : null}
          {pendente && (
            <Badge variant="destructive" className="gap-1 text-[10px]"><AlarmClock className="h-3 w-3" /> follow-up</Badge>
          )}
          {l.reuniao_em && !l.ganho_em && !l.perdido_em && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <CalendarCheck className="h-3 w-3" /> {format(parseISO(l.reuniao_em), "dd/MM HH:mm", { locale: ptBR })}
            </Badge>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <UserIcon className="h-3 w-3" /> {resp?.nome ?? "Na fila"}
        </div>
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, empresa, cidade, segmento, @..." className="pl-9" />
        </div>
        <Select value={dono} onValueChange={setDono}>
          <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os leads</SelectItem>
            <SelectItem value={MEUS}>Meus leads</SelectItem>
            <SelectItem value={FILA}>Na fila (sem dono)</SelectItem>
            {pessoas.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {colunas.map(etapa => {
            const itens = visiveis.filter(l => l.etapa_id === etapa.id).sort((a, b) => a.posicao - b.posicao);
            const valor = itens.reduce((s, l) => s + (l.valor_estimado ?? 0), 0);
            return (
              <div
                key={etapa.id}
                className="flex w-64 shrink-0 flex-col gap-2"
                onDragOver={e => e.preventDefault()}
                onDrop={() => soltar(etapa, null)}
              >
                <div className={`rounded-xl border px-3 py-2 ${
                  etapa.tipo === "ganho" ? "border-emerald-500/30 bg-emerald-500/5"
                  : etapa.tipo === "perdido" ? "border-destructive/30 bg-destructive/5"
                  : "border-border/60 bg-card/40"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{etapa.nome}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{itens.length}</span>
                  </div>
                  {valor > 0 && <div className="text-[11px] text-muted-foreground">{brl(valor)}/mês</div>}
                </div>
                <div className="min-h-[80px] space-y-2">
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
    </div>
  );
}
