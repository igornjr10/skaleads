import { useMemo } from "react";
import { AlertTriangle, ArrowUpRight, BrainCircuit, Info, Lightbulb, RefreshCw, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ClientAvatar } from "@/components/ClientAvatar";
import { useEstadoDaTela } from "@/hooks/useEstadoDaTela";
import { segmentLabel } from "@/lib/local-business";
import {
  GRUPOS,
  KPI_DEF,
  KPIS_POR_GRUPO,
  RESULTADO_POR_GRUPO,
  SEVERIDADES,
  formatarKpi,
  labelGrupo,
  valorKpi,
  type Achado,
  type AnaliseCampanha,
  type ClienteEntrada,
  type GrupoObjetivo,
  type ResumoCliente,
  type Severidade,
} from "@/lib/analise-campanhas";

const ESTILO_SEVERIDADE: Record<Severidade, string> = {
  critico: "border-rose-500/30 bg-rose-500/10 text-rose-400",
  atencao: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  oportunidade: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
};

const LABEL_SEVERIDADE: Record<Severidade, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  oportunidade: "Oportunidade",
};

export function SeloReferencia({ achado }: { achado: Achado }) {
  const ref = achado.referencia;
  if (!ref) return null;
  const formato = achado.tipo === "frequencia_alta" || achado.tipo === "criativo_saturado"
    ? "multiplo"
    : achado.tipo === "ctr_baixo" ? "percentual" : "moeda";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={`max-w-full cursor-help gap-1 rounded-full text-[11px] font-normal ${ref.estimativa ? "border-dashed text-muted-foreground" : "border-primary/40 text-primary"}`}
        >
          <Info className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {ref.estimativa ? "Estimativa · " : ""}
            {ref.rotulo}: {formatarKpi(ref.valor, formato)}
          </span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        {ref.estimativa
          ? "Parâmetro de comparação estimado (carteira da agência ou faixa de mercado do segmento). Defina a meta do cliente para comparar com o combinado."
          : "Meta combinada com o cliente."}
      </TooltipContent>
    </Tooltip>
  );
}

export function CartaoAchado({ achado, compacto = false }: { achado: Achado; compacto?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl border p-3 ${ESTILO_SEVERIDADE[achado.severidade]}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {achado.severidade === "oportunidade"
            ? <TrendingUp className="h-4 w-4 shrink-0" />
            : <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span className="break-words text-sm font-semibold">{achado.titulo}</span>
        </div>
        <Badge variant="outline" className={`shrink-0 ${ESTILO_SEVERIDADE[achado.severidade]}`}>
          {LABEL_SEVERIDADE[achado.severidade]}
        </Badge>
      </div>
      <p className="mt-1.5 break-words text-xs text-foreground/80">{achado.explicacao}</p>
      {!compacto && (
        <p className="mt-1.5 flex gap-1.5 break-words text-xs font-medium text-foreground">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{achado.acao}</span>
        </p>
      )}
      {achado.referencia && (
        <div className="mt-2">
          <SeloReferencia achado={achado} />
        </div>
      )}
    </div>
  );
}

export function KpisDaCampanha({ analise }: { analise: AnaliseCampanha }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {KPIS_POR_GRUPO[analise.grupo].map(chave => {
        const def = KPI_DEF[chave];
        const estimado = chave === "alcance" || chave === "frequencia";
        return (
          <div key={chave} className="min-w-0 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
            <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground" title={def.label}>
              {def.label}{estimado ? " *" : ""}
            </div>
            <div className="truncate text-sm font-semibold tabular-nums">
              {formatarKpi(valorKpi(analise.campanha, chave), def.formato)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Indicador({ label, valor, rotulo, title }: { label: string; valor: string; rotulo?: string; title?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-background/40 px-3 py-2" title={title}>
      <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-semibold tabular-nums">{valor}</div>
      {rotulo && <div className="truncate text-[10px] text-muted-foreground">{rotulo}</div>}
    </div>
  );
}

function mesExtenso(iso: string) {
  const [a, m] = iso.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

function ResumoDoCliente({ r, financeiroDisponivel }: { r: ResumoCliente; financeiroDisponivel: boolean }) {
  const f = r.financeiro;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
      <Indicador label="Investido (30d)" valor={formatarKpi(r.investido, "moeda")} />
      <Indicador label="Mensagens" valor={formatarKpi(r.mensagens, "numero")} />
      <Indicador label="Custo / mensagem" valor={formatarKpi(r.custoMensagem, "moeda")} />
      <Indicador label="Visitas ao perfil" valor={formatarKpi(r.visitasPerfil, "numero")} rotulo="conta toda, 30 dias" />
      <Indicador
        label="Custo / visita"
        valor={formatarKpi(r.custoVisitaEstimado, "moeda")}
        rotulo={r.custoVisitaEstimado !== null ? "estimado" : "sem campanha de tráfego"}
        title="Gasto das campanhas de tráfego ÷ visitas ao perfil da conta. A Meta só informa visita ao perfil por conta, então é uma aproximação."
      />
      {f ? (
        <>
          <Indicador
            label="Faturamento"
            valor={formatarKpi(f.faturamento, "moeda")}
            rotulo={`informado · ${mesExtenso(f.mes)}`}
          />
          <Indicador
            label="ROAS · ROI"
            valor={`${formatarKpi(f.roas, "multiplo")} · ${f.roi === null ? "—" : `${Math.round(f.roi)}%`}`}
            rotulo={f.estimado ? "ROI estimado (custo por %)" : "com custos informados"}
            title="ROAS = faturamento ÷ investimento. ROI = lucro ÷ (investimento + custos). Faturamento lançado à mão no financeiro do cliente."
          />
        </>
      ) : (
        <div className="col-span-2 flex min-w-0 items-center rounded-xl border border-dashed border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
          {financeiroDisponivel
            ? "Sem faturamento informado. Lance no financeiro do cliente para ver ROAS e ROI."
            : "Financeiro indisponível para o seu acesso."}
        </div>
      )}
    </div>
  );
}

interface Props {
  analises: AnaliseCampanha[];
  clientes: Map<string, ClienteEntrada & { logo_url?: string | null }>;
  nomesClientes: Map<string, string>;
  resumos: Map<string, ResumoCliente>;
  financeiroDisponivel: boolean;
  carregando: boolean;
  erro: string | null;
  onTentarDeNovo: () => void;
  onAbrirCampanha: (id: string) => void;
}

export function PainelInteligencia({
  analises, clientes, nomesClientes, resumos, financeiroDisponivel, carregando, erro, onTentarDeNovo, onAbrirCampanha,
}: Props) {
  const [grupo, setGrupo] = useEstadoDaTela<"todos" | GrupoObjetivo>("campanhas:intel:grupo", "todos");
  const [severidade, setSeveridade] = useEstadoDaTela<"todas" | Severidade>("campanhas:intel:severidade", "todas");

  const filtradas = useMemo(
    () => analises
      .filter(a => grupo === "todos" || a.grupo === grupo)
      .map(a => ({ ...a, achados: a.achados.filter(x => severidade === "todas" || x.severidade === severidade) }))
      .filter(a => a.achados.length > 0),
    [analises, grupo, severidade]
  );

  const contagem = useMemo(() => {
    const c: Record<Severidade, number> = { critico: 0, atencao: 0, oportunidade: 0 };
    for (const a of analises) {
      if (grupo !== "todos" && a.grupo !== grupo) continue;
      for (const x of a.achados) c[x.severidade]++;
    }
    return c;
  }, [analises, grupo]);

  const porObjetivo = useMemo(() => {
    const m = new Map<GrupoObjetivo, { gasto: number; volume: number; custoSoma: number; campanhas: number }>();
    for (const a of analises) {
      if (a.campanha.status !== "ACTIVE") continue;
      const r = RESULTADO_POR_GRUPO[a.grupo];
      const atual = m.get(a.grupo) ?? { gasto: 0, volume: 0, custoSoma: 0, campanhas: 0 };
      atual.gasto += Number(a.campanha.spend) || 0;
      atual.volume += valorKpi(a.campanha, r.volume) ?? 0;
      if (r.custo === "cpm") atual.custoSoma += Number(a.campanha.impressions) || 0;
      atual.campanhas++;
      m.set(a.grupo, atual);
    }
    return GRUPOS.filter(g => m.has(g.valor)).map(g => {
      const v = m.get(g.valor)!;
      const r = RESULTADO_POR_GRUPO[g.valor];
      const custo = r.custo === "cpm"
        ? (v.custoSoma > 0 ? (v.gasto / v.custoSoma) * 1000 : null)
        : (v.volume > 0 ? v.gasto / v.volume : null);
      return { ...g, ...v, custo, custoLabel: KPI_DEF[r.custo].label, volumeLabel: r.unidade };
    });
  }, [analises]);

  const porCliente = useMemo(() => {
    const m = new Map<string, typeof filtradas>();
    for (const a of filtradas) {
      const lista = m.get(a.campanha.client_id) ?? [];
      lista.push(a);
      m.set(a.campanha.client_id, lista);
    }
    const peso = (l: typeof filtradas) =>
      l.reduce((s, a) => s + a.achados.reduce((t, x) => t + (x.severidade === "critico" ? 100 : x.severidade === "atencao" ? 10 : 1), 0), 0);
    return [...m.entries()].sort((a, b) => peso(b[1]) - peso(a[1]));
  }, [filtradas]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-4 shadow-card sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Inteligência por objetivo</h2>
              <p className="text-sm text-muted-foreground">
                Cada campanha é avaliada pelos indicadores do próprio objetivo: mensagem por custo por conversa,
                tráfego por CPC e CTR, reconhecimento por CPM e frequência, conversão por custo por resultado.
                Sem meta do cliente, a comparação usa a carteira ou faixas de mercado do segmento — sempre marcadas como estimativa.
              </p>
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:w-[420px]">
            <Select value={grupo} onValueChange={v => setGrupo(v as typeof grupo)}>
              <SelectTrigger><SelectValue placeholder="Objetivo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os objetivos</SelectItem>
                {GRUPOS.map(g => <SelectItem key={g.valor} value={g.valor}>{g.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={severidade} onValueChange={v => setSeveridade(v as typeof severidade)}>
              <SelectTrigger><SelectValue placeholder="Severidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as severidades</SelectItem>
                {SEVERIDADES.map(s => <SelectItem key={s.valor} value={s.valor}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {SEVERIDADES.map(s => (
            <button
              key={s.valor}
              type="button"
              onClick={() => setSeveridade(severidade === s.valor ? "todas" : s.valor)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-opacity ${ESTILO_SEVERIDADE[s.valor]} ${severidade !== "todas" && severidade !== s.valor ? "opacity-50" : ""}`}
            >
              {contagem[s.valor]} {s.label.toLowerCase()}
            </button>
          ))}
        </div>

        {porObjetivo.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {porObjetivo.map(g => (
              <button
                key={g.valor}
                type="button"
                onClick={() => setGrupo(grupo === g.valor ? "todos" : g.valor)}
                className={`min-w-0 rounded-xl border p-3 text-left transition-colors hover:border-primary/40 ${grupo === g.valor ? "border-primary/50 bg-primary/10" : "border-border/60 bg-background/40"}`}
              >
                <div className="truncate text-xs font-semibold" title={g.descricao}>{g.label}</div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">
                  {g.campanhas} ativa(s) · {formatarKpi(g.gasto, "moeda")}
                </div>
                <div className="mt-1 truncate text-sm font-semibold tabular-nums">
                  {g.custoLabel}: {formatarKpi(g.custo, "moeda")}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {formatarKpi(g.volume, "numero")} {g.volumeLabel}{g.valor === "reconhecimento" ? " (est.)" : ""}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {erro ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">{erro}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onTentarDeNovo}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Tentar de novo
          </Button>
        </div>
      ) : carregando ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
        </div>
      ) : porCliente.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card/60 p-10 text-center shadow-card">
          <p className="text-sm font-medium">Nenhum achado com esses filtros.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Campanhas ativas com pelo menos R$ 50 investidos nos últimos 30 dias entram na análise.
            Mude o objetivo ou a severidade, ou sincronize os clientes para atualizar os dados.
          </p>
        </div>
      ) : (
        porCliente.map(([clientId, lista]) => {
          const cliente = clientes.get(clientId);
          const nome = cliente?.name ?? nomesClientes.get(clientId) ?? "Cliente";
          const resumo = resumos.get(clientId);
          const segmento = segmentLabel(cliente?.business_segment);
          return (
            <section key={clientId} className="rounded-2xl border border-border/60 bg-card/60 p-4 shadow-card sm:p-5">
              <div className="flex min-w-0 items-center gap-3">
                <ClientAvatar name={nome} logoUrl={cliente?.logo_url} />
                <div className="min-w-0">
                  <h3 className="truncate font-semibold" title={nome}>{nome}</h3>
                  <p className="truncate text-xs text-muted-foreground">
                    {segmento ?? "Segmento não informado"} · {lista.length} campanha(s) com achados
                  </p>
                </div>
              </div>

              {resumo && (
                <div className="mt-3">
                  <ResumoDoCliente r={resumo} financeiroDisponivel={financeiroDisponivel} />
                </div>
              )}

              <div className="mt-4 space-y-3">
                {lista.map(a => (
                  <div key={a.campanha.id} className="rounded-xl border border-border/60 bg-background/40 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="min-w-0 truncate text-sm font-medium" title={a.campanha.name}>{a.campanha.name}</span>
                        <Badge variant="outline" className="shrink-0 rounded-full text-[11px]">{labelGrupo(a.grupo)}</Badge>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => onAbrirCampanha(a.campanha.id)}>
                        Ver na lista <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="mt-2">
                      <KpisDaCampanha analise={a} />
                    </div>
                    <div className="mt-3 grid gap-2 lg:grid-cols-2">
                      {a.achados.map(x => <CartaoAchado key={x.id} achado={x} />)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}

      {!carregando && !erro && (
        <p className="text-[11px] text-muted-foreground">
          * Alcance e frequência da campanha são aproximados a partir dos anúncios (impressões ÷ frequência de cada um).
          Janela de 30 dias do último sync; criativo saturado compara os últimos 7 dias com os 7 anteriores.
        </p>
      )}
    </div>
  );
}
