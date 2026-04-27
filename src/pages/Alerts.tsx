import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";

interface Alert {
  id: string;
  name: string;
  client_id: string | null;
  metric: string;
  operator: string;
  threshold: number;
  is_active: boolean;
}

interface AlertEvent {
  id: string;
  alert_id: string;
  triggered_at: string;
  metric_value: number;
  status: string;
  alert?: { name: string };
}

interface Client { id: string; name: string }

const METRICS = [
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "ctr", label: "CTR" },
  { value: "spend", label: "Gasto" },
  { value: "conversions", label: "Conversões" },
];
const OPERATORS = [
  { value: "gt", label: "maior que" },
  { value: "lt", label: "menor que" },
  { value: "eq", label: "igual a" },
];

export default function Alerts() {
  const { role } = useAuth();
  const canManage = role === "owner" || role === "admin";
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", client_id: "all", metric: "cpc", operator: "gt", threshold: "" });

  async function loadAll() {
    const [a, e, c] = await Promise.all([
      supabase.from("alerts").select("*").order("created_at", { ascending: false }),
      supabase.from("alert_events").select("*, alert:alerts(name)").order("triggered_at", { ascending: false }).limit(50),
      supabase.from("clients").select("id, name").order("name"),
    ]);
    setAlerts((a.data as Alert[]) ?? []);
    setEvents((e.data as unknown as AlertEvent[]) ?? []);
    setClients((c.data as Client[]) ?? []);
  }

  useEffect(() => { loadAll(); }, []);

  async function createAlert(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("alerts").insert({
      name: form.name,
      client_id: form.client_id === "all" ? null : form.client_id,
      metric: form.metric,
      operator: form.operator,
      threshold: Number(form.threshold),
      is_active: true,
    });
    if (error) return toast.error(error.message);
    toast.success("Regra de alerta criada");
    setOpen(false);
    setForm({ name: "", client_id: "all", metric: "cpc", operator: "gt", threshold: "" });
    loadAll();
  }

  async function toggleAlert(a: Alert) {
    await supabase.from("alerts").update({ is_active: !a.is_active }).eq("id", a.id);
    loadAll();
  }

  async function removeAlert(a: Alert) {
    if (!confirm(`Remover alerta "${a.name}"?`)) return;
    await supabase.from("alerts").delete().eq("id", a.id);
    loadAll();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alertas</h1>
          <p className="text-sm text-muted-foreground">Configure regras e veja o histórico de disparos</p>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Nova regra</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova regra de alerta</DialogTitle></DialogHeader>
              <form onSubmit={createAlert} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Ex: CPC alto Black Friday" />
                </div>
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {clients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-2">
                    <Label>Métrica</Label>
                    <Select value={form.metric} onValueChange={(v) => setForm({ ...form, metric: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {METRICS.map((m) => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Operador</Label>
                    <Select value={form.operator} onValueChange={(v) => setForm({ ...form, operator: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Valor</Label>
                    <Input type="number" step="0.01" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} required placeholder="5.00" />
                  </div>
                </div>
                <DialogFooter><Button type="submit">Criar regra</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Regras ({alerts.length})</TabsTrigger>
          <TabsTrigger value="history">Histórico ({events.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Regras configuradas</CardTitle>
              <CardDescription>Notificações aparecem no sino do topo da plataforma</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {alerts.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  Nenhuma regra criada. Clique em "Nova regra" para começar.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Condição</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Ativa</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.map((a) => {
                      const c = clients.find((x) => x.id === a.client_id);
                      const metric = METRICS.find((m) => m.value === a.metric)?.label;
                      const op = OPERATORS.find((o) => o.value === a.operator)?.label;
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {metric} {op} <span className="text-foreground tabular-nums">{a.threshold}</span>
                          </TableCell>
                          <TableCell className="text-sm">{c?.name ?? "Todos"}</TableCell>
                          <TableCell>
                            <Switch checked={a.is_active} onCheckedChange={() => canManage && toggleAlert(a)} disabled={!canManage} />
                          </TableCell>
                          <TableCell className="text-right">
                            {canManage && (
                              <Button variant="ghost" size="icon" onClick={() => removeAlert(a)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Histórico de eventos</CardTitle>
              <CardDescription>Últimos disparos de alertas</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {events.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">Nenhum evento ainda.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Alerta</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Disparado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.alert?.name ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">{e.metric_value}</TableCell>
                        <TableCell><span className="text-xs uppercase text-muted-foreground">{e.status}</span></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(e.triggered_at), "dd MMM yyyy HH:mm", { locale: ptBR })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
