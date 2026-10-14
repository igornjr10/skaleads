import { AlertTriangle, ArrowDown, ArrowUp, ChevronRight, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ClientAvatar } from "@/components/ClientAvatar";
import { formatCurrency, formatNumber } from "@/lib/format";
import { type LinhaCliente, type MelhorCampanha, variacao } from "@/lib/painel-clientes";

function Delta({ atual, antes, menorMelhor = false }: { atual: number | null; antes: number | null; menorMelhor?: boolean }) {
  const v = variacao(atual, antes);
  if (v == null || Math.abs(v) < 0.01) return null;
  const bom = menorMelhor ? v < 0 : v > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] ${bom ? "text-success" : "text-destructive"}`}>
      {v > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(v * 100).toFixed(0)}%
    </span>
  );
}

function Numero({ label, valor, children }: { label: string; valor: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="truncate text-base font-semibold tabular-nums">{valor}</span>
        {children}
      </div>
    </div>
  );
}

export function CartaoMelhorCampanha({ m }: { m: MelhorCampanha | null }) {
  if (!m) {
    return (
      <div className="flex min-w-0 items-center rounded-xl border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
        Nenhuma campanha com resultado na janela do último sync.
      </div>
    );
  }
  return (
    <div className="min-w-0 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <Trophy className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <span className="truncate text-xs font-medium" title={m.nome}>{m.nome}</span>
        <Badge variant="outline" className="ml-auto shrink-0 border-emerald-500/30 text-[10px] text-emerald-400">{m.objetivo}</Badge>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span><strong className="text-foreground tabular-nums">{formatNumber(m.volume)}</strong> {m.unidade}</span>
        <span>{m.custoLabel}: <strong className="text-foreground tabular-nums">{formatCurrency(m.custo)}</strong></span>
        <span>Investido: <strong className="text-foreground tabular-nums">{formatCurrency(m.investido)}</strong></span>
      </div>
    </div>
  );
}

/** Lista de clientes do Dashboard (visao "todos os clientes"). */
export function PainelClientes({ linhas, dias, onAbrir }: {
  linhas: LinhaCliente[];
  dias: number;
  onAbrir: (clientId: string) => void;
}) {
  const comAtencao = linhas.filter(l => l.atencao.length > 0);

  return (
    <div className="space-y-6">
      {comAtencao.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Precisa de atenção
            <span className="text-sm font-normal text-muted-foreground">({comAtencao.length})</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {comAtencao.map(l => {
              const grave = l.atencao.some(a => a.gravidade === "alta");
              return (
                <button
                  key={l.cliente.id}
                  type="button"
                  onClick={() => onAbrir(l.cliente.id)}
                  className={`flex min-w-0 items-start gap-3 rounded-2xl border p-3 text-left transition-colors hover:bg-card ${grave ? "border-destructive/40 bg-destructive/[0.04]" : "border-amber-500/40 bg-amber-500/[0.04]"}`}
                >
                  <ClientAvatar name={l.cliente.name} logoUrl={l.cliente.logo_url ?? null} className="h-9 w-9" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{l.cliente.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {l.atencao.map(a => (
                        <Badge
                          key={a.texto}
                          variant="outline"
                          className={`text-[10px] ${a.gravidade === "alta" ? "border-destructive/40 text-destructive" : "border-amber-500/40 text-amber-500"}`}
                        >
                          {a.texto}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-1.5 text-[11px] text-muted-foreground">
                      {formatCurrency(l.investido)} investidos · {formatNumber(l.resultados)} resultados
                      {l.custoPorResultado != null && ` · ${formatCurrency(l.custoPorResultado)} cada`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">
          Clientes <span className="text-sm font-normal text-muted-foreground">· últimos {dias} dias, com a campanha que mais entregou pelo objetivo</span>
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border/60">
          <div className="hidden gap-4 border-b border-border/60 bg-card/40 px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,2fr)_16px]">
            <span>Cliente</span><span>Investido · resultados · custo</span><span>Melhor campanha</span><span />
          </div>
          {linhas.map(l => (
            <button
              key={l.cliente.id}
              type="button"
              onClick={() => onAbrir(l.cliente.id)}
              className="grid w-full gap-3 border-b border-border/40 px-4 py-3 text-left transition-colors last:border-0 hover:bg-card/60 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,2fr)_16px] lg:items-center lg:gap-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <ClientAvatar name={l.cliente.name} logoUrl={l.cliente.logo_url ?? null} className="h-9 w-9" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{l.cliente.name}</div>
                  {l.atencao.length > 0 ? (
                    <div className={`truncate text-[11px] ${l.atencao.some(a => a.gravidade === "alta") ? "text-destructive" : "text-amber-500"}`}>
                      {l.atencao.map(a => a.texto).join(" · ")}
                    </div>
                  ) : (
                    <div className="text-[11px] text-success">{l.investido > 0 ? "Dentro do esperado" : "Sem veiculação no período"}</div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Numero label="Investido" valor={formatCurrency(l.investido)} />
                <Numero label="Resultados" valor={formatNumber(l.resultados)}>
                  <Delta atual={l.resultados} antes={l.resultadosAntes} />
                </Numero>
                <Numero label="Custo/result." valor={l.custoPorResultado != null ? formatCurrency(l.custoPorResultado) : "—"}>
                  <Delta atual={l.custoPorResultado} antes={l.custoAntes} menorMelhor />
                </Numero>
              </div>
              <CartaoMelhorCampanha m={l.melhor} />
              <ChevronRight className="hidden h-4 w-4 text-muted-foreground lg:block" />
            </button>
          ))}
          {linhas.length === 0 && <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum cliente ativo.</div>}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Resultado = mensagens + ligações + rotas + leads. A melhor campanha considera o objetivo dela (mensagem, cadastro, clique ou alcance) e vem da janela do último sync.
        </p>
      </section>
    </div>
  );
}
