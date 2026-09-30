import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, MoreHorizontal, Pencil, Trash2, Bell, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { runAllAlerts, ruleToHuman, type AlertRule } from "@/lib/alert-engine";
import { useAuth } from "@/hooks/useAuth";

interface AlertRow {
  id: string;
  name: string;
  description: string | null;
  client_id: string | null;
  rule_json: AlertRule;
  channels: { dashboard?: boolean; email?: boolean };
  cooldown_minutes: number;
  last_triggered_at: string | null;
  is_active: boolean;
}

export default function Alerts() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const canManage = role === "owner" || role === "admin";

  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [aRes, cRes, eRes] = await Promise.all([
      supabase.from("alerts").select("id, name, description, client_id, rule_json, channels, cooldown_minutes, last_triggered_at, is_active").order("created_at", { ascending: false }),
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("alert_events").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]);
    setAlerts((aRes.data as AlertRow[]) || []);
    setClients(cRes.data || []);
    setOpenCount(eRes.count || 0);
    setLoading(false);
  }

  async function toggleAlert(alert: AlertRow) {
    await supabase.from("alerts").update({ is_active: !alert.is_active }).eq("id", alert.id);
    setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, is_active: !a.is_active } : a));
  }

  async function deleteAlert(id: string) {
    const { error } = await supabase.from("alerts").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Alerta excluído"); setAlerts(prev => prev.filter(a => a.id !== id)); }
    setDeleteId(null);
  }

  async function handleRunAll() {
    setRunning(true);
    try {
      const { fired, checked } = await runAllAlerts(undefined, msg => toast.info(msg, { duration: 1200 }));
      toast.success(`Verificado ${checked} alertas — ${fired} disparo(s)`);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao verificar alertas");
    } finally {
      setRunning(false);
    }
  }

  const activeCount = alerts.filter(a => a.is_active).length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Alertas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {activeCount} ativo{activeCount !== 1 ? "s" : ""}
            {openCount > 0 && (
              <> · <span className="text-amber-600 font-medium">{openCount} aberto{openCount !== 1 ? "s" : ""}</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {openCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => navigate("/alert-events")}>
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              Ver eventos
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleRunAll} disabled={running}>
            {running ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
            Verificar agora
          </Button>
          {canManage && (
            <Button onClick={() => navigate("/alerts/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Novo alerta
            </Button>
          )}
        </div>
      </div>

      {/* Events summary card */}
      {openCount > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 cursor-pointer hover:shadow-sm transition" onClick={() => navigate("/alert-events")}>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
              <Bell className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-amber-900 dark:text-amber-200">{openCount} alerta{openCount !== 1 ? "s" : ""} aberto{openCount !== 1 ? "s" : ""}</p>
              <p className="text-xs text-amber-700 dark:text-amber-400">Clique para ver e resolver</p>
            </div>
            <ExternalLink className="h-4 w-4 text-amber-600" />
          </CardContent>
        </Card>
      )}

      {/* Alert list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : alerts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Bell className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">Nenhum alerta configurado</p>
            <p className="text-sm text-muted-foreground mt-1">Crie alertas para monitorar métricas automaticamente</p>
            {canManage && (
              <Button className="mt-4" onClick={() => navigate("/alerts/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Criar primeiro alerta
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => {
            const client = clients.find(c => c.id === alert.client_id);
            const rule = alert.rule_json || { conditions: [], logic: "AND" };
            const channels = alert.channels || {};

            return (
              <Card key={alert.id} className={alert.is_active ? "" : "opacity-60"}>
                <CardContent className="flex items-start gap-4 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-medium">{alert.name}</p>
                      {!alert.is_active && <Badge variant="secondary" className="text-[10px]">Pausado</Badge>}
                      {channels.email && <Badge variant="outline" className="text-[10px]">📧 Email</Badge>}
                      {channels.dashboard && <Badge variant="outline" className="text-[10px]">🔔 Dashboard</Badge>}
                    </div>
                    {alert.description && (
                      <p className="text-xs text-muted-foreground mb-1">{alert.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground font-mono bg-muted/50 rounded px-2 py-0.5 inline-block">
                      {ruleToHuman(rule)}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{client ? client.name : "Todos os clientes"}</span>
                      {alert.last_triggered_at && (
                        <span>Último disparo: {new Date(alert.last_triggered_at).toLocaleDateString("pt-BR")}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={alert.is_active}
                      onCheckedChange={() => canManage && toggleAlert(alert)}
                      disabled={!canManage}
                    />
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/alerts/${alert.id}/edit`)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteId(alert.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir alerta?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. O histórico de eventos será preservado.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteId && deleteAlert(deleteId)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
