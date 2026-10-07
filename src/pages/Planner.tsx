import { useMemo, useState } from "react";
import { addMonths, addWeeks, format, isSameMonth, isToday, subMonths, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CampoBusca, casaBusca } from "@/components/CampoBusca";
import { DemandaDetalhe } from "@/components/demandas/DemandaDetalhe";
import { NovaDemandaDialog } from "@/components/demandas/NovaDemandaDialog";
import { useAuth } from "@/hooks/useAuth";
import { useDemandas } from "@/hooks/useDemandas";
import { rotuloPapel, veTodosOsClientes } from "@/lib/permissoes";
import {
  type Demanda, agruparPorResponsavel, diasDaSemana, diasDoMes, estaAberta, estaAtrasada, hojeISO, statusMeta,
} from "@/lib/demandas";

type Visao = "mes" | "semana" | "responsavel";

const TODOS = "todos";
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export default function Planner() {
  const { role } = useAuth();
  const isAdmin = veTodosOsClientes(role);
  const {
    demandas, setDemandas, substituir, remover,
    clientesDaCarteira, clientePorId, pessoas, pessoaPorId, loading,
  } = useDemandas();

  const [visao, setVisao] = useState<Visao>("mes");
  const [ref, setRef] = useState(new Date());
  const [responsavel, setResponsavel] = useState(TODOS);
  const [aberta, setAberta] = useState<Demanda | null>(null);
  const [busca, setBusca] = useState("");
  // "" = nova demanda sem prazo; data = clique num dia do calendario.
  const [novaEm, setNovaEm] = useState<string | null>(null);

  const hoje = hojeISO();

  const filtradas = useMemo(
    () => demandas.filter(d =>
      (responsavel === TODOS || d.assigned_to === responsavel) &&
      casaBusca(busca, d.titulo, d.client_id ? clientePorId.get(d.client_id)?.name : null, d.assigned_to ? pessoaPorId.get(d.assigned_to)?.nome : null)
    ),
    [demandas, responsavel, busca, clientePorId, pessoaPorId]
  );

  const porDia = useMemo(() => {
    const mapa = new Map<string, Demanda[]>();
    for (const d of filtradas) {
      if (!d.prazo) continue;
      mapa.set(d.prazo, [...(mapa.get(d.prazo) ?? []), d]);
    }
    return mapa;
  }, [filtradas]);

  const semPrazo = filtradas.filter(d => !d.prazo && estaAberta(d));

  const grupos = useMemo(() => agruparPorResponsavel(filtradas.filter(estaAberta)), [filtradas]);
  const ordemPessoas = [...grupos.keys()].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return (pessoaPorId.get(a)?.nome ?? "").localeCompare(pessoaPorId.get(b)?.nome ?? "");
  });

  function andar(passo: 1 | -1) {
    if (visao === "semana") setRef(r => (passo > 0 ? addWeeks(r, 1) : subWeeks(r, 1)));
    else setRef(r => (passo > 0 ? addMonths(r, 1) : subMonths(r, 1)));
  }

  function chip(d: Demanda) {
    const st = statusMeta(d.status);
    const atrasada = estaAtrasada(d, hoje);
    const quem = d.assigned_to ? pessoaPorId.get(d.assigned_to)?.nome.split(" ")[0] : null;
    return (
      <button
        key={d.id}
        type="button"
        onClick={e => { e.stopPropagation(); setAberta(d); }}
        title={`${d.titulo} · ${st.label}`}
        className={`block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] ring-1 transition-opacity hover:opacity-80 ${
          atrasada ? "bg-destructive/15 text-destructive ring-destructive/30" : st.cor
        } ${d.status === "concluida" ? "line-through opacity-60" : ""}`}
      >
        {quem && <span className="font-semibold">{quem}: </span>}
        {d.titulo}
      </button>
    );
  }

  function celula(dia: Date, alta: boolean) {
    const iso = format(dia, "yyyy-MM-dd");
    const itens = porDia.get(iso) ?? [];
    const foraDoMes = visao === "mes" && !isSameMonth(dia, ref);
    return (
      <div
        key={iso}
        role="button"
        tabIndex={0}
        aria-label={`Nova demanda para ${format(dia, "dd/MM")}`}
        onClick={() => setNovaEm(iso)}
        onKeyDown={e => { if (e.key === "Enter") setNovaEm(iso); }}
        className={`group flex flex-col gap-1 rounded-xl border p-1.5 text-left transition-colors hover:border-border ${
          alta ? "min-h-[220px]" : "min-h-[104px]"
        } ${foraDoMes ? "border-border/30 opacity-50" : "border-border/60 bg-card/40"}`}
      >
        <div className="flex items-center justify-between">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums ${isToday(dia) ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground"}`}>
            {format(dia, "d")}
          </span>
          <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="space-y-1">
          {(alta ? itens : itens.slice(0, 3)).map(chip)}
          {!alta && itens.length > 3 && (
            <button
              type="button"
              className="text-[10px] text-muted-foreground hover:text-foreground"
              onClick={e => { e.stopPropagation(); setVisao("semana"); setRef(dia); }}
            >
              +{itens.length - 3} mais
            </button>
          )}
        </div>
      </div>
    );
  }

  const semana = diasDaSemana(ref);
  const titulo = visao === "semana"
    ? `${format(semana[0], "dd MMM", { locale: ptBR })} – ${format(semana[6], "dd MMM yyyy", { locale: ptBR })}`
    : format(ref, "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <CalendarDays className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Planner</h1>
            <p className="text-sm text-muted-foreground">Prazos das demandas no calendário e a carga de cada pessoa.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CampoBusca value={busca} onChange={setBusca} placeholder="Buscar demanda ou cliente" className="w-full sm:w-60" />
          <div className="flex rounded-xl border border-border/60 p-0.5">
            {([["mes", "Mês"], ["semana", "Semana"], ["responsavel", "Por responsável"]] as [Visao, string][]).map(([id, label]) => (
              <Button key={id} size="sm" variant={visao === id ? "secondary" : "ghost"} onClick={() => setVisao(id)}>{label}</Button>
            ))}
          </div>
          {isAdmin && (
            <Select value={responsavel} onValueChange={setResponsavel}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Toda a equipe</SelectItem>
                {pessoas.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setNovaEm("")}><Plus className="mr-1.5 h-4 w-4" /> Nova demanda</Button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[560px] rounded-2xl" />
      ) : visao === "responsavel" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ordemPessoas.map(id => {
            const itens = grupos.get(id) ?? [];
            const pessoa = id ? pessoaPorId.get(id) : null;
            const atrasadas = itens.filter(d => estaAtrasada(d, hoje)).length;
            return (
              <div key={id ?? "sem"} className="rounded-2xl border border-border/60 bg-card/40 p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{pessoa?.nome ?? "Sem responsável"}</div>
                    {pessoa && <div className="text-xs text-muted-foreground">{rotuloPapel(pessoa.role)}</div>}
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div className="tabular-nums">{itens.length} aberta{itens.length === 1 ? "" : "s"}</div>
                    {atrasadas > 0 && <div className="font-medium text-destructive">{atrasadas} atrasada{atrasadas === 1 ? "" : "s"}</div>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {itens.map(d => {
                    const c = d.client_id ? clientePorId.get(d.client_id)?.name : null;
                    const atrasada = estaAtrasada(d, hoje);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setAberta(d)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/40"
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${atrasada ? "bg-destructive" : "bg-primary/60"}`} />
                        <span className="min-w-0 flex-1 truncate">
                          {c && <span className="text-muted-foreground">{c} — </span>}
                          {d.titulo}
                        </span>
                        <span className={`shrink-0 text-[11px] tabular-nums ${atrasada ? "text-destructive" : "text-muted-foreground"}`}>
                          {d.prazo ? `${d.prazo.slice(8, 10)}/${d.prazo.slice(5, 7)}` : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {ordemPessoas.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/60 px-4 py-12 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
              Nenhuma demanda aberta.
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => andar(-1)} aria-label="Anterior"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setRef(new Date())}>Hoje</Button>
            <Button variant="outline" size="icon" onClick={() => andar(1)} aria-label="Próximo"><ChevronRight className="h-4 w-4" /></Button>
            <span className="ml-2 text-lg font-semibold capitalize">{titulo}</span>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[720px] grid-cols-7 gap-1.5">
              {DIAS.map(d => <div key={d} className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{d}</div>)}
              {(visao === "semana" ? semana : diasDoMes(ref)).map(dia => celula(dia, visao === "semana"))}
            </div>
          </div>
          {semPrazo.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sem prazo ({semPrazo.length})</div>
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{semPrazo.map(chip)}</div>
            </div>
          )}
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
        open={novaEm !== null}
        onOpenChange={open => { if (!open) setNovaEm(null); }}
        onCreated={d => setDemandas(atual => [...atual, d])}
        clientes={clientesDaCarteira}
        pessoas={pessoas}
        prazoInicial={novaEm || undefined}
      />
    </div>
  );
}
