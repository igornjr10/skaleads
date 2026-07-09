import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Pencil, Send, Loader2, Users } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ScheduledMessage {
  id: string;
  name: string;
  message: string;
  target_group_jids: string[];
  send_time: string;
  is_active: boolean;
  last_sent_date: string | null;
}

interface WaGroup {
  id: string;
  subject: string;
}

const DEFAULT_MESSAGE =
  "Bom dia pessoal tudo bem? quero desejar um ótimo dia para todos nós e caso tenham alguma duvida, fiquem a vontade para está falando aqui 😉";

export default function WhatsappScheduled() {
  const [items, setItems] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<ScheduledMessage | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [groups, setGroups] = useState<WaGroup[] | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);

  const [formName, setFormName] = useState("Bom dia — Grupos de clientes");
  const [formMessage, setFormMessage] = useState(DEFAULT_MESSAGE);
  const [formTime, setFormTime] = useState("08:00");
  const [formGroups, setFormGroups] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchItems();
    loadGroups();
  }, []);

  async function fetchItems() {
    setLoading(true);
    const { data, error } = await supabase
      .from("whatsapp_scheduled_messages")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data as any) ?? []);
    setLoading(false);
  }

  async function loadGroups() {
    setLoadingGroups(true);
    try {
      const { data, error } = await supabase.functions.invoke("list-whatsapp-groups");
      if (error) throw new Error(error.message);
      setGroups(data?.groups ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar grupos");
      setGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  }

  function resetForm() {
    setFormName("Bom dia — Grupos de clientes");
    setFormMessage(DEFAULT_MESSAGE);
    setFormTime("08:00");
    setFormGroups([]);
  }

  function openCreateDialog() {
    setEditing(null);
    resetForm();
    setShowDialog(true);
  }

  function openEditDialog(item: ScheduledMessage) {
    setEditing(item);
    setFormName(item.name);
    setFormMessage(item.message);
    setFormTime(item.send_time.slice(0, 5));
    setFormGroups(item.target_group_jids);
    setShowDialog(true);
  }

  function toggleGroup(id: string) {
    setFormGroups(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!formName.trim()) return toast.error("Dê um nome para identificar este agendamento");
    if (!formMessage.trim()) return toast.error("A mensagem não pode estar vazia");
    if (formGroups.length === 0) return toast.error("Selecione ao menos um grupo");

    setSaving(true);
    const { data: session } = await supabase.auth.getSession();
    const payload = {
      name: formName.trim(),
      message: formMessage.trim(),
      target_group_jids: formGroups,
      send_time: formTime,
      is_active: true,
      created_by: session.session?.user.id,
    };

    const { error } = editing
      ? await supabase.from("whatsapp_scheduled_messages").update(payload).eq("id", editing.id)
      : await supabase.from("whatsapp_scheduled_messages").insert(payload);

    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Agendamento atualizado" : "Agendamento criado");
    setShowDialog(false);
    fetchItems();
  }

  async function toggleActive(item: ScheduledMessage) {
    const { error } = await supabase
      .from("whatsapp_scheduled_messages")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);
    if (error) return toast.error(error.message);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i));
  }

  async function deleteItem(id: string) {
    const { error } = await supabase.from("whatsapp_scheduled_messages").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Agendamento excluído");
    setItems(prev => prev.filter(i => i.id !== id));
  }

  async function testNow(item: ScheduledMessage) {
    setTestingId(item.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-scheduled-whatsapp", {
        body: { test_id: item.id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success(`Mensagem enviada para ${data.groups} grupo(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setTestingId(null);
    }
  }

  function groupNames(jids: string[]): string {
    if (!groups) return `${jids.length} grupo(s)`;
    return jids.map(j => groups.find(g => g.id === j)?.subject ?? j).join(", ");
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mensagens Automáticas — WhatsApp</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Agende mensagens recorrentes (ex: saudação matinal) para grupos do WhatsApp
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Novo agendamento
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <WhatsAppIcon className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">Nenhuma mensagem agendada</p>
            <p className="text-sm text-muted-foreground mt-1">
              Crie um agendamento para enviar mensagens automáticas todos os dias
            </p>
            <Button className="mt-4" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Criar agendamento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <Card key={item.id}>
              <CardContent className="flex items-start gap-4 py-4">
                <WhatsAppIcon className="h-8 w-8 text-green-600 shrink-0 mt-1" />

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{item.name}</p>
                    <Badge variant={item.is_active ? "default" : "secondary"}>
                      {item.is_active ? "Ativo" : "Pausado"}
                    </Badge>
                    <Badge variant="outline">Todo dia às {item.send_time.slice(0, 5)}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{item.message}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    <span className="truncate">{groupNames(item.target_group_jids)}</span>
                  </div>
                  {item.last_sent_date && (
                    <p className="text-xs text-muted-foreground">Último envio: {item.last_sent_date}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={testingId === item.id}
                    onClick={() => testNow(item)}
                  >
                    {testingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditDialog(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Switch checked={item.is_active} onCheckedChange={() => toggleActive(item)} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    onClick={() => deleteItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
            <DialogDescription>Mensagem recorrente enviada automaticamente todos os dias</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome (só para identificação interna)</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Mensagem</Label>
              <Textarea
                value={formMessage}
                onChange={e => setFormMessage(e.target.value)}
                className="min-h-[100px] text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Horário de envio (America/Sao_Paulo)</Label>
              <Input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} className="w-32" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Grupos de destino</Label>
              {loadingGroups ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto rounded-md border p-2">
                  {(groups ?? []).map(g => (
                    <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={formGroups.includes(g.id)} onCheckedChange={() => toggleGroup(g.id)} />
                      {g.subject}
                    </label>
                  ))}
                  {groups?.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum grupo encontrado</p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : editing ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
