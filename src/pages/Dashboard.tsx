import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { aggregateMetrics, generateDailySeries, mockCampaigns, mockClients } from "@/lib/mockData";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { ArrowDown, ArrowUp, DollarSign, Eye, MousePointerClick, Percent, Target, TrendingUp } from "lucide-react";

type Period = "7" | "14" | "30";

export default function Dashboard() {
  const [client, setClient] = useState<string>("all");
  const [period, setPeriod] = useState<Period>("30");

  const clientId = client === "all" ? undefined : client;
  const metrics = useMemo(() => aggregateMetrics(clientId), [clientId]);
  const series = useMemo(() => generateDailySeries(Number(period), clientId), [clientId, period]);
  const campaigns = useMemo(
    () => (clientId ? mockCampaigns.filter((c) => c.client_id === clientId) : mockCampaigns),
    [clientId]
  );

  const kpis = [
    { label: "Gasto total", value: formatCurrency(metrics.spend), delta: 12.4, icon: DollarSign },
    { label: "Impressões", value: formatNumber(metrics.impressions), delta: 8.1, icon: Eye },
    { label: "Cliques", value: formatNumber(metrics.clicks), delta: 15.7, icon: MousePointerClick },
    { label: "CPM", value: formatCurrency(metrics.cpm), delta: -3.2, icon: TrendingUp },
    { label: "CPC", value: formatCurrency(metrics.cpc), delta: -5.8, icon: Target },
    { label: "CTR", value: formatPercent(metrics.ctr), delta: 4.3, icon: Percent },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral das suas campanhas Meta Ads</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={client} onValueChange={setClient}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {mockClients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList>
              <TabsTrigger value="7">7d</TabsTrigger>
              <TabsTrigger value="14">14d</TabsTrigger>
              <TabsTrigger value="30">30d</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label} className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</span>
                <k.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-2 text-xl font-semibold tabular-nums">{k.value}</div>
              <div className={`mt-1 flex items-center gap-1 text-xs ${k.delta >= 0 ? "text-success" : "text-destructive"}`}>
                {k.delta >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {Math.abs(k.delta).toFixed(1)}% vs período anterior
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Evolução: gasto e cliques</CardTitle>
          <CardDescription>Últimos {period} dias</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ left: 10, right: 10, top: 10 }}>
                <defs>
                  <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(24 95% 55%)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(24 95% 55%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="clicksFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(28 100% 65%)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(28 100% 65%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) =>
                    name === "spend" ? [formatCurrency(value), "Gasto"] : [formatNumber(value), "Cliques"]
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  yAxisId="left" type="monotone" dataKey="spend" name="Gasto"
                  stroke="hsl(24 95% 55%)" strokeWidth={2} fill="url(#spendFill)"
                />
                <Area
                  yAxisId="right" type="monotone" dataKey="clicks" name="Cliques"
                  stroke="hsl(28 100% 65%)" strokeWidth={2} fill="url(#clicksFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Campaigns table */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Campanhas</CardTitle>
          <CardDescription>{campaigns.length} campanhas no período</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
                <TableHead className="text-right">Impressões</TableHead>
                <TableHead className="text-right">Cliques</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">CPC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(c.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(c.impressions)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(c.clicks)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPercent(c.ctr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(c.cpc)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
