import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Calendar, Trash2, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Schedule {
  id: string;
  client_id: string;
  cron: string;
  email_recipients: string[];
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  clients: { name: string } | null;
}

interface Client {
  id: string;
  name: string;
}

const CRON_PRESETS = [
  { label: "Semanal (Segunda às 9h)", value: "0 9 * * 1" },
  { label: "Quinzenal (dia 1 e 15 às 9h)", value: "0 9 1,15 * *" },
  { label: "Mensal (dia 1 às 9h)", value: "0 9 1 * *" },
  { label: "Personalizado", value: "custom" },
];

function cronLabel(cron: string): string {
  const preset = CRON_PRESETS.find(p => p.value === cron);
  return preset ? preset.label : cron;
}

export default function ReportSchedules() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);

  // Form state
  const [formClientId, setFormClientId] = useState("");
  const [formCron, setFormCron] = useState("0 9 1 * *");
  const [formCronPreset, setFormCronPreset] = useState("0 9 1 * *");
  const [formEmails, setFormEmails] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSchedules();
    fetchClients();
  }, []);

  async function fetchSchedules() {
    setLoading(true);
    const { data } = await supabase
      .from("report_schedules")
      .select("*, clients(name)")
      .order("created_at", { ascending: false });
    setSchedules((data as any) || []);
    setLoading(false);
  }

  async function fetchClients() {
    const { data } = await supabase.from("clients").select("id, name").order("name");
    setClients(data || []);
  }

  async function toggleActive(schedule: Schedule) {
    const { error } = await supabase
      .from("report_schedules")
      .update({ is_active: !schedule.is_active })
      .eq("id", schedule.id);

    if (error) {
      toast.error("Erro ao atualizar agendamento");
    } else {
      setSchedules(prev =>
        prev.map(s => s.id === schedule.id ? { ...s, is_active: !s.is_active } : s)
      );
    }
  }

  async function deleteSchedule(id: string) {
    const { error } = await supabase.from("report_schedules").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir agendamento");
    } else {
      toast.success("Agendamento excluído");
      setSchedules(prev => prev.filter(s => s.id !== id));
    }
  }

  async function handleCreate() {
    if (!formClientId) {
      toast.error("Selecione um cliente");
      return;
    }

    const emails = formEmails
      .split(/[,;\n]/)
      .map(e => e.trim())
      .filter(e => e.includes("@"));

    if (emails.length === 0) {
      toast.error("Informe ao menos um email válido");
      return;
    }

    setSaving(true);
    const { data: session } = await supabase.auth.getSession();
    const tenantId = session.session?.user.id;

    const { error } = await supabase.from("report_schedules").insert({
      tenant_id: tenantId,
      client_id: formClientId,
      cron: formCron,
      email_recipients: emails,
      is_active: true,
    });

    if (error) {
      toast.error("Erro ao criar agendamento");
    } else {
      toast.success("Agendamento criado");
      setShowDialog(false);
      setFormClientId("");
      setFormCron("0 9 1 * *");
      setFormEmails("");
      fetchSchedules();
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agendamentos de Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure envio automático de relatórios por email</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Agendamento
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : schedules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">Nenhum agendamento configurado</p>
            <p className="text-sm text-muted-foreground mt-1">
              Crie agendamentos para enviar relatórios automaticamente
            </p>
            <Button className="mt-4" onClick={() => setShowDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Criar Agendamento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {schedules.map(schedule => (
            <Card key={schedule.id}>
              <CardContent className="flex items-center gap-4 py-4">
                <Calendar className="h-8 w-8 text-primary shrink-0" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{schedule.clients?.name || "Cliente"}</p>
                    <Badge variant={schedule.is_active ? "default" : "secondary"}>
                      {schedule.is_active ? "Ativo" : "Pausado"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{cronLabel(schedule.cron)}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground truncate">
                      {schedule.email_recipients.join(", ")}
                    </p>
                  </div>
                  {schedule.last_run_at && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Último envio: {format(new Date(schedule.last_run_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Switch
                    checked={schedule.is_active}
                    onCheckedChange={() => toggleActive(schedule)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteSchedule(schedule.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
            <DialogDescription>Configure o envio automático de relatórios</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label className="text-xs">Cliente</Label>
              <Select value={formClientId} onValueChange={setFormClientId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Frequência</Label>
              <Select
                value={formCronPreset}
                onValueChange={v => {
                  setFormCronPreset(v);
                  if (v !== "custom") setFormCron(v);
                }}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRON_PRESETS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formCronPreset === "custom" && (
                <Input
                  value={formCron}
                  onChange={e => setFormCron(e.target.value)}
                  placeholder="* * * * *"
                  className="text-sm font-mono mt-2"
                />
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Destinatários (um por linha ou separado por vírgula)</Label>
              <textarea
                value={formEmails}
                onChange={e => setFormEmails(e.target.value)}
                placeholder="cliente@empresa.com&#10;gestor@empresa.com"
                className="w-full text-sm border rounded-md px-3 py-2 min-h-[80px] bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleCreate} disabled={saving}>
                {saving ? "Salvando..." : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
