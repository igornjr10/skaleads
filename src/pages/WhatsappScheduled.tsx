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
import { CampoBusca, casaBusca } from "@/components/CampoBusca";
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
  dias_semana: number[] | null;
}

interface WaGroup {
  id: string;
  subject: string;
}

// 0 = domingo, como getDay() e a coluna dias_semana.
const DIAS = [
  { n: 0, curto: "D", nome: "Dom" },
  { n: 1, curto: "S", nome: "Seg" },
  { n: 2, curto: "T", nome: "Ter" },
  { n: 3, curto: "Q", nome: "Qua" },
  { n: 4, curto: "Q", nome: "Qui" },
  { n: 5, curto: "S", nome: "Sex" },
  { n: 6, curto: "S", nome: "Sáb" },
];
const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6];
const DIAS_UTEIS = [1, 2, 3, 4, 5];

type Repeticao = "diaria" | "semanal";

// Nao ha coluna de repeticao: diaria e dias_semana com os 7 dias.
function repeticaoDe(dias: number[] | null): Repeticao {
  return (dias ?? TODOS_OS_DIAS).length === 7 ? "diaria" : "semanal";
}

function descreverDias(dias: number[] | null): string {
  const lista = [...(dias ?? TODOS_OS_DIAS)].sort();
  if (lista.length === 7) return "Diariamente";
  if (lista.join() === DIAS_UTEIS.join()) return "Semanalmente: Seg a Sex";
  if (lista.join() === "0,6") return "Semanalmente: fim de semana";
  return `Semanalmente: ${lista.map(n => DIAS[n].nome).join(", ")}`;
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
  const [busca, setBusca] = useState("");
  const [buscaGrupo, setBuscaGrupo] = useState("");

  const [formName, setFormName] = useState("Bom dia — Grupos de clientes");
  const [formMessage, setFormMessage] = useState(DEFAULT_MESSAGE);
  const [formTime, setFormTime] = useState("08:00");
  const [formGroups, setFormGroups] = useState<string[]>([]);
  const [formRepeticao, setFormRepeticao] = useState<Repeticao>("diaria");
  const [formDias, setFormDias] = useState<number[]>(TODOS_OS_DIAS);
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
      if (error) {
        // FunctionsHttpError esconde o corpo — precisamos dele para ver o erro da uazapi
        const detail = await (error as any)?.context?.json?.().catch(() => null);
        throw new Error(detail?.error || error.message);
      }
      if (data?.error) throw new Error(data.error);
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
    setFormRepeticao("diaria");
    setFormDias(TODOS_OS_DIAS);
  }

  function escolherRepeticao(r: Repeticao) {
    setFormRepeticao(r);
    if (r === "semanal" && formDias.length === 7) setFormDias(DIAS_UTEIS);
  }

  function openCreateDialog() {
    setEditing(null);
    setBuscaGrupo("");
    resetForm();
    setShowDialog(true);
  }

  function openEditDialog(item: ScheduledMessage) {
    setEditing(item);
    setBuscaGrupo("");
    setFormName(item.name);
    setFormMessage(item.message);
    setFormTime(item.send_time.slice(0, 5));
    setFormGroups(item.target_group_jids);
    setFormRepeticao(repeticaoDe(item.dias_semana));
    setFormDias(item.dias_semana ?? TODOS_OS_DIAS);
    setShowDialog(true);
  }

  function toggleGroup(id: string) {
    setFormGroups(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!formName.trim()) return toast.error("Dê um nome para identificar este agendamento");
    if (!formMessage.trim()) return toast.error("A mensagem não pode estar vazia");
    if (formGroups.length === 0) return toast.error("Selecione ao menos um grupo");
    const dias = formRepeticao === "diaria" ? TODOS_OS_DIAS : [...formDias].sort();
    if (dias.length === 0) return toast.error("Escolha ao menos um dia da semana");

    setSaving(true);
    const { data: session } = await supabase.auth.getSession();
    const payload = {
      name: formName.trim(),
      message: formMessage.trim(),
      target_group_jids: formGroups,
      send_time: formTime,
      dias_semana: dias,
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
      if (error) {
        // FunctionsHttpError esconde o corpo — precisamos dele para ver o erro da uazapi
        const detail = await (error as any)?.context?.json?.().catch(() => null);
        throw new Error(detail?.error || error.message);
      }
      if (data?.error) throw new Error(data.error);

      if (data?.failed > 0) {
        const first = (data.results ?? []).find((r: any) => !r.ok);
        toast.warning(
          `Enviada para ${data.sent} de ${data.groups} grupo(s) — ${data.failed} falhou: ${first?.error ?? "erro desconhecido"}`
        );
      } else {
        toast.success(`Mensagem enviada para ${data.groups} grupo(s)`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar", { duration: 10000 });
    } finally {
      setTestingId(null);
    }
  }

  function groupNames(jids: string[]): string {
    if (!groups) return `${jids.length} grupo(s)`;
    return jids.map(j => groups.find(g => g.id === j)?.subject ?? j).join(", ");
  }

  const visiveis = items.filter(i => casaBusca(busca, i.name, i.message, groupNames(i.target_group_jids)));
  const gruposVisiveis = (groups ?? []).filter(g => formGroups.includes(g.id) || casaBusca(buscaGrupo, g.subject));

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
              Crie um agendamento para enviar mensagens automáticas diária ou semanalmente
            </p>
            <Button className="mt-4" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Criar agendamento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <CampoBusca value={busca} onChange={setBusca} placeholder="Buscar por nome, mensagem ou grupo" className="max-w-sm" />
          {visiveis.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum agendamento encontrado</p>
          )}
          {visiveis.map(item => (
            <Card key={item.id}>
              <CardContent className="flex items-start gap-4 py-4">
                <WhatsAppIcon className="h-8 w-8 text-green-600 shrink-0 mt-1" />

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{item.name}</p>
                    <Badge variant={item.is_active ? "default" : "secondary"}>
                      {item.is_active ? "Ativo" : "Pausado"}
                    </Badge>
                    <Badge variant="outline">{descreverDias(item.dias_semana)} às {item.send_time.slice(0, 5)}</Badge>
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
            <DialogDescription>Mensagem recorrente enviada automaticamente, todo dia ou nos dias da semana escolhidos</DialogDescription>
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
              <Label className="text-xs">Repetir agendamento</Label>
              <div className="grid grid-cols-2 gap-1 rounded-md border p-1">
                {([
                  { valor: "diaria", rotulo: "Diariamente" },
                  { valor: "semanal", rotulo: "Semanalmente" },
                ] as const).map(o => (
                  <button
                    key={o.valor}
                    type="button"
                    onClick={() => escolherRepeticao(o.valor)}
                    className={`h-8 rounded text-sm font-medium transition-colors ${
                      formRepeticao === o.valor ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {o.rotulo}
                  </button>
                ))}
              </div>
              {formRepeticao === "diaria" && (
                <p className="text-xs text-muted-foreground">Envia todos os dias às {formTime}</p>
              )}
            </div>

            {formRepeticao === "semanal" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Dias da semana</Label>
              <div className="flex flex-wrap gap-1.5">
                {DIAS.map(d => {
                  const ativo = formDias.includes(d.n);
                  return (
                    <button
                      key={d.n}
                      type="button"
                      title={d.nome}
                      onClick={() => setFormDias(prev => ativo ? prev.filter(x => x !== d.n) : [...prev, d.n])}
                      className={`h-9 w-9 rounded-full border text-sm font-semibold transition-colors ${
                        ativo ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {d.curto}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFormDias(DIAS_UTEIS)}>Seg a Sex</Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFormDias([1, 3, 5])}>Seg, Qua, Sex</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {formDias.length ? `${descreverDias(formDias)} às ${formTime}` : "Nenhum dia escolhido"}
              </p>
            </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Grupos de destino</Label>
              {loadingGroups ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <div className="space-y-2">
                {(groups?.length ?? 0) > 6 && (
                  <CampoBusca value={buscaGrupo} onChange={setBuscaGrupo} placeholder="Buscar grupo" />
                )}
                <div className="space-y-2 max-h-48 overflow-y-auto rounded-md border p-2">
                  {gruposVisiveis.map(g => (
                    <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={formGroups.includes(g.id)} onCheckedChange={() => toggleGroup(g.id)} />
                      {g.subject}
                    </label>
                  ))}
                  {gruposVisiveis.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum grupo encontrado</p>
                  )}
                </div>
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
