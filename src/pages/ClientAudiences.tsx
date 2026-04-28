import { useState, useEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChevronLeft, Image } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getBreakdown,
  getHeatmap,
  type Dimension,
  type BreakdownRow,
} from "@/lib/audience-analysis";

const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "age", label: "Idade" },
  { key: "gender", label: "Gênero" },
  { key: "placement", label: "Posicionamento" },
  { key: "device_platform", label: "Dispositivo" },
  { key: "publisher_platform", label: "Plataforma" },
  { key: "country", label: "País" },
  { key: "region", label: "Região" },
];

const PERIODS = [
  { label: "7 dias", value: "7" },
  { label: "14 dias", value: "14" },
  { label: "30 dias", value: "30" },
  { key: "90", label: "90 dias", value: "90" },
];

const METRICS: { key: keyof BreakdownRow; label: string }[] = [
  { key: "spend", label: "Investimento (R$)" },
  { key: "impressions", label: "Impressões" },
  { key: "clicks", label: "Cliques" },
  { key: "ctr", label: "CTR (%)" },
  { key: "cpa", label: "CPA (R$)" },
];

function fmtValue(key: keyof BreakdownRow, v: number): string {
  if (key === "spend" || key === "cpa") return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (key === "ctr") return `${v.toFixed(2)}%`;
  return v.toLocaleString("pt-BR");
}

interface BreakdownTabProps {
  clientId: string;
  dimension: Dimension;
  days: number;
  metric: keyof BreakdownRow;
}

function BreakdownTab({ clientId, dimension, days, metric }: BreakdownTabProps) {
  const [rows, setRows] = useState<BreakdownRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getBreakdown(clientId, days, dimension)
      .then(setRows)
      .catch(() => toast.error("Erro ao carregar breakdown"))
      .finally(() => setLoading(false));
  }, [clientId, dimension, days]);

  const chartData = rows.slice(0, 12).map(r => ({
    name: r.dimension_value,
    value: r[metric] as number,
  }));

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Image className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          Sem dados de breakdown disponíveis. Execute o "Sync avançado" na galeria de criativos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Bar chart */}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10 }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis tick={{ fontSize: 10 }} width={50} />
          <Tooltip
            formatter={(v: number) => [fmtValue(metric, v), METRICS.find(m => m.key === metric)?.label]}
            contentStyle={{ fontSize: 11 }}
          />
          <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left p-2 pl-3 font-medium">Segmento</th>
              <th className="text-right p-2 font-medium">Invest.</th>
              <th className="text-right p-2 font-medium">Impressões</th>
              <th className="text-right p-2 font-medium">CTR</th>
              <th className="text-right p-2 font-medium">CPM</th>
              <th className="text-right p-2 pr-3 font-medium">CPA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.dimension_value} className={i % 2 === 1 ? "bg-muted/20" : ""}>
                <td className="p-2 pl-3 font-medium">{r.dimension_value}</td>
                <td className="p-2 text-right text-xs">{fmtValue("spend", r.spend)}</td>
                <td className="p-2 text-right text-xs">{r.impressions.toLocaleString("pt-BR")}</td>
                <td className="p-2 text-right text-xs">{r.ctr.toFixed(2)}%</td>
                <td className="p-2 text-right text-xs">{fmtValue("cpa", r.cpm)}</td>
                <td className="p-2 pr-3 text-right text-xs">{r.cpa > 0 ? fmtValue("cpa", r.cpa) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Heatmap ───────────────────────────────────────────────────────────────────
interface HeatmapTabProps {
  clientId: string;
  days: number;
}

function HeatmapTab({ clientId, days }: HeatmapTabProps) {
  const [data, setData] = useState<{ dim1Values: string[]; dim2Values: string[]; cells: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getHeatmap(clientId, days, "age", "placement")
      .then(setData)
      .catch(() => toast.error("Erro ao carregar heatmap"))
      .finally(() => setLoading(false));
  }, [clientId, days]);

  if (loading) return <Skeleton className="h-64 w-full" />;

  if (!data || data.cells.length === 0) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Sem dados suficientes. Execute o "Sync avançado" na galeria.
      </div>
    );
  }

  const maxSpend = Math.max(...data.cells.map(c => c.spend), 1);

  function colorIntensity(spend: number): string {
    const ratio = spend / maxSpend;
    const alpha = Math.round(ratio * 200 + 30);
    return `rgba(99, 102, 241, ${(alpha / 255).toFixed(2)})`;
  }

  return (
    <div className="overflow-x-auto">
      <p className="text-xs text-muted-foreground mb-4">Investimento estimado: Idade × Posicionamento</p>
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="p-2 text-left text-muted-foreground">Idade \ Posic.</th>
            {data.dim2Values.map(d2 => (
              <th key={d2} className="p-2 text-center font-medium max-w-[80px]">
                <span className="block truncate max-w-[80px]" title={d2}>{d2}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.dim1Values.map(d1 => (
            <tr key={d1}>
              <td className="p-2 font-medium pr-4">{d1}</td>
              {data.dim2Values.map(d2 => {
                const cell = data.cells.find(c => c.dim1Value === d1 && c.dim2Value === d2);
                const spend = cell?.spend || 0;
                return (
                  <td
                    key={d2}
                    className="p-0 text-center"
                    title={`R$ ${spend.toFixed(2)}\nCTR: ${cell?.ctr?.toFixed(2) || 0}%`}
                  >
                    <div
                      className="m-0.5 rounded flex items-center justify-center text-[10px] font-medium min-w-[60px] h-10"
                      style={{ backgroundColor: colorIntensity(spend), color: spend / maxSpend > 0.5 ? "#fff" : "#374151" }}
                    >
                      {spend > 0 ? `R$${(spend / 1000).toFixed(1)}k` : "—"}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-muted-foreground mt-3">
        * Valores estimados por distribuição proporcional. Para dados exatos, integre a API de cross-breakdowns do Meta.
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ClientAudiences() {
  const { id: clientId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [clientName, setClientName] = useState("");

  const days = parseInt(searchParams.get("period") || "30");
  const metric = (searchParams.get("metric") || "spend") as keyof BreakdownRow;
  const activeTab = searchParams.get("tab") || "age";

  function updateParam(key: string, value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set(key, value);
      return next;
    }, { replace: true });
  }

  useEffect(() => {
    if (!clientId) return;
    supabase.from("clients").select("name").eq("id", clientId).single()
      .then(({ data }) => { if (data) setClientName(data.name); });
  }, [clientId]);

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/clients/${clientId}/creatives`}><ChevronLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Análise de Públicos</h1>
            {clientName && <p className="text-sm text-muted-foreground">{clientName}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Period */}
          <Select value={String(days)} onValueChange={v => updateParam("period", v)}>
            <SelectTrigger className="w-28 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Metric */}
          <Select value={metric} onValueChange={v => updateParam("metric", v)}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {METRICS.map(m => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Breakdown tabs */}
      <Card>
        <CardContent className="pt-5">
          <Tabs value={activeTab} onValueChange={v => updateParam("tab", v)}>
            <TabsList className="flex-wrap h-auto gap-1 mb-5">
              {DIMENSIONS.map(d => (
                <TabsTrigger key={d.key} value={d.key} className="text-xs">
                  {d.label}
                </TabsTrigger>
              ))}
              <TabsTrigger value="heatmap" className="text-xs">Heatmap</TabsTrigger>
            </TabsList>

            {DIMENSIONS.map(d => (
              <TabsContent key={d.key} value={d.key}>
                {clientId && (
                  <BreakdownTab
                    clientId={clientId}
                    dimension={d.key}
                    days={days}
                    metric={metric}
                  />
                )}
              </TabsContent>
            ))}

            <TabsContent value="heatmap">
              {clientId && <HeatmapTab clientId={clientId} days={days} />}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
