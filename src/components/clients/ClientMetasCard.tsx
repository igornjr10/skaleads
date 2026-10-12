import { useEffect, useState } from "react";
import { ChevronDown, Crosshair, Lightbulb, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hojeISO } from "@/lib/demandas";
import { type Alvos, type AvaliacaoMeta, type MetricaDiaria, avaliarMeta } from "@/lib/metas";
import {
  type ComparacaoMeta, type MetasCliente, METAS_VAZIAS, compararMetas, formatarMeta, temAlgumaMeta,
} from "@/lib/metas-cliente";
import { errorMessage } from "@/lib/utils";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SITUACAO: Record<AvaliacaoMeta["situacao"], { label: string; cls: string }> = {
  sem_meta: { label: "Sem meta", cls: "border-slate-500/30 bg-slate-500/10 text-slate-400" },
  cedo: { label: "Início do mês", cls: "border-sky-500/30 bg-sky-500/10 text-sky-400" },
  no_ritmo: { label: "No ritmo", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
  abaixo: { label: "Abaixo da meta", cls: "border-rose-500/30 bg-rose-500/10 text-rose-400" },
};

const STATUS: Record<ComparacaoMeta["status"], { label: string; cls: string; barra: string }> = {
  ok: { label: "Na meta", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", barra: "bg-emerald-500" },
  atencao: { label: "Atenção", cls: "border-amber-500/30 bg-amber-500/10 text-amber-400", barra: "bg-amber-500" },
  fora: { label: "Fora da meta", cls: "border-rose-500/30 bg-rose-500/10 text-rose-400", barra: "bg-rose-500" },
  cedo: { label: "Cedo", cls: "border-sky-500/30 bg-sky-500/10 text-sky-400", barra: "bg-sky-500" },
  sem_dado: { label: "Sem dado", cls: "border-slate-500/30 bg-slate-500/10 text-slate-400", barra: "bg-slate-500" },
};

const PODE_EDITAR = ["owner", "admin", "analyst"];

type Campo = { chave: keyof (MetasCliente & Alvos); label: string; dica: string; inteiro?: boolean };

const CAMPOS: { grupo: string; campos: Campo[] }[] = [
  {
    grupo: "Resultados",
    campos: [
      { chave: "alvo_resultados_mes", label: "Resultados no mês", dica: "Ex.: 120", inteiro: true },
      { chave: "alvo_custo_resultado", label: "Custo máx. por resultado (R$)", dica: "Ex.: 15,00" },
    ],
  },
  {
    grupo: "Mensagens e perfil",
    campos: [
      { chave: "alvo_custo_mensagem", label: "Custo por mensagem (R$)", dica: "Ex.: 5,00" },
      { chave: "alvo_mensagens_mes", label: "Mensagens no mês", dica: "Ex.: 300", inteiro: true },
      { chave: "alvo_visitas_perfil_mes", label: "Visitas ao perfil no mês", dica: "Ex.: 1500", inteiro: true },
      { chave: "alvo_cpc", label: "Custo por clique (R$)", dica: "Ex.: 0,80" },
    ],
  },
  {
    grupo: "Dinheiro",
    campos: [
      { chave: "alvo_faturamento_mes", label: "Faturamento no mês (R$)", dica: "Ex.: 50.000" },
      { chave: "alvo_roas", label: "ROAS (x)", dica: "Ex.: 4" },
      { chave: "limite_investimento_mes", label: "Limite de investimento (R$)", dica: "Ex.: 3.000" },
    ],
  },
];

function paraTexto(v: number | null | undefined) {
  return v ? String(v).replace(".", ",") : "";
}

function paraNumero(texto: string, inteiro?: boolean): number | null | "invalido" {
  const t = texto.trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  if (!(n > 0)) return "invalido";
  return inteiro ? Math.round(n) : n;
}

interface Dia extends MetricaDiaria {
  clicks: number;
  profile_visits: number;
}

export function ClientMetasCard({ clientId, alvos, metas = METAS_VAZIAS, onSalvo }: {
  clientId: string;
  alvos: Alvos;
  metas?: MetasCliente;
  onSalvo?: (mudanca: Partial<Alvos & MetasCliente>) => void;
}) {
  const { role } = useAuth();
  const [dias, setDias] = useState<Dia[] | null>(null);
  const [faturamento, setFaturamento] = useState<number | null>(null);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const hoje = hojeISO(new Date());
  const inicioMes = `${hoje.slice(0, 7)}-01`;

  useEffect(() => {
    supabase
      .from("campaign_daily_metrics")
      .select("date, spend, messages, calls, directions, leads, clicks, profile_visits")
      .eq("client_id", clientId)
      .gte("date", inicioMes)
      .then(({ data }) => setDias((data ?? []) as Dia[]));
    // Faturamento so chega para quem ve o financeiro do cliente (a RLS decide).
    supabase
      .from("cliente_financeiro_mes")
      .select("faturamento")
      .eq("client_id", clientId)
      .eq("mes", inicioMes)
      .maybeSingle()
      .then(({ data }) => setFaturamento(data?.faturamento ?? null));
  }, [clientId, inicioMes]);

  const todas: MetasCliente & Alvos = { ...metas, ...alvos };

  function abrirEdicao() {
    const f: Record<string, string> = {};
    for (const g of CAMPOS) for (const c of g.campos) f[c.chave] = paraTexto(todas[c.chave] as number | null);
    setForm(f);
    setEditando(true);
  }

  async function salvar() {
    const mudanca: Record<string, number | null> = {};
    for (const g of CAMPOS) {
      for (const c of g.campos) {
        const v = paraNumero(form[c.chave] ?? "", c.inteiro);
        if (v === "invalido") return toast.error(`${c.label}: use um número maior que zero, ou deixe em branco`);
        mudanca[c.chave] = v;
      }
    }
    setSalvando(true);
    const { error } = await supabase.rpc("definir_metas_cliente_completo", { p_client_id: clientId, p_metas: mudanca });
    setSalvando(false);
    if (error) return toast.error(errorMessage(error, "Não foi possível salvar as metas"));
    toast.success("Metas salvas");
    setEditando(false);
    onSalvo?.(mudanca as Partial<Alvos & MetasCliente>);
  }

  const a = dias ? avaliarMeta(alvos, dias, hoje) : null;
  const tom = a ? SITUACAO[a.situacao] : null;
  const pct = a?.alvoResultados ? Math.min((a.resultados / a.alvoResultados) * 100, 100) : 0;
  const esperadoHoje = a?.alvoResultados ? (a.alvoResultados * a.diaDoMes) / a.diasNoMes : 0;

  const comparacoes = dias && a
    ? compararMetas(metas, {
        gasto: a.gasto,
        mensagens: dias.reduce((s, d) => s + (Number(d.messages) || 0), 0),
        visitasPerfil: dias.reduce((s, d) => s + (Number(d.profile_visits) || 0), 0),
        cliques: dias.reduce((s, d) => s + (Number(d.clicks) || 0), 0),
        faturamento,
      }, a.diaDoMes, a.diasNoMes)
    : [];
  const semNenhuma = a?.situacao === "sem_meta" && !temAlgumaMeta(metas);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Crosshair className="h-4 w-4" /> Metas do mês
          {tom && a?.situacao !== "sem_meta" && <Badge variant="outline" className={tom.cls}>{tom.label}</Badge>}
        </CardTitle>
        {PODE_EDITAR.includes(role ?? "") && !editando && (
          <Button variant="ghost" size="sm" onClick={abrirEdicao}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> {semNenhuma ? "Definir metas" : "Editar"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {editando ? (
          <div className="space-y-4">
            {CAMPOS.map(g => (
              <div key={g.grupo} className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.grupo}</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {g.campos.map(c => (
                    <div key={c.chave} className="min-w-0 space-y-1">
                      <Label className="text-xs">{c.label}</Label>
                      <Input
                        inputMode={c.inteiro ? "numeric" : "decimal"}
                        placeholder={c.dica}
                        value={form[c.chave] ?? ""}
                        onChange={e => setForm(f => ({ ...f, [c.chave]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Resultado = mensagens + ligações + rotas + leads. Deixe em branco o que não tiver meta. Faturamento e ROAS usam o
              faturamento informado no financeiro do cliente.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditando(false)} disabled={salvando}>Cancelar</Button>
              <Button size="sm" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar metas"}</Button>
            </div>
          </div>
        ) : !a ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : semNenhuma ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma meta definida. Com elas o sistema compara o realizado todo dia, avisa quando sair do ritmo e sugere onde investigar.
          </p>
        ) : (
          <>
            {a.situacao !== "sem_meta" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {a.alvoResultados !== null && (
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-2xl font-bold tabular-nums">{a.resultados}<span className="text-sm font-normal text-muted-foreground"> / {a.alvoResultados}</span></span>
                      <span className="text-xs text-muted-foreground">resultados</span>
                    </div>
                    <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${a.resultadosAbaixo ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                      <div className="absolute inset-y-0 w-0.5 bg-foreground/40" style={{ left: `${Math.min((esperadoHoje / a.alvoResultados) * 100, 100)}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Projeção para o fim do mês: <strong className={a.resultadosAbaixo ? "text-rose-500" : ""}>{a.projecao}</strong>
                      {" "}· esperado até hoje: {Math.round(esperadoHoje)}
                    </p>
                  </div>
                )}
                {a.alvoCusto !== null && (
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-2xl font-bold tabular-nums ${a.custoAcima ? "text-rose-500" : ""}`}>
                        {a.custoPorResultado !== null ? brl(a.custoPorResultado) : "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">por resultado</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Meta: até {brl(a.alvoCusto)} · investido no mês: {brl(a.gasto)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {comparacoes.length > 0 && (
              <div className="grid gap-2 md:grid-cols-2">
                {comparacoes.map(c => <LinhaMeta key={c.chave} c={c} />)}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LinhaMeta({ c }: { c: ComparacaoMeta }) {
  const st = STATUS[c.status];
  return (
    <Collapsible className="rounded-xl border border-border/60 bg-background/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{c.label}</div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-lg font-semibold tabular-nums">{c.atual !== null ? formatarMeta(c.atual, c.formato) : "—"}</span>
            <span className="text-xs text-muted-foreground">
              {c.projetado ? "projeção · " : ""}meta {c.chave === "limite_investimento_mes" ? "até " : ""}{formatarMeta(c.alvo, c.formato)}
            </span>
          </div>
        </div>
        <Badge variant="outline" className={`shrink-0 text-[10px] ${st.cls}`}>{st.label}</Badge>
      </div>
      <p className={`mt-1 text-xs ${c.status === "fora" ? "text-rose-400" : c.status === "atencao" ? "text-amber-400" : "text-muted-foreground"}`}>{c.resumo}</p>
      {c.sugestoes.length > 0 && (
        <>
          <CollapsibleTrigger className="group mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <Lightbulb className="h-3.5 w-3.5" /> O que investigar
            <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {c.sugestoes.map(s => <li key={s}>{s}</li>)}
            </ul>
          </CollapsibleContent>
        </>
      )}
    </Collapsible>
  );
}
