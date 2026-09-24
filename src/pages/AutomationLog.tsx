import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Activity,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Plus,
  Pencil,
  Trash2,
  Send,
  Loader2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface RunRow {
  id: string;
  job_name: string;
  started_at: string;
  finished_at: string;
  success: boolean;
  summary: Record<string, unknown>;
  error: string | null;
}

interface Manager {
  id: string;
  name: string;
  whatsapp_number: string | null;
  is_active: boolean;
}

interface WaGroup {
  id: string;
  subject: string;
}

interface ClientOption {
  id: string;
  name: string;
  manager_id: string | null;
}

const JOBS = [
  { key: "run-alerts-cron", label: "Alertas por hora" },
  { key: "send-scheduled-whatsapp", label: "Mensagens agendadas WhatsApp" },
];

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

function summaryLine(summary: Record<string, unknown>) {
  const parts = Object.entries(summary).map(([k, v]) => `${k}: ${v}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export default function AutomationLog() {
  const [loading, setLoading] = useState(true);
  const [latestByJob, setLatestByJob] = useState<Record<string, RunRow | null>>({});
  const [runs, setRuns] = useState<RunRow[]>([]);

  const [managers, setManagers] = useState<Manager[]>([]);
  const [showManagerDialog, setShowManagerDialog] = useState(false);
  const [editingManager, setEditingManager] = useState<Manager | null>(null);
  const [managerName, setManagerName] = useState("");
  const [managerNumber, setManagerNumber] = useState("");
  const [savingManager, setSavingManager] = useState(false);

  const [waGroups, setWaGroups] = useState<WaGroup[] | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  const [sendMode, setSendMode] = useState<"message" | "report">("message");
  const [messageText, setMessageText] = useState("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    load();
    loadManagers();
    loadGroups();
    loadClients();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("automation_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50);

    const rows = (data as RunRow[]) ?? [];
    setRuns(rows);

    const latest: Record<string, RunRow | null> = {};
    for (const job of JOBS) {
      latest[job.key] = rows.find(r => r.job_name === job.key) ?? null;
    }
    setLatestByJob(latest);
    setLoading(false);
  }

  async function loadManagers() {
    const { data } = await supabase.from("managers").select("*").order("name");
    setManagers((data as Manager[]) ?? []);
  }

  async function loadGroups() {
    setLoadingGroups(true);
    try {
      const { data, error } = await supabase.functions.invoke("list-whatsapp-groups");
      if (error) {
        // FunctionsHttpError esconde o corpo — precisamos dele para ver o erro da uazapi
        const detail = await (error as any)?.context?.json?.().catch(() => null);
        throw new Error(detail?.error || error.message);
      }
      setWaGroups(data?.groups ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar grupos");
      setWaGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  }

  async function loadClients() {
    const { data } = await supabase.from("clients").select("id, name, manager_id").order("name");
    setClients((data as ClientOption[]) ?? []);
  }

  function openCreateManager() {
    setEditingManager(null);
    setManagerName("");
    setManagerNumber("");
    setShowManagerDialog(true);
  }

  function openEditManager(m: Manager) {
    setEditingManager(m);
    setManagerName(m.name);
    setManagerNumber(m.whatsapp_number ?? "");
    setShowManagerDialog(true);
  }

  async function saveManager() {
    if (!managerName.trim()) return toast.error("Nome obrigatório");
    const number = managerNumber.trim().replace(/\D/g, "");

    setSavingManager(true);
    const payload = { name: managerName.trim(), whatsapp_number: number || null };
    // A RLS de escrita em managers e so admin/owner. Sem o .select(), a linha
    // barrada pela policy volta como sucesso sem gravar nada e o usuario ve
    // "Gestor atualizado" com o campo ainda vazio.
    const { data, error } = editingManager
      ? await supabase.from("managers").update(payload).eq("id", editingManager.id).select()
      : await supabase.from("managers").insert(payload).select();
    setSavingManager(false);

    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error("Sem permissao para alterar gestores — precisa ser admin ou owner");
    toast.success(editingManager ? "Gestor atualizado" : "Gestor adicionado");
    setShowManagerDialog(false);
    loadManagers();
  }

  async function deleteManager(id: string) {
    const { data, error } = await supabase.from("managers").delete().eq("id", id).select();
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error("Sem permissao para remover gestores — precisa ser admin ou owner");
    toast.success("Gestor removido");
    setManagers(prev => prev.filter(m => m.id !== id));
    setSelectedManagerIds(prev => prev.filter(id2 => id2 !== id));
  }

  function clientCountFor(managerId: string) {
    return clients.filter(c => c.manager_id === managerId).length;
  }

  function toggleManagerSelected(id: string) {
    setSelectedManagerIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  }

  function toggleGroupSelected(id: string) {
    setSelectedGroupIds(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  }

  function currentTargets(): string[] {
    const managerNumbers = managers
      .filter(m => selectedManagerIds.includes(m.id))
      .map(m => m.whatsapp_number)
      .filter((number): number is string => !!number);
    return [...managerNumbers, ...selectedGroupIds];
  }

  async function handleSendMessage() {
    const targets = currentTargets();
    if (targets.length === 0) return toast.error("Selecione ao menos um destino");
    if (!messageText.trim()) return toast.error("Escreva uma mensagem");

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-manager-message", {
        body: { targets, text: messageText.trim() },
      });
      if (error) {
        // FunctionsHttpError esconde o corpo — precisamos dele para ver o erro da uazapi
        const detail = await (error as any)?.context?.json?.().catch(() => null);
        throw new Error(detail?.error || error.message);
      }
      if (data?.error) throw new Error(data.error);
      toast.success(`Mensagem enviada para ${data.sent}/${data.total} destino(s)`);
      setMessageText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  }

  async function handleSendReport() {
    const targets = currentTargets();
    if (targets.length === 0) return toast.error("Selecione ao menos um destino");
    if (!selectedClientId) return toast.error("Selecione um cliente");

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-client-report", {
        body: { client_id: selectedClientId, targets },
      });
      if (error) {
        // FunctionsHttpError esconde o corpo — precisamos dele para ver o erro da uazapi
        const detail = await (error as any)?.context?.json?.().catch(() => null);
        throw new Error(detail?.error || error.message);
      }
      if (data?.error) throw new Error(data.error);
      toast.success("Relatório enviado!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar relatório");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Automações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Histórico de execução das automações agendadas (cron)
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {JOBS.map(job => {
            const run = latestByJob[job.key];
            return (
              <Card key={job.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                    <Activity className="h-4 w-4" /> {job.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!run ? (
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">
                      <HelpCircle className="mr-1 h-3 w-3" /> Nunca rodou
                    </Badge>
                  ) : run.success ? (
                    <div className="space-y-1">
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> OK
                      </Badge>
                      <p className="text-xs text-muted-foreground">{fmtDateTime(run.started_at)}</p>
                      <p className="text-xs text-muted-foreground">{summaryLine(run.summary)}</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                        <XCircle className="mr-1 h-3 w-3" /> Erro
                      </Badge>
                      <p className="text-xs text-muted-foreground">{fmtDateTime(run.started_at)}</p>
                      <p className="text-xs text-rose-600 truncate">{run.error}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Gestores</CardTitle>
            <Button variant="outline" size="sm" onClick={openCreateManager}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {managers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum gestor cadastrado</p>
            ) : (
              managers.map(m => (
                <div key={m.id} className="flex items-center gap-2 border-b py-2 last:border-0 text-sm">
                  <Checkbox
                    checked={selectedManagerIds.includes(m.id)}
                    onCheckedChange={() => toggleManagerSelected(m.id)}
                    disabled={!m.whatsapp_number}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.whatsapp_number ?? "sem WhatsApp"} · {clientCountFor(m.id)} conta(s)
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditManager(m)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteManager(m.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}

            <div className="pt-2">
              <Label className="text-xs flex items-center gap-1"><Users className="h-3 w-3" /> Grupos do WhatsApp</Label>
              {loadingGroups ? (
                <Loader2 className="h-4 w-4 animate-spin mt-2" />
              ) : (
                <div className="space-y-1 mt-1 max-h-40 overflow-y-auto">
                  {(waGroups ?? []).map(g => (
                    <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={selectedGroupIds.includes(g.id)} onCheckedChange={() => toggleGroupSelected(g.id)} />
                      {g.subject}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enviar agora</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={sendMode === "message" ? "default" : "outline"}
                size="sm"
                onClick={() => setSendMode("message")}
              >
                Mensagem
              </Button>
              <Button
                variant={sendMode === "report" ? "default" : "outline"}
                size="sm"
                onClick={() => setSendMode("report")}
              >
                Relatório de cliente
              </Button>
            </div>

            {sendMode === "message" ? (
              <div className="space-y-1">
                <Label className="text-xs">Mensagem</Label>
                <Textarea
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  placeholder="Escreva a mensagem..."
                  className="min-h-[100px] text-sm"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs">Cliente</Label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Destino: {currentTargets().length} selecionado(s)
            </p>

            <Button
              className="w-full"
              disabled={sending}
              onClick={sendMode === "message" ? handleSendMessage : handleSendReport}
            >
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {sending ? "Enviando..." : sendMode === "message" ? "Enviar mensagem" : "Enviar relatório"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas execuções</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            [1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma execução registrada ainda</p>
          ) : (
            runs.map(run => (
              <div key={run.id} className="flex items-center gap-3 border-b py-2 last:border-0 text-sm">
                <Badge variant="outline" className="shrink-0">
                  {JOBS.find(j => j.key === run.job_name)?.label ?? run.job_name}
                </Badge>
                <span className="text-xs text-muted-foreground shrink-0">{fmtDateTime(run.started_at)}</span>
                {run.success ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                )}
                <span className="text-xs text-muted-foreground truncate">
                  {run.success ? summaryLine(run.summary) : run.error}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={showManagerDialog} onOpenChange={setShowManagerDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingManager ? "Editar gestor" : "Novo gestor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input value={managerName} onChange={e => setManagerName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">WhatsApp (opcional)</Label>
              <Input
                value={managerNumber}
                onChange={e => setManagerNumber(e.target.value)}
                placeholder="5511999999999"
                inputMode="numeric"
              />
              <p className="text-[11px] text-muted-foreground">
                Sem número o gestor continua respondendo pelas contas, mas não entra nos envios de WhatsApp.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManagerDialog(false)}>Cancelar</Button>
            <Button onClick={saveManager} disabled={savingManager}>
              {savingManager ? "Salvando..." : editingManager ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
