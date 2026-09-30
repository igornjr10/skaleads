import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarCheck, ChevronLeft, ChevronRight, Database, FileText, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientAvatar } from "@/components/ClientAvatar";
import { errorMessage } from "@/lib/utils";
import { isoLocal } from "@/lib/rotinas";

type Ciclo = "mensal" | "semanal";
type Tipo = "relatorio" | "reuniao";

interface ClienteResumo {
  id: string;
  name: string;
  logo_url: string | null;
  manager_id: string | null;
}

interface Compromisso {
  id: string;
  client_id: string;
  tipo: Tipo;
  ciclo: Ciclo;
  competencia: string;
  feito: boolean;
  data_feito: string | null;
  observacao: string | null;
}

const COLUNAS = [
  { tipo: "relatorio" as Tipo, label: "Relatório", icone: FileText },
  { tipo: "reuniao" as Tipo, label: "Reunião", icone: Users },
];

const TODOS_GESTORES = "todos";
const SEM_GESTOR = "sem-gestor";
const SELECT = "id, client_id, tipo, ciclo, competencia, feito, data_feito, observacao";

// A tabela `client_compromissos` e nova e os tipos gerados do Supabase estao
// atrasados em relacao ao banco. O cast fica num lugar so.
const tabelaCompromissos = () =>
  (supabase.from as unknown as (t: string) => ReturnType<typeof supabase.from>)("client_compromissos");

/** Ancora do ciclo: dia 1 no mensal, segunda-feira no semanal. */
function competenciaDe(data: Date, ciclo: Ciclo) {
  return isoLocal(ciclo === "mensal" ? startOfMonth(data) : startOfWeek(data, { weekStartsOn: 1 }));
}

function rotuloDoCiclo(competencia: string, ciclo: Ciclo) {
  const inicio = parseISO(competencia);
  if (ciclo === "mensal") return format(inicio, "MMMM yyyy", { locale: ptBR });
  const fim = endOfWeek(inicio, { weekStartsOn: 1 });
  return `${format(inicio, "dd MMM", { locale: ptBR })} – ${format(fim, "dd MMM", { locale: ptBR })}`;
}

export function ReuniaoRelatorio({ clientes }: { clientes: ClienteResumo[] }) {
  const [ciclo, setCiclo] = useState<Ciclo>("mensal");
  const [ancora, setAncora] = useState(() => new Date());
  const [compromissos, setCompromissos] = useState<Compromisso[]>([]);
  const [gestores, setGestores] = useState<{ id: string; name: string }[]>([]);
  const [filtroGestor, setFiltroGestor] = useState(TODOS_GESTORES);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [semTabela, setSemTabela] = useState(false);

  const competencia = useMemo(() => competenciaDe(ancora, ciclo), [ancora, ciclo]);
  const competenciaAtual = useMemo(() => competenciaDe(new Date(), ciclo), [ciclo]);
  const ehPassado = competencia < competenciaAtual;

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await tabelaCompromissos()
      .select(SELECT)
      .eq("ciclo", ciclo)
      .eq("competencia", competencia);

    // A migration pode nao ter rodado ainda neste ambiente.
    if (error?.code === "42P01" || error?.code === "PGRST205") {
      setSemTabela(true);
      setLoading(false);
      return;
    }
    if (error) toast.error(errorMessage(error, "Nao foi possivel carregar os registros"));

    setCompromissos((data as Compromisso[]) ?? []);
    setLoading(false);
  }, [ciclo, competencia]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    supabase
      .from("managers")
      .select("id, name")
      .order("name")
      .then(({ data }) => setGestores((data as { id: string; name: string }[]) ?? []));
  }, []);

  const gestorPorId = useMemo(() => new Map(gestores.map((g) => [g.id, g.name])), [gestores]);

  const registroPorChave = useMemo(() => {
    const mapa = new Map<string, Compromisso>();
    for (const c of compromissos) mapa.set(`${c.client_id}|${c.tipo}`, c);
    return mapa;
  }, [compromissos]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return clientes.filter((c) => {
      const passaGestor =
        filtroGestor === TODOS_GESTORES ||
        (filtroGestor === SEM_GESTOR ? !c.manager_id : c.manager_id === filtroGestor);
      return passaGestor && (!termo || c.name.toLowerCase().includes(termo));
    });
  }, [clientes, busca, filtroGestor]);

  const placar = useMemo(() => {
    const conta = (tipo: Tipo) => visiveis.filter((c) => registroPorChave.get(`${c.id}|${tipo}`)?.feito).length;
    return { relatorio: conta("relatorio"), reuniao: conta("reuniao"), total: visiveis.length };
  }, [visiveis, registroPorChave]);

  async function gravar(clientId: string, tipo: Tipo, mudanca: Partial<Compromisso>) {
    const anterior = registroPorChave.get(`${clientId}|${tipo}`);
    const payload = {
      client_id: clientId,
      tipo,
      ciclo,
      competencia,
      feito: anterior?.feito ?? false,
      data_feito: anterior?.data_feito ?? null,
      observacao: anterior?.observacao ?? null,
      ...mudanca,
    };

    // Otimista: conferir 30 clientes nao pode virar 30 esperas de rede.
    setCompromissos((atual) => [
      ...atual.filter((c) => !(c.client_id === clientId && c.tipo === tipo)),
      { id: anterior?.id ?? `tmp-${clientId}-${tipo}`, ...payload } as Compromisso,
    ]);

    const { data, error } = await tabelaCompromissos()
      .upsert(payload, { onConflict: "client_id,tipo,ciclo,competencia" })
      .select(SELECT)
      .single();

    if (error) {
      setCompromissos((atual) => [
        ...atual.filter((c) => !(c.client_id === clientId && c.tipo === tipo)),
        ...(anterior ? [anterior] : []),
      ]);
      return toast.error(errorMessage(error, "Nao foi possivel salvar o registro"));
    }

    setCompromissos((atual) => [
      ...atual.filter((c) => !(c.client_id === clientId && c.tipo === tipo)),
      data as Compromisso,
    ]);
  }

  function marcar(clientId: string, tipo: Tipo, feito: boolean) {
    // Marcar sem dizer o dia vira hoje no trigger; desmarcar limpa a data la.
    gravar(clientId, tipo, feito ? { feito: true } : { feito: false, data_feito: null });
  }

  if (semTabela) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Database className="h-8 w-8 text-muted-foreground" />
          <h2 className="text-base font-semibold">Reunião e relatório ainda não instalados no banco</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Rode a migration <code className="text-primary">20260922130000_reuniao_relatorio.sql</code> no SQL Editor
            do Supabase e recarregue esta página.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Ciclo, período e filtros ─────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex shrink-0 rounded-xl border border-border/60 p-0.5">
          {(["mensal", "semanal"] as Ciclo[]).map((c) => (
            <Button key={c} variant={ciclo === c ? "secondary" : "ghost"} size="sm" onClick={() => setCiclo(c)}>
              {c === "mensal" ? "Mês" : "Semana"}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-border/60 px-1 py-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setAncora((d) => (ciclo === "mensal" ? addMonths(d, -1) : addWeeks(d, -1)))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[10.5rem] text-center text-sm font-medium capitalize">
            {rotuloDoCiclo(competencia, ciclo)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setAncora((d) => (ciclo === "mensal" ? addMonths(d, 1) : addWeeks(d, 1)))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {competencia !== competenciaAtual && (
          <Button variant="outline" size="sm" onClick={() => setAncora(new Date())}>
            {ciclo === "mensal" ? "Este mês" : "Esta semana"}
          </Button>
        )}

        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente"
          className="h-9 lg:max-w-56"
        />

        <Select value={filtroGestor} onValueChange={setFiltroGestor}>
          <SelectTrigger className="h-9 lg:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS_GESTORES}>Todos os gestores</SelectItem>
            <SelectItem value={SEM_GESTOR}>Sem gestor</SelectItem>
            {gestores.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <Badge variant="outline" className="gap-1.5">
            <FileText className="h-3 w-3" />
            {placar.relatorio}/{placar.total} relatórios
          </Badge>
          <Badge variant="outline" className="gap-1.5">
            <Users className="h-3 w-3" />
            {placar.reuniao}/{placar.total} reuniões
          </Badge>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/60">
          <div className="hidden grid-cols-[1.4fr_1fr_1fr] gap-3 border-b border-border/60 bg-card/40 px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground lg:grid">
            <span>Cliente</span>
            {COLUNAS.map((col) => (
              <span key={col.tipo}>{col.label}</span>
            ))}
          </div>

          {visiveis.map((cliente) => (
            <div
              key={cliente.id}
              className="grid grid-cols-1 gap-3 border-b border-border/40 px-4 py-3 last:border-0 lg:grid-cols-[1.4fr_1fr_1fr] lg:items-start"
            >
              <div className="flex min-w-0 items-center gap-2">
                <ClientAvatar name={cliente.name} logoUrl={cliente.logo_url} className="h-7 w-7 shrink-0" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{cliente.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {cliente.manager_id ? gestorPorId.get(cliente.manager_id) ?? "Gestor removido" : "Sem gestor"}
                  </div>
                </div>
              </div>

              {COLUNAS.map(({ tipo, label, icone: Icone }) => {
                const registro = registroPorChave.get(`${cliente.id}|${tipo}`);
                const feito = !!registro?.feito;

                return (
                  <div key={tipo} className="min-w-0">
                    <label className="flex cursor-pointer items-center gap-2">
                      <Checkbox checked={feito} onCheckedChange={(v) => marcar(cliente.id, tipo, v === true)} />
                      <span className="flex items-center gap-1.5 text-xs lg:hidden">
                        <Icone className="h-3.5 w-3.5 text-muted-foreground" />
                        {label}
                      </span>
                      {!feito && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            ehPassado ? "border-destructive/40 text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {ehPassado ? "não registrado" : "pendente"}
                        </Badge>
                      )}
                    </label>

                    {feito && (
                      <div className="mt-2 space-y-1.5 pl-6">
                        <Input
                          type="date"
                          value={registro?.data_feito ?? ""}
                          onChange={(e) =>
                            e.target.value && gravar(cliente.id, tipo, { feito: true, data_feito: e.target.value })
                          }
                          className="h-8 w-full text-xs lg:max-w-40"
                        />
                        <Input
                          key={`${cliente.id}|${tipo}|${competencia}|${registro?.observacao ?? ""}`}
                          defaultValue={registro?.observacao ?? ""}
                          onBlur={(e) => {
                            const texto = e.target.value.trim();
                            if (texto !== (registro?.observacao ?? "")) {
                              gravar(cliente.id, tipo, { observacao: texto || null });
                            }
                          }}
                          placeholder={tipo === "relatorio" ? "Como foi enviado" : "O que ficou combinado"}
                          className="h-8 text-xs"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {visiveis.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-muted-foreground">
              <CalendarCheck className="h-6 w-6" />
              {clientes.length === 0 ? "Nenhum cliente ativo." : "Nenhum cliente com esses filtros."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
