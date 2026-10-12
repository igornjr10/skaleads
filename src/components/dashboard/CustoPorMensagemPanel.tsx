import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { MessageCircle } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  type CampanhaCusto, type ClienteCusto, type DiaCliente,
  FATIA_MINIMA_SERIE, evolucaoSemanal, resumirCustoMensagem,
} from "@/lib/custo-mensagem";

/**
 * Custo medio por mensagem da agencia. Campanhas vem com a janela do ultimo
 * sync (30 dias), entao todas comparam o mesmo periodo.
 */
export function CustoPorMensagemPanel({ campanhas, dias, clienteId }: {
  campanhas: CampanhaCusto[];
  dias: DiaCliente[];
  /** Com um cliente selecionado, mostra so a linha dele. */
  clienteId?: string;
}) {
  const [clientes, setClientes] = useState<ClienteCusto[]>([]);

  useEffect(() => {
    // Sem a coluna da meta (migration pendente) a lista vem sem meta, mas vem.
    supabase.from("clients").select("id, name, alvo_custo_mensagem").then(({ data, error }) => {
      if (!error) return setClientes((data ?? []) as ClienteCusto[]);
      supabase.from("clients").select("id, name").then(({ data: d }) => setClientes((d ?? []) as ClienteCusto[]));
    });
  }, []);

  const resumo = useMemo(() => resumirCustoMensagem(campanhas, clientes), [campanhas, clientes]);
  const serie = useMemo(() => {
    const dedicados = new Set(resumo.clientes.filter(c => c.fatiaMensagens >= FATIA_MINIMA_SERIE).map(c => c.clientId));
    return evolucaoSemanal(dias, dedicados).map(p => ({ ...p, label: format(parseISO(p.semana), "dd/MM") }));
  }, [dias, resumo.clientes]);

  if (resumo.clientes.length === 0) {
    return (
      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-4 w-4 text-primary" /> Custo por mensagem</CardTitle>
          <CardDescription>Nenhuma campanha de mensagens com investimento na janela do último sync.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const unico = clienteId ? resumo.clientes.find(c => c.clientId === clienteId) : null;
  const kpis = unico
    ? [
        { label: "Custo por mensagem", valor: unico.custo !== null ? formatCurrency(unico.custo) : "—" },
        { label: "Meta", valor: unico.meta ? formatCurrency(unico.meta) : "Sem meta" },
        { label: "Investido em mensagens", valor: formatCurrency(unico.investimento) },
        { label: "Mensagens", valor: formatNumber(unico.mensagens) },
      ]
    : [
        { label: "Custo médio geral", valor: resumo.custoMedio !== null ? formatCurrency(resumo.custoMedio) : "—" },
        { label: "Média por cliente", valor: resumo.mediaPorCliente !== null ? formatCurrency(resumo.mediaPorCliente) : "—" },
        { label: "Investido em mensagens", valor: formatCurrency(resumo.investimento) },
        { label: "Mensagens geradas", valor: formatNumber(resumo.mensagens) },
      ];

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-4 w-4 text-primary" /> Custo por mensagem</CardTitle>
        <CardDescription>
          Só campanhas de mensagens, últimos 30 dias (janela do sync). Custo geral = investimento ÷ mensagens dessas campanhas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map(k => (
            <div key={k.label} className="min-w-0 rounded-xl border border-border/60 bg-background/40 p-3">
              <div className="truncate text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
              <div className="mt-1 truncate text-xl font-semibold tabular-nums">{k.valor}</div>
            </div>
          ))}
        </div>

        {!unico && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-400">{resumo.acimaDaMeta} acima da meta</Badge>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">{resumo.abaixoDaMeta} dentro da meta</Badge>
            {resumo.semMeta > 0 && <Badge variant="outline">{resumo.semMeta} sem meta de custo por mensagem</Badge>}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Evolução semanal</div>
            {serie.filter(p => p.custo !== null).length < 2 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Poucas semanas com dados. A evolução usa contas em que mensagens são pelo menos 80% do investimento.
              </p>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie} margin={{ left: 0, right: 10, top: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `R$${v}`} width={52} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => [formatCurrency(v), "Custo por mensagem"]}
                    />
                    <Line type="monotone" dataKey="custo" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {!unico && (
            <div className="min-w-0">
              <div className="mb-2 text-xs font-medium text-muted-foreground">Por cliente (mais caro primeiro)</div>
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {resumo.clientes.map(c => (
                  <Link
                    key={c.clientId}
                    to={`/clients/${c.clientId}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/40"
                  >
                    <span className="min-w-0 flex-1 truncate" title={c.nome}>{c.nome}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatNumber(c.mensagens)} msg</span>
                    <span className="w-20 shrink-0 text-right font-medium tabular-nums">{c.custo !== null ? formatCurrency(c.custo) : "—"}</span>
                    <span className={`w-16 shrink-0 text-right text-xs tabular-nums ${c.desvioPct === null ? "text-muted-foreground" : c.desvioPct > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                      {c.desvioPct === null ? "—" : `${c.desvioPct > 0 ? "+" : ""}${Math.round(c.desvioPct)}%`}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
