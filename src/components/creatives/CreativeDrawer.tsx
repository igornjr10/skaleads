import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { getCreativeMetrics, computeFatigue, type CreativeItem, type DailyMetric } from "@/lib/creative-analysis";

function fmtCurrency(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Props {
  creative: CreativeItem | null;
  onClose: () => void;
}

export function CreativeDrawer({ creative, onClose }: Props) {
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!creative) return;
    setLoading(true);
    getCreativeMetrics(creative.id)
      .then(setDailyMetrics)
      .finally(() => setLoading(false));
  }, [creative?.id]);

  const chartData = dailyMetrics.map(d => ({
    date: format(new Date(d.date + "T00:00:00"), "dd/MM", { locale: ptBR }),
    CTR: d.impressions > 0 ? parseFloat(((d.clicks / d.impressions) * 100).toFixed(3)) : 0,
    Investimento: d.spend,
    Frequência: d.frequency,
  }));

  const fatigue = creative ? computeFatigue(dailyMetrics) : "NONE";

  return (
    <Sheet open={!!creative} onOpenChange={open => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:w-[520px] overflow-y-auto">
        {creative && (
          <>
            <SheetHeader className="mb-4">
              <SheetTitle className="line-clamp-2 pr-4">{creative.name}</SheetTitle>
              <SheetDescription className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{creative.creative_type}</Badge>
                <Badge variant={creative.status === "ACTIVE" ? "default" : "secondary"}>
                  {creative.status}
                </Badge>
                {fatigue !== "NONE" && (
                  <Badge
                    variant="outline"
                    className={fatigue === "SEVERE" ? "border-red-400 text-red-700" : "border-yellow-400 text-yellow-700"}
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {fatigue === "SEVERE" ? "Fadiga severa" : "Fadiga moderada"}
                  </Badge>
                )}
              </SheetDescription>
            </SheetHeader>

            {/* Preview */}
            {(creative.thumbnail_url || creative.image_url) && (
              <div className="rounded-lg overflow-hidden mb-5 bg-muted">
                <img
                  src={creative.thumbnail_url || creative.image_url!}
                  alt={creative.name}
                  className="w-full max-h-64 object-contain"
                />
              </div>
            )}

            {/* Copy */}
            {(creative.title || creative.body) && (
              <div className="space-y-1 mb-5 p-3 rounded-lg bg-muted/50">
                {creative.title && <p className="text-sm font-semibold">{creative.title}</p>}
                {creative.body && <p className="text-sm text-muted-foreground">{creative.body}</p>}
              </div>
            )}

            {/* KPI summary */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: "Investimento", value: fmtCurrency(creative.spend) },
                { label: "CTR", value: `${creative.ctr.toFixed(2)}%` },
                { label: "Frequência", value: creative.frequency.toFixed(1) },
                { label: "Impressões", value: creative.impressions.toLocaleString("pt-BR") },
                { label: "Cliques", value: creative.clicks.toLocaleString("pt-BR") },
                { label: "CPA", value: creative.cpa > 0 ? fmtCurrency(creative.cpa) : "—" },
              ].map(kpi => (
                <div key={kpi.label} className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
                  <p className="text-sm font-bold mt-0.5">{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Video metrics */}
            {(creative.hookRate !== null || creative.holdRate !== null) && (
              <div className="grid grid-cols-2 gap-3 mb-5">
                {creative.hookRate !== null && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-blue-600 uppercase tracking-wide">Hook rate</p>
                    <p className="text-sm font-bold text-blue-700 mt-0.5">{creative.hookRate.toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">assistiram 25%+</p>
                  </div>
                )}
                {creative.holdRate !== null && (
                  <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-green-600 uppercase tracking-wide">Hold rate</p>
                    <p className="text-sm font-bold text-green-700 mt-0.5">{creative.holdRate.toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">completaram o vídeo</p>
                  </div>
                )}
              </div>
            )}

            {/* Timeline chart */}
            <div className="mb-2">
              <p className="text-sm font-medium mb-3">Evolução diária — CTR</p>
              {loading ? (
                <Skeleton className="h-40 w-full" />
              ) : chartData.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  Dados diários não disponíveis. Execute a sincronização avançada.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} unit="%" width={36} />
                    <Tooltip
                      formatter={(v: number) => [`${v.toFixed(2)}%`, "CTR"]}
                      contentStyle={{ fontSize: 11 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="CTR"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Fatigue explanation */}
            {fatigue !== "NONE" && dailyMetrics.length >= 10 && (
              <div className={`rounded-lg p-3 text-xs mt-4 ${fatigue === "SEVERE" ? "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400" : "bg-yellow-50 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400"}`}>
                <div className="flex items-center gap-2 font-semibold mb-1">
                  <TrendingDown className="h-3 w-3" />
                  {fatigue === "SEVERE" ? "Fadiga severa detectada" : "Fadiga moderada detectada"}
                </div>
                <p>CTR caiu em relação aos primeiros 7 dias do criativo. Considere pausar ou renovar o criativo.</p>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
