import { useEffect, useState } from "react";
import { Crosshair, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hojeISO } from "@/lib/demandas";
import { type Alvos, type AvaliacaoMeta, type MetricaDiaria, avaliarMeta } from "@/lib/metas";
import { errorMessage } from "@/lib/utils";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SITUACAO: Record<AvaliacaoMeta["situacao"], { label: string; cls: string }> = {
  sem_meta: { label: "Sem meta", cls: "border-slate-200 bg-slate-50 text-slate-600" },
  cedo: { label: "Início do mês", cls: "border-sky-200 bg-sky-50 text-sky-700" },
  no_ritmo: { label: "No ritmo", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  abaixo: { label: "Abaixo da meta", cls: "border-rose-200 bg-rose-50 text-rose-700" },
};

const PODE_EDITAR = ["owner", "admin", "analyst"];

export function ClientMetasCard({ clientId, alvos, onSalvo }: {
  clientId: string;
  alvos: Alvos;
  onSalvo?: (alvos: Alvos) => void;
}) {
  const { role } = useAuth();
  const [dias, setDias] = useState<MetricaDiaria[] | null>(null);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ resultados: "", custo: "" });

  useEffect(() => {
    const inicio = `${hojeISO(new Date()).slice(0, 7)}-01`;
    supabase
      .from("campaign_daily_metrics")
      .select("date, spend, messages, calls, directions, leads")
      .eq("client_id", clientId)
      .gte("date", inicio)
      .then(({ data }) => setDias((data ?? []) as MetricaDiaria[]));
  }, [clientId]);

  function abrirEdicao() {
    setForm({
      resultados: alvos.alvo_resultados_mes ? String(alvos.alvo_resultados_mes) : "",
      custo: alvos.alvo_custo_resultado ? String(alvos.alvo_custo_resultado).replace(".", ",") : "",
    });
    setEditando(true);
  }

  async function salvar() {
    const resultados = form.resultados.trim() ? Math.round(Number(form.resultados)) : null;
    const custo = form.custo.trim() ? Number(form.custo.replace(/\./g, "").replace(",", ".")) : null;
    if ((resultados !== null && !(resultados > 0)) || (custo !== null && !(custo > 0))) {
      return toast.error("Use números maiores que zero, ou deixe em branco para não ter meta");
    }
    setSalvando(true);
    const { error } = await supabase.rpc("definir_metas_cliente", {
      p_client_id: clientId,
      p_resultados_mes: resultados,
      p_custo_resultado: custo,
    });
    setSalvando(false);
    if (error) return toast.error(errorMessage(error, "Não foi possível salvar a meta"));
    toast.success("Meta salva");
    setEditando(false);
    onSalvo?.({ alvo_resultados_mes: resultados, alvo_custo_resultado: custo });
  }

  const hoje = hojeISO(new Date());
  const a = dias ? avaliarMeta(alvos, dias, hoje) : null;
  const tom = a ? SITUACAO[a.situacao] : null;
  const pct = a?.alvoResultados ? Math.min((a.resultados / a.alvoResultados) * 100, 100) : 0;
  const esperadoHoje = a?.alvoResultados ? (a.alvoResultados * a.diaDoMes) / a.diasNoMes : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
          <Crosshair className="h-4 w-4" /> Meta do mês
          {tom && <Badge variant="outline" className={tom.cls}>{tom.label}</Badge>}
        </CardTitle>
        {PODE_EDITAR.includes(role ?? "") && !editando && (
          <Button variant="ghost" size="sm" onClick={abrirEdicao}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> {a?.situacao === "sem_meta" ? "Definir meta" : "Editar"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {editando ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Resultados no mês</Label>
                <Input inputMode="numeric" placeholder="Ex.: 120" value={form.resultados}
                  onChange={e => setForm(f => ({ ...f, resultados: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Custo máximo por resultado (R$)</Label>
                <Input inputMode="decimal" placeholder="Ex.: 15,00" value={form.custo}
                  onChange={e => setForm(f => ({ ...f, custo: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Resultado = mensagens + ligações + rotas + leads. Deixe em branco o que não tiver meta.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditando(false)} disabled={salvando}>Cancelar</Button>
              <Button size="sm" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar meta"}</Button>
            </div>
          </div>
        ) : !a ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : a.situacao === "sem_meta" ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma meta definida. Com ela o cliente aparece na visão da agência e o Cérebro avisa quando sair do ritmo.
          </p>
        ) : (
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
                  Projeção para o fim do mês: <strong className={a.resultadosAbaixo ? "text-rose-600" : ""}>{a.projecao}</strong>
                  {" "}· esperado até hoje: {Math.round(esperadoHoje)}
                </p>
              </div>
            )}
            {a.alvoCusto !== null && (
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-2xl font-bold tabular-nums ${a.custoAcima ? "text-rose-600" : ""}`}>
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
      </CardContent>
    </Card>
  );
}
