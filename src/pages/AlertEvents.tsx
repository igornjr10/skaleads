import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, AlertTriangle, Clock, BellOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AlertEvent {
  id: string;
  alert_id: string;
  triggered_at: string;
  metric_value: number | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  status: string;
  resolved_at: string | null;
  rule_snapshot: any;
  alerts: { name: string; client_id: string | null } | null;
}

const STATUS_CONFIG = {
  open: { label: "Aberto", icon: AlertTriangle, className: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/30" },
  acknowledged: { label: "Reconhecido", icon: Clock, className: "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/30" },
  resolved: { label: "Resolvido", icon: CheckCircle, className: "text-green-600 bg-green-50 border-green-200 dark:bg-green-950/30" },
};

export default function AlertEvents() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const statusFilter = searchParams.get("status") || "open";
  const clientFilter = searchParams.get("client") || "all";
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);

  function updateParam(key: string, val: string) {
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set(key, val); return n; }, { replace: true });
    setSelected(new Set());
  }

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("alert_events")
      .select("id, alert_id, triggered_at, metric_value, entity_type, entity_id, entity_name, status, resolved_at, rule_snapshot, alerts(name, client_id)")
      .order("triggered_at", { ascending: false })
      .limit(100);

    if (statusFilter !== "all") query = query.eq("status", statusFilter);

    const { data, error } = await query;
    if (error) toast.error("Erro ao carregar eventos");

    let rows = (data as AlertEvent[]) || [];

    // Client filter (based on alert's client_id)
    if (clientFilter !== "all") {
      rows = rows.filter(e => e.alerts?.client_id === clientFilter || e.entity_id === clientFilter);
    }

    setEvents(rows);
    setLoading(false);
  }, [statusFilter, clientFilter]);

  useEffect(() => {
    fetchEvents();
    supabase.from("clients").select("id, name").order("name").then(({ data }) => setClients(data || []));
  }, [fetchEvents]);

  async function updateStatus(ids: string[], status: string) {
    setBulkUpdating(true);
    const updates = ids.map(id =>
      supabase.from("alert_events").update({
        status,
        resolved_at: status === "resolved" ? new Date().toISOString() : null,
      }).eq("id", id)
    );
    await Promise.all(updates);
    toast.success(`${ids.length} evento(s) marcados como ${STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.label || status}`);
    setSelected(new Set());
    fetchEvents();
    setBulkUpdating(false);
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === events.length) setSelected(new Set());
    else setSelected(new Set(events.map(e => e.id)));
  }

  const openCount = events.filter(e => e.status === "open").length;

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Central de Alertas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {openCount > 0 ? `${openCount} alerta${openCount !== 1 ? "s" : ""} aberto${openCount !== 1 ? "s" : ""}` : "Sem alertas abertos"}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={v => updateParam("status", v)}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="open">Abertos</SelectItem>
            <SelectItem value="acknowledged">Reconhecidos</SelectItem>
            <SelectItem value="resolved">Resolvidos</SelectItem>
          </SelectContent>
        </Select>

        <Select value={clientFilter} onValueChange={v => updateParam("client", v)}>
          <SelectTrigger className="w-44 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground">{events.length} evento{events.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
          <span className="text-sm font-medium">{selected.size} selecionado{selected.size !== 1 ? "s" : ""}</span>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="outline" disabled={bulkUpdating} onClick={() => updateStatus([...selected], "acknowledged")}>
              <Clock className="mr-1 h-3 w-3" />
              Reconhecer
            </Button>
            <Button size="sm" disabled={bulkUpdating} onClick={() => updateStatus([...selected], "resolved")}>
              <CheckCircle className="mr-1 h-3 w-3" />
              Resolver
            </Button>
          </div>
        </div>
      )}

      {/* Events list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BellOff className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">Nenhum evento encontrado</p>
            <p className="text-sm text-muted-foreground mt-1">Sem alertas disparados com os filtros atuais</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Select all row */}
          <div className="flex items-center gap-3 px-2 pb-1">
            <Checkbox
              checked={selected.size === events.length && events.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-xs text-muted-foreground">Selecionar todos</span>
          </div>

          {events.map(event => {
            const cfg = STATUS_CONFIG[event.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.open;
            const Icon = cfg.icon;
            const triggeredAt = format(new Date(event.triggered_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR });
            const isSelected = selected.has(event.id);

            return (
              <Card key={event.id} className={`transition-colors ${isSelected ? "border-primary/40 bg-primary/5" : ""}`}>
                <CardContent className="flex items-start gap-3 py-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(event.id)}
                    className="mt-0.5"
                  />

                  <div className={`shrink-0 rounded-full p-1.5 border ${cfg.className}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="text-sm font-medium">{event.alerts?.name || "Alerta"}</p>
                      <Badge variant="outline" className="text-[10px]">{cfg.label}</Badge>
                      {event.entity_type && (
                        <Badge variant="secondary" className="text-[10px]">
                          {event.entity_type === "CAMPAIGN" ? "📊" : "👤"} {event.entity_type}
                        </Badge>
                      )}
                    </div>
                    {event.entity_name && (
                      <p className="text-xs text-muted-foreground">{event.entity_name}</p>
                    )}
                    {event.metric_value !== null && (
                      <p className="text-xs text-muted-foreground">Valor: <span className="font-mono">{Number(event.metric_value).toFixed(2)}</span></p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">{triggeredAt}</p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {event.status === "open" && (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => updateStatus([event.id], "acknowledged")}>
                          Reconhecer
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600 hover:text-green-700" onClick={() => updateStatus([event.id], "resolved")}>
                          Resolver
                        </Button>
                      </>
                    )}
                    {event.status === "acknowledged" && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600 hover:text-green-700" onClick={() => updateStatus([event.id], "resolved")}>
                        Resolver
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
