import { useEffect, useMemo, useState } from "react";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Info, Loader2, Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CUSTO_OPERACIONAL_PADRAO, calcularFinanceiro, referenciaDoSegmento } from "@/lib/financeiro-cliente";
import { errorMessage } from "@/lib/utils";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PODE_VER = ["owner", "admin", "analyst"];

interface Mes {
  faturamento: number | null;
  investimento_manual: number | null;
  custos_efetivos: number | null;
  observacao: string | null;
}

const MES_VAZIO: Mes = { faturamento: null, investimento_manual: null, custos_efetivos: null, observacao: null };

function numero(texto: string): number | null | "invalido" {
  const t = texto.trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return n >= 0 && Number.isFinite(n) ? n : "invalido";
}

const texto = (v: number | null) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

/**
 * Faturamento, custos, ROAS e ROI do cliente por mes. Os numeros de dinheiro
 * vem do que o cliente informa; o que e estimativa aparece marcado como tal.
 */
export function ClientFinanceiroCard({ clientId, segmento }: { clientId: string; segmento: string | null }) {
  const { role } = useAuth();
  const meses = useMemo(
    () => Array.from({ length: 12 }, (_, i) => format(subMonths(new Date(), i), "yyyy-MM-01")),
    []
  );
  const [mes, setMes] = useState(meses[0]);
  const [dados, setDados] = useState<Mes>(MES_VAZIO);
  const [pct, setPct] = useState(CUSTO_OPERACIONAL_PADRAO);
  const [investimentoMeta, setInvestimentoMeta] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [indisponivel, setIndisponivel] = useState(false);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ faturamento: "", investimento: "", custos: "", pct: "", observacao: "" });

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    const fim = format(new Date(new Date(`${mes}T00:00:00`).getFullYear(), new Date(`${mes}T00:00:00`).getMonth() + 1, 0), "yyyy-MM-dd");
    Promise.all([
      supabase.from("cliente_financeiro_mes").select("faturamento, investimento_manual, custos_efetivos, observacao")
        .eq("client_id", clientId).eq("mes", mes).maybeSingle(),
      supabase.from("cliente_financeiro").select("custo_operacional_pct").eq("client_id", clientId).maybeSingle(),
      supabase.from("campaign_daily_metrics").select("spend").eq("client_id", clientId).gte("date", mes).lte("date", fim),
    ]).then(([m, cfg, gastos]) => {
      if (!ativo) return;
      setIndisponivel(!!m.error || !!cfg.error);
      setDados((m.data as Mes | null) ?? MES_VAZIO);
      setPct(cfg.data?.custo_operacional_pct ?? CUSTO_OPERACIONAL_PADRAO);
      setInvestimentoMeta((gastos.data ?? []).reduce((s, r) => s + (Number(r.spend) || 0), 0));
      setCarregando(false);
    });
    return () => { ativo = false; };
  }, [clientId, mes]);

  if (!PODE_VER.includes(role ?? "")) return null;

  const r = calcularFinanceiro({
    faturamento: dados.faturamento,
    investimentoManual: dados.investimento_manual,
    investimentoMeta,
    custosEfetivos: dados.custos_efetivos,
    custoOperacionalPct: pct,
  });
  const ref = referenciaDoSegmento(segmento);
  const rotuloMes = (m: string) => format(new Date(`${m}T00:00:00`), "MMMM 'de' yyyy", { locale: ptBR });

  function abrir() {
    setForm({
      faturamento: texto(dados.faturamento),
      investimento: texto(dados.investimento_manual),
      custos: texto(dados.custos_efetivos),
      pct: texto(pct),
      observacao: dados.observacao ?? "",
    });
    setEditando(true);
  }

  async function salvar() {
    const faturamento = numero(form.faturamento);
    const investimento = numero(form.investimento);
    const custos = numero(form.custos);
    const novoPct = numero(form.pct);
    if ([faturamento, investimento, custos, novoPct].includes("invalido")) return toast.error("Use apenas números (ex.: 12.500,00)");
    if (novoPct !== null && (novoPct as number) >= 100) return toast.error("O custo operacional precisa ficar abaixo de 100%");
    setSalvando(true);
    const [m, cfg] = await Promise.all([
      supabase.from("cliente_financeiro_mes").upsert({
        client_id: clientId,
        mes,
        faturamento: faturamento as number | null,
        investimento_manual: investimento as number | null,
        custos_efetivos: custos as number | null,
        observacao: form.observacao.trim() || null,
      }),
      supabase.from("cliente_financeiro").upsert({
        client_id: clientId,
        custo_operacional_pct: (novoPct as number | null) ?? CUSTO_OPERACIONAL_PADRAO,
      }),
    ]);
    setSalvando(false);
    const erro = m.error ?? cfg.error;
    if (erro) return toast.error(errorMessage(erro, "Não foi possível salvar o financeiro"));
    setDados({
      faturamento: faturamento as number | null,
      investimento_manual: investimento as number | null,
      custos_efetivos: custos as number | null,
      observacao: form.observacao.trim() || null,
    });
    setPct((novoPct as number | null) ?? CUSTO_OPERACIONAL_PADRAO);
    setEditando(false);
    toast.success("Financeiro salvo");
  }

  const kpis = [
    { label: "Faturamento atribuído", valor: dados.faturamento !== null ? brl(dados.faturamento) : "—", nota: dados.faturamento !== null ? "informado" : "não informado" },
    { label: "Investimento em anúncios", valor: brl(r.investimento), nota: r.investimentoFonte === "manual" ? "informado" : "registrado na Meta" },
    { label: "Custos operacionais", valor: brl(r.custosOperacionais), nota: r.custosFonte === "efetivo" ? "efetivos" : `estimado · ${String(pct).replace(".", ",")}% do faturamento` },
    { label: "Margem de lucro", valor: r.margem !== null ? `${r.margem.toFixed(1).replace(".", ",")}%` : "—", nota: r.estimado ? "estimada" : "com custos efetivos" },
    { label: "ROAS", valor: r.roas !== null ? `${r.roas.toFixed(2).replace(".", ",")}x` : "—", nota: "faturamento ÷ investimento" },
    { label: "ROI", valor: r.roi !== null ? `${r.roi.toFixed(0)}%` : "—", nota: r.estimado ? "estimado" : "com custos efetivos" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wallet className="h-4 w-4" /> Financeiro do cliente
          {!carregando && dados.faturamento !== null && (
            <Badge variant="outline" className={r.estimado ? "border-amber-500/30 bg-amber-500/10 text-amber-400" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}>
              {r.estimado ? "Estimativa" : "Custos confirmados"}
            </Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select value={mes} onValueChange={m => { setMes(m); setEditando(false); }}>
            <SelectTrigger className="h-8 w-44 capitalize"><SelectValue /></SelectTrigger>
            <SelectContent>
              {meses.map(m => <SelectItem key={m} value={m} className="capitalize">{rotuloMes(m)}</SelectItem>)}
            </SelectContent>
          </Select>
          {!editando && !indisponivel && (
            <Button variant="ghost" size="sm" onClick={abrir} disabled={carregando}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Lançar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {indisponivel ? (
          <p className="text-sm text-muted-foreground">O controle financeiro ainda não está ativo neste ambiente (falta aplicar a migration de metas e financeiro).</p>
        ) : carregando ? (
          <p className="text-sm text-muted-foreground"><Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" />Carregando...</p>
        ) : editando ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Faturamento atribuído aos anúncios (R$)</Label>
                <Input inputMode="decimal" placeholder="Ex.: 25.000,00" value={form.faturamento} onChange={e => setForm(f => ({ ...f, faturamento: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Investimento em anúncios (R$)</Label>
                <Input inputMode="decimal" placeholder={`Meta registrou ${brl(investimentoMeta)}`} value={form.investimento} onChange={e => setForm(f => ({ ...f, investimento: e.target.value }))} />
                <p className="text-[11px] text-muted-foreground">Em branco usa o valor da Meta.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Custo operacional estimado (% do faturamento)</Label>
                <Input inputMode="decimal" placeholder="30" value={form.pct} onChange={e => setForm(f => ({ ...f, pct: e.target.value }))} />
                {ref && (
                  <p className="text-[11px] text-muted-foreground">
                    Referência para {ref.label.toLowerCase()}: ~{ref.pct}% (sugestão de mercado, não é dado do cliente).{" "}
                    <button type="button" className="text-primary hover:underline" onClick={() => setForm(f => ({ ...f, pct: String(ref.pct) }))}>Usar</button>
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Custos efetivos do mês (R$)</Label>
                <Input inputMode="decimal" placeholder="Se o cliente informou" value={form.custos} onChange={e => setForm(f => ({ ...f, custos: e.target.value }))} />
                <p className="text-[11px] text-muted-foreground">Quando preenchido, substitui a estimativa por %.</p>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observação</Label>
              <Textarea rows={2} value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="De onde veio o número, o que entrou ou não..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditando(false)} disabled={salvando}>Cancelar</Button>
              <Button size="sm" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              {kpis.map(k => (
                <div key={k.label} className="min-w-0 rounded-xl border border-border/60 bg-background/40 p-3">
                  <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground" title={k.label}>{k.label}</div>
                  <div className="mt-1 truncate text-lg font-semibold tabular-nums">{k.valor}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{k.nota}</div>
                </div>
              ))}
            </div>
            {dados.faturamento === null && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Lance o faturamento que o cliente atribui aos anúncios para calcular ROAS, ROI e margem.
              </p>
            )}
            {dados.observacao && <p className="text-xs text-muted-foreground">Obs.: {dados.observacao}</p>}
            <p className="text-[11px] text-muted-foreground/80">
              ROAS = faturamento ÷ investimento. ROI = lucro estimado ÷ (investimento + custos operacionais).
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
