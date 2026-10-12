import { useState } from "react";
import { ArrowDown, ArrowUp, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { GRUPOS_DE_METRICAS, METRICAS, type MetricaRelatorio } from "@/lib/report-metricas";

interface Props {
  value: MetricaRelatorio[];
  onChange: (next: MetricaRelatorio[]) => void;
  /** Envio automatico: so metricas que o sync grava no banco. */
  somenteDoBanco?: boolean;
}

export function SeletorDeMetricas({ value, onChange, somenteDoBanco = false }: Props) {
  const [ordenando, setOrdenando] = useState(false);
  const disponiveis = METRICAS.filter((m) => !somenteDoBanco || m.noBanco);
  const selecionadas = value.filter((k) => disponiveis.some((m) => m.key === k));

  function alternar(key: MetricaRelatorio, marcado: boolean) {
    onChange(marcado ? [...value.filter((k) => k !== key), key] : value.filter((k) => k !== key));
  }

  function alternarGrupo(chaves: MetricaRelatorio[], marcar: boolean) {
    onChange(marcar ? [...value, ...chaves.filter((k) => !value.includes(k))] : value.filter((k) => !chaves.includes(k)));
  }

  function mover(indice: number, delta: number) {
    const destino = indice + delta;
    if (destino < 0 || destino >= selecionadas.length) return;
    const lista = [...selecionadas];
    [lista[indice], lista[destino]] = [lista[destino], lista[indice]];
    onChange(lista);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {GRUPOS_DE_METRICAS.map((grupo) => {
          const doGrupo = disponiveis.filter((m) => m.grupo === grupo.key);
          if (!doGrupo.length) return null;
          const chaves = doGrupo.map((m) => m.key);
          const todas = chaves.every((k) => value.includes(k));
          return (
            <fieldset key={grupo.key} className="min-w-0 rounded-xl border border-border/60 bg-background/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground" title={grupo.label}>
                  {grupo.label}
                </p>
                <button
                  type="button"
                  className="shrink-0 text-[11px] font-medium text-primary hover:underline"
                  onClick={() => alternarGrupo(chaves, !todas)}
                >
                  {todas ? "Limpar" : "Todas"}
                </button>
              </div>
              <div className="space-y-1.5">
                {doGrupo.map((m) => {
                  const id = `metrica-${m.key}`;
                  return (
                    <label key={m.key} htmlFor={id} className="flex cursor-pointer items-start gap-2 rounded-md p-1 hover:bg-muted/40">
                      <Checkbox
                        id={id}
                        checked={value.includes(m.key)}
                        onCheckedChange={(c) => alternar(m.key, c === true)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm leading-tight">{m.label}</span>
                        <span className="block break-words text-[11px] leading-tight text-muted-foreground">{m.ajuda}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {selecionadas.length === 0
            ? "Nenhuma métrica marcada: o relatório usa investimento, impressões, cliques, ROAS e CTR."
            : `${selecionadas.length} ${selecionadas.length === 1 ? "métrica" : "métricas"} no relatório`}
          {somenteDoBanco && " · Alcance, frequência e vendas dependem da consulta ao vivo da Meta e ficam só no relatório manual."}
        </p>
        {selecionadas.length > 1 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOrdenando((v) => !v)}>
            <ListOrdered className="mr-1.5 h-4 w-4" />
            {ordenando ? "Fechar ordem" : "Ajustar ordem"}
          </Button>
        )}
      </div>

      {ordenando && selecionadas.length > 1 && (
        <ol className="space-y-1.5 rounded-xl border border-border/60 p-2">
          {selecionadas.map((key, i) => {
            const def = METRICAS.find((m) => m.key === key)!;
            return (
              <li key={key} className="flex items-center gap-2 rounded-lg bg-muted/30 px-2 py-1.5">
                <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm" title={def.label}>
                  {def.label}
                </span>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir ${def.label}`}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={i === selecionadas.length - 1}
                  onClick={() => mover(i, 1)}
                  aria-label={`Descer ${def.label}`}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
