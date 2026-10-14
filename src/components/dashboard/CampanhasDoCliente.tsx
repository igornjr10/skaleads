import { Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { type CampanhaEntrada, formatarKpi, KPI_DEF, labelGrupo } from "@/lib/analise-campanhas";
import { formatCurrency } from "@/lib/format";
import { rankingDeCampanhas } from "@/lib/painel-clientes";

/** Campanhas de um cliente em cartoes, a que mais entregou pelo objetivo primeiro. */
export function CampanhasDoCliente({ campanhas }: { campanhas: CampanhaEntrada[] }) {
  const ranking = rankingDeCampanhas(campanhas);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">
        Campanhas <span className="text-sm font-normal text-muted-foreground">· {ranking.length} com investimento na janela do último sync</span>
      </h2>
      {ranking.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhuma campanha com investimento. Sincronize o cliente em Clientes.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ranking.map(({ c, r, melhor }) => (
            <div
              key={c.id}
              className={`flex min-w-0 flex-col gap-3 rounded-2xl border p-4 ${melhor ? "border-emerald-500/40 bg-emerald-500/[0.05]" : "border-border/60 bg-card/60"}`}
            >
              <div className="flex min-w-0 items-start gap-2">
                {melhor && <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-label="Melhor campanha" />}
                <span className="min-w-0 flex-1 break-words text-sm font-medium leading-snug">{c.name}</span>
                <StatusBadge status={c.status} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px]">{labelGrupo(r.grupo)}</Badge>
                {melhor && <Badge variant="outline" className="border-emerald-500/30 text-[10px] text-emerald-400">Melhor resultado</Badge>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{r.volumeLabel}</div>
                  <div className="truncate text-base font-semibold tabular-nums">{formatarKpi(r.volume, "numero")}</div>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{r.custoLabel}</div>
                  <div className="truncate text-base font-semibold tabular-nums">{formatarKpi(r.custo, KPI_DEF[r.custoChave].formato)}</div>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">Investido</div>
                  <div className="truncate text-base font-semibold tabular-nums">{formatCurrency(Number(c.spend) || 0)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
