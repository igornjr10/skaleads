import { useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MAX_DIAS_PERIODO,
  PRESETS_DE_PERIODO,
  hojeEmSaoPaulo,
  resolverPeriodo,
  type PeriodoSpec,
} from "@/lib/report-periodo";

interface Props {
  value: PeriodoSpec;
  onChange: (spec: PeriodoSpec) => void;
  /** Agendamento nao tem data fixa: o periodo e sempre relativo ao envio. */
  permitirIntervalo?: boolean;
  /** Texto do resumo; no agendamento a data e a do proximo envio. */
  legendaResumo?: string;
}

function valorDoSelect(spec: PeriodoSpec): string {
  if (spec.tipo === "intervalo") return "intervalo";
  if (spec.tipo === "ultimos_dias") {
    const preset = PRESETS_DE_PERIODO.find((p) => p.spec.tipo === "ultimos_dias" && p.spec.dias === spec.dias);
    return preset ? preset.valor : "n_dias";
  }
  return spec.tipo;
}

export function SeletorDePeriodo({ value, onChange, permitirIntervalo = true, legendaResumo }: Props) {
  const hoje = hojeEmSaoPaulo();
  // Escolher "N dias" e digitar 7 nao pode pular para o preset "7 dias" e
  // sumir com o campo enquanto a pessoa digita.
  const [diasLivres, setDiasLivres] = useState(() => valorDoSelect(value) === "n_dias");
  const selecionado = diasLivres && value.tipo === "ultimos_dias" ? "n_dias" : valorDoSelect(value);
  const resolvido = useMemo(() => resolverPeriodo(value, hoje), [value, hoje]);

  function escolher(valor: string) {
    setDiasLivres(valor === "n_dias");
    if (valor === "n_dias") {
      onChange({ tipo: "ultimos_dias", dias: value.tipo === "ultimos_dias" ? value.dias : 21 });
      return;
    }
    if (valor === "intervalo") {
      onChange({ tipo: "intervalo", inicio: resolvido.start, fim: resolvido.end });
      return;
    }
    const preset = PRESETS_DE_PERIODO.find((p) => p.valor === valor);
    if (preset) onChange(preset.spec);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:items-end">
        <div className="min-w-0 space-y-1">
          <Label className="text-xs">Período de análise</Label>
          <Select value={selecionado} onValueChange={escolher}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Selecione o período" />
            </SelectTrigger>
            <SelectContent>
              {PRESETS_DE_PERIODO.map((p) => (
                <SelectItem key={p.valor} value={p.valor}>
                  {p.label}
                </SelectItem>
              ))}
              <SelectItem value="n_dias">Últimos N dias (escolher)</SelectItem>
              {permitirIntervalo && <SelectItem value="intervalo">Datas personalizadas</SelectItem>}
            </SelectContent>
          </Select>
        </div>

        {selecionado === "n_dias" && value.tipo === "ultimos_dias" && (
          <div className="min-w-0 space-y-1">
            <Label className="text-xs" htmlFor="periodo-n-dias">
              Quantidade de dias
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="periodo-n-dias"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_DIAS_PERIODO}
                value={value.dias}
                onChange={(e) => {
                  const dias = Math.max(1, Math.min(MAX_DIAS_PERIODO, Math.floor(Number(e.target.value) || 1)));
                  onChange({ tipo: "ultimos_dias", dias });
                }}
                className="w-28 text-sm"
              />
              <span className="text-xs text-muted-foreground">dias até ontem</span>
            </div>
          </div>
        )}

        {value.tipo === "intervalo" && (
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <div className="min-w-0 space-y-1">
              <Label className="text-xs" htmlFor="periodo-inicio">
                Início
              </Label>
              <Input
                id="periodo-inicio"
                type="date"
                value={value.inicio}
                max={value.fim}
                onChange={(e) => e.target.value && onChange({ ...value, inicio: e.target.value })}
                className="text-sm"
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-xs" htmlFor="periodo-fim">
                Fim
              </Label>
              <Input
                id="periodo-fim"
                type="date"
                value={value.fim}
                min={value.inicio}
                max={hoje}
                onChange={(e) => e.target.value && onChange({ ...value, fim: e.target.value })}
                className="text-sm"
              />
            </div>
          </div>
        )}
      </div>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <CalendarRange className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 break-words">
          {legendaResumo ?? "Dados de"} {resolvido.label}
        </span>
      </p>
    </div>
  );
}
