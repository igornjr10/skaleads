import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Plus, Trash2, CheckCircle, Loader2, Zap, LayoutTemplate, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  testAlert,
  ruleToHuman,
  FIXED_PERIOD_LABELS,
  ALL_MANAGERS_TARGET,
  type AlertRule,
  type AlertCondition,
  type FiredEntity,
  type MetricKey,
  type Comparator,
  type Period,
  type EntityType,
} from "@/lib/alert-engine";
import { ALERT_TEMPLATES } from "@/lib/alert-templates";

// ── Constants ─────────────────────────────────────────────────────────────────

const METRICS: { value: MetricKey; label: string; unit?: string }[] = [
  { value: "spend", label: "Investimento (R$)", unit: "R$" },
  { value: "cpa", label: "CPA (R$)", unit: "R$" },
  { value: "ctr", label: "CTR (%)", unit: "%" },
  { value: "cpm", label: "CPM (R$)", unit: "R$" },
  { value: "frequency", label: "Frequência", unit: "x" },
  { value: "roas", label: "ROAS", unit: "x" },
  { value: "balance", label: "Saldo na conta Meta (R$)", unit: "R$" },
  { value: "status", label: "Status da campanha" },
];

// Saldo e da conta de anuncio: no recorte de campanha nao existe.
const ACCOUNT_ONLY_METRICS: MetricKey[] = ["balance"];

const COMPARATORS: { value: Comparator; label: string }[] = [
  { value: "gt", label: "maior que" },
  { value: "gte", label: "maior ou igual a" },
  { value: "lt", label: "menor que" },
  { value: "lte", label: "menor ou igual a" },
  { value: "eq", label: "igual a" },
  { value: "change_pct", label: "variação % maior que" },
];

const PERIODS: { value: Period; label: string }[] = [
  { value: "1d", label: "1 dia" },
  { value: "3d", label: "3 dias" },
  { value: "7d", label: "7 dias" },
  { value: "14d", label: "14 dias" },
  { value: "30d", label: "30 dias" },
];

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: "CLIENT", label: "Cliente (agregado)" },
  { value: "CAMPAIGN", label: "Por campanha" },
];

const COOLDOWN_OPTIONS = [
  { value: 60, label: "1 hora" },
  { value: 240, label: "4 horas" },
  { value: 720, label: "12 horas" },
  { value: 1440, label: "24 horas" },
  { value: 4320, label: "3 dias" },
];

function emptyCondition(): AlertCondition {
  return { metric: "ctr", comparator: "lt", value: 1, period: "3d", entityType: "CLIENT" };
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
              i < step ? "bg-primary text-white" : i === step ? "bg-primary text-white ring-4 ring-primary/20" : "bg-muted text-muted-foreground"
            }`}
          >
            {i < step ? <CheckCircle className="h-4 w-4" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`h-0.5 w-10 transition-colors ${i < step ? "bg-primary" : "bg-muted"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AlertBuilder() {
  const { id: editId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEdit = !!editId;

  const [step, setStep] = useState(0);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ fired: boolean; count: number; entities: FiredEntity[] } | null>(null);
  const [testingWhatsapp, setTestingWhatsapp] = useState(false);
  const [showTemplates, setShowTemplates] = useState(!isEdit);

  // Form state
  const [name, setName] = useState("Novo alerta");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState("all");
  const [logic, setLogic] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState<AlertCondition[]>([emptyCondition()]);
  const [channelDashboard, setChannelDashboard] = useState(true);
  const [channelEmail, setChannelEmail] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState("");
  const [channelWhatsapp, setChannelWhatsapp] = useState(false);
  const [whatsappTarget, setWhatsappTarget] = useState("");
  const [waGroups, setWaGroups] = useState<{ id: string; subject: string }[] | null>(null);
  const [waManagers, setWaManagers] = useState<{ id: string; name: string; number: string }[] | null>(null);
  const [loadingWaDestinations, setLoadingWaDestinations] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    supabase.from("clients").select("id, name").order("name").then(({ data }) => setClients(data || []));
    if (editId) loadExisting(editId);
  }, [editId]);

  async function loadExisting(id: string) {
    const { data } = await supabase.from("alerts").select("*").eq("id", id).single();
    if (!data) return;
    setName(data.name);
    setDescription(data.description || "");
    setClientId(data.client_id || "all");
    const rule = (data.rule_json as AlertRule) || { conditions: [], logic: "AND" };
    setLogic(rule.logic || "AND");
    setConditions(rule.conditions?.length ? rule.conditions : [emptyCondition()]);
    const ch = (data.channels as any) || {};
    setChannelDashboard(ch.dashboard !== false);
    setChannelEmail(!!ch.email);
    setEmailRecipients((ch.emailRecipients || []).join("\n"));
    setChannelWhatsapp(!!ch.whatsapp);
    setWhatsappTarget(ch.whatsappTarget || "");
    setCooldown(data.cooldown_minutes || 60);
    // Salvar nao pode ressuscitar alerta pausado: quem pausou decidiu isso, e o
    // motivo costuma estar na descricao. O liga/desliga fica na lista.
    setIsActive(data.is_active !== false);
    setShowTemplates(false);
    if (ch.whatsapp) loadWaDestinations();
  }

  // Gestor e grupo cabem no mesmo campo porque a uazapi aceita o JID do grupo
  // onde receberia o numero — o destino e sempre uma string so.
  async function loadWaDestinations() {
    if (loadingWaDestinations || (waGroups && waManagers)) return;
    setLoadingWaDestinations(true);
    try {
      const [groups, managers] = await Promise.all([
        supabase.functions.invoke("list-whatsapp-groups"),
        supabase.from("managers").select("id, name, whatsapp_number").eq("is_active", true).order("name"),
      ]);
      setWaGroups(groups.error ? [] : groups.data?.groups ?? []);
      setWaManagers(
        (managers.data ?? [])
          .filter(m => m.whatsapp_number)
          .map(m => ({ id: m.id, name: m.name, number: m.whatsapp_number as string }))
      );
    } finally {
      setLoadingWaDestinations(false);
    }
  }

  function applyTemplate(templateId: string) {
    const t = ALERT_TEMPLATES.find(t => t.id === templateId);
    if (!t) return;
    setName(t.name);
    setDescription(t.description);
    setLogic(t.rule.logic);
    setConditions(t.rule.conditions);
    setCooldown(t.cooldownMinutes);
    if (t.enableWhatsapp) {
      setChannelWhatsapp(true);
      setWhatsappTarget("");
      loadWaDestinations();
    }
    setShowTemplates(false);
  }

  function updateCondition(i: number, updates: Partial<AlertCondition>) {
    setConditions(prev => prev.map((c, idx) => idx === i ? { ...c, ...updates } : c));
  }

  function addCondition() {
    if (conditions.length >= 3) return;
    setConditions(prev => [...prev, emptyCondition()]);
  }

  function removeCondition(i: number) {
    setConditions(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const rule: AlertRule = { conditions, logic };
      const fired = await testAlert(rule, clientId === "all" ? undefined : clientId);
      setTestResult({ fired: fired.length > 0, count: fired.length, entities: fired });
      if (fired.length > 0) {
        toast.success(`Alerta dispararia para ${fired.length} entidade(s)`, { duration: 4000 });
      } else {
        toast.info("Condição não atingida com dados atuais");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao testar");
    } finally {
      setTesting(false);
    }
  }

  async function handleTestWhatsapp() {
    setTestingWhatsapp(true);
    try {
      const rule: AlertRule = { conditions, logic };

      // Usa entidades do último teste ou roda agora
      let entities = testResult?.entities ?? [];
      if (entities.length === 0) {
        entities = await testAlert(rule, clientId === "all" ? undefined : clientId);
        setTestResult({ fired: entities.length > 0, count: entities.length, entities });
      }

      if (entities.length === 0) {
        toast.info("Nenhuma entidade dispararia agora — mensagem não enviada");
        return;
      }

      const { error } = await supabase.functions.invoke("send-whatsapp-alert", {
        body: {
          alertName: name || "Alerta de teste",
          alertDescription: description || null,
          entities,
          ruleSnapshot: { conditions, logic },
          target: whatsappTarget || null,
        },
      });
      if (error) throw new Error(error.message);
      toast.success(`WhatsApp enviado para ${entities.length} entidade(s)!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar WhatsApp");
    } finally {
      setTestingWhatsapp(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) { toast.error("Nome obrigatório"); return; }
    if (conditions.length === 0) { toast.error("Adicione pelo menos uma condição"); return; }

    setSaving(true);
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      client_id: clientId === "all" ? null : clientId,
      rule_json: { conditions, logic } as any,
      channels: {
        dashboard: channelDashboard,
        email: channelEmail,
        emailRecipients: emailRecipients.split(/[\n,;]/).map(e => e.trim()).filter(e => e.includes("@")),
        whatsapp: channelWhatsapp,
        whatsappTarget: whatsappTarget || undefined,
      } as any,
      cooldown_minutes: cooldown,
      is_active: isActive,
      tenant_id: userId,
      created_by: userId,
      // Clear old-schema required cols
      metric: null,
      operator: null,
      threshold: null,
    };

    const { error } = editId
      ? await supabase.from("alerts").update(payload).eq("id", editId)
      : await supabase.from("alerts").insert(payload);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(isEdit ? "Alerta atualizado" : "Alerta criado");
      navigate("/alerts");
    }
    setSaving(false);
  }

  const rule: AlertRule = { conditions, logic };
  const ruleDescription = ruleToHuman(rule);
  const whatsappTargetLabel = !whatsappTarget
    ? "Gestor (número padrão)"
    : whatsappTarget === ALL_MANAGERS_TARGET
      ? `Todos os gestores${waManagers ? ` (${waManagers.length})` : ""}`
      : waManagers?.find(m => m.number === whatsappTarget)?.name
      ?? waGroups?.find(g => g.id === whatsappTarget)?.subject
      ?? whatsappTarget;

  // ── Template picker ────────────────────────────────────────────────────────
  if (showTemplates) {
    return (
      <div className="max-w-3xl mx-auto space-y-5 p-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/alerts")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Novo Alerta</h1>
        </div>

        <div className="grid gap-3">
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setShowTemplates(false)}>
            <CardContent className="flex items-center gap-4 py-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">✏️</div>
              <div>
                <p className="font-medium">Criar do zero</p>
                <p className="text-xs text-muted-foreground">Configure todas as condições manualmente</p>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>

          <p className="text-sm font-medium text-muted-foreground pt-2">Ou use um template:</p>

          {ALERT_TEMPLATES.map(t => (
            <Card key={t.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => applyTemplate(t.id)}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-xl">{t.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.description}</p>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Wizard steps ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-5 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => step === 0 ? navigate("/alerts") : setStep(s => s - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">{isEdit ? "Editar alerta" : "Novo alerta"}</h1>
      </div>

      <StepIndicator step={step} total={4} />

      {/* Step 0 – Identity */}
      {step === 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Identificação</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Nome do alerta *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: CPA alto — Google" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descrição (opcional)</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Quando este alerta deve disparar e o que devo fazer..."
                className="min-h-[80px] text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cliente</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os clientes</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1 – Conditions */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Condições</CardTitle>
              {conditions.length > 1 && (
                <Select value={logic} onValueChange={v => setLogic(v as "AND" | "OR")}>
                  <SelectTrigger className="w-24 h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AND">TODAS (AND)</SelectItem>
                    <SelectItem value="OR">QUALQUER (OR)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {conditions.map((cond, i) => (
              <div key={i} className="border rounded-lg p-4 space-y-3">
                {conditions.length > 1 && (
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">Condição {i + 1}</Badge>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeCondition(i)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Métrica</Label>
                    <Select
                      value={cond.metric}
                      onValueChange={v => updateCondition(i, {
                        metric: v as MetricKey,
                        ...(ACCOUNT_ONLY_METRICS.includes(v as MetricKey) ? { entityType: "CLIENT" as EntityType } : {}),
                      })}
                    >
                      <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{METRICS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Entidade</Label>
                    {ACCOUNT_ONLY_METRICS.includes(cond.metric) ? (
                      <div className="h-8 flex items-center rounded-md border border-input bg-muted/50 px-3 text-xs text-muted-foreground">
                        Cliente (conta)
                      </div>
                    ) : (
                      <Select value={cond.entityType} onValueChange={v => updateCondition(i, { entityType: v as EntityType })}>
                        <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{ENTITY_TYPES.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Comparador</Label>
                    <Select value={cond.comparator} onValueChange={v => updateCondition(i, { comparator: v as Comparator })}>
                      <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{COMPARATORS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Período</Label>
                    {FIXED_PERIOD_LABELS[cond.metric] ? (
                      <div className="h-8 flex items-center rounded-md border border-input bg-muted/50 px-3 text-xs text-muted-foreground">
                        {FIXED_PERIOD_LABELS[cond.metric]}
                      </div>
                    ) : (
                      <Select value={cond.period} onValueChange={v => updateCondition(i, { period: v as Period })}>
                        <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    {cond.metric === "status"
                      ? "Valor (ex: PAUSED, ACTIVE)"
                      : cond.metric === "balance"
                        ? "Saldo em reais"
                        : "Valor"}
                  </Label>
                  <Input
                    type={cond.metric === "status" ? "text" : "number"}
                    step="0.01"
                    value={String(cond.value)}
                    onChange={e => updateCondition(i, { value: cond.metric === "status" ? e.target.value : parseFloat(e.target.value) || 0 })}
                    className="h-8 text-sm"
                    placeholder={
                      cond.comparator === "change_pct"
                        ? "Ex: -25 (queda de 25%)"
                        : cond.metric === "balance"
                          ? "Ex: 50 (avisa abaixo de R$ 50)"
                          : "Ex: 50"
                    }
                  />
                </div>
              </div>
            ))}

            {conditions.length < 3 && (
              <Button variant="outline" size="sm" className="w-full" onClick={addCondition}>
                <Plus className="mr-2 h-3 w-3" />
                Adicionar condição ({conditions.length}/3)
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2 – Channels */}
      {step === 2 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notificações</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Dashboard</p>
                <p className="text-xs text-muted-foreground">Aparece no sino do topo da plataforma</p>
              </div>
              <Switch checked={channelDashboard} onCheckedChange={setChannelDashboard} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-xs text-muted-foreground">Envia template HTML via Resend</p>
              </div>
              <Switch checked={channelEmail} onCheckedChange={setChannelEmail} />
            </div>
            {channelEmail && (
              <div className="space-y-1">
                <Label className="text-xs">Destinatários (um por linha ou separado por vírgula)</Label>
                <Textarea
                  value={emailRecipients}
                  onChange={e => setEmailRecipients(e.target.value)}
                  placeholder="gestor@empresa.com&#10;analista@empresa.com"
                  className="min-h-[80px] text-sm"
                />
              </div>
            )}
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">WhatsApp</p>
                <p className="text-xs text-muted-foreground">Mensagem via WhatsApp (uazapi)</p>
              </div>
              <Switch
                checked={channelWhatsapp}
                onCheckedChange={(v) => { setChannelWhatsapp(v); if (v) loadWaDestinations(); }}
              />
            </div>
            {channelWhatsapp && (
              <div className="space-y-1">
                <Label className="text-xs">Destino</Label>
                <Select value={whatsappTarget || "manager"} onValueChange={v => setWhatsappTarget(v === "manager" ? "" : v)}>
                  <SelectTrigger className="text-sm">
                    {loadingWaDestinations ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SelectValue />}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Gestor (número padrão)</SelectItem>
                    {!!waManagers?.length && (
                      <SelectItem value={ALL_MANAGERS_TARGET}>
                        Todos os gestores ({waManagers.length})
                      </SelectItem>
                    )}
                    {!!waManagers?.length && (
                      <SelectGroup>
                        <SelectLabel>Gestores</SelectLabel>
                        {waManagers.map(m => (
                          <SelectItem key={m.id} value={m.number}>{m.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {!!waGroups?.length && (
                      <SelectGroup>
                        <SelectLabel>Grupos</SelectLabel>
                        {waGroups.map(g => (
                          <SelectItem key={g.id} value={g.id}>{g.subject}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Separator />
            <div className="space-y-1">
              <Label className="text-xs">Cooldown — reenvio mínimo após disparo</Label>
              <Select value={String(cooldown)} onValueChange={v => setCooldown(parseInt(v))}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COOLDOWN_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 – Review + Test */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Revisão</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nome</span>
                <span className="font-medium">{name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente</span>
                <span>{clientId === "all" ? "Todos" : clients.find(c => c.id === clientId)?.name || clientId}</span>
              </div>
              <div className="flex justify-between items-start gap-4">
                <span className="text-muted-foreground shrink-0">Regra</span>
                <span className="text-right font-mono text-xs bg-muted rounded px-2 py-1">{ruleDescription}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Canais</span>
                <span className="flex gap-1 flex-wrap justify-end">
                  {channelDashboard && <Badge variant="secondary" className="text-[10px]">Dashboard</Badge>}
                  {channelEmail && <Badge variant="secondary" className="text-[10px]">Email</Badge>}
                  {channelWhatsapp && <Badge variant="secondary" className="text-[10px] border-green-500/40 text-green-600">WhatsApp</Badge>}
                </span>
              </div>
              {channelWhatsapp && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground shrink-0">Destino WhatsApp</span>
                  <span className="text-right">{whatsappTargetLabel}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cooldown</span>
                <span>{COOLDOWN_OPTIONS.find(o => o.value === cooldown)?.label || `${cooldown}min`}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Testar agora</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Verifica a condição contra dados atuais sem criar eventos reais.
              </p>
              {testResult && (
                <div className={`rounded-lg p-3 text-sm ${testResult.fired ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-green-50 text-green-800 border border-green-200"}`}>
                  {testResult.fired
                    ? `⚠️ Dispararia para ${testResult.count} entidade(s) agora`
                    : "✅ Condição não atingida com dados atuais"}
                </div>
              )}
              <Button variant="outline" onClick={handleTest} disabled={testing} className="w-full">
                {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                {testing ? "Testando..." : "Testar condição"}
              </Button>
              {channelWhatsapp && (
                <Button
                  variant="outline"
                  onClick={handleTestWhatsapp}
                  disabled={testingWhatsapp}
                  className="w-full border-green-500/30 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                >
                  {testingWhatsapp
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <MessageSquare className="mr-2 h-4 w-4" />}
                  {testingWhatsapp ? "Enviando..." : "Testar WhatsApp"}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        {step > 0 && (
          <Button variant="outline" className="flex-1" onClick={() => setStep(s => s - 1)}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Anterior
          </Button>
        )}
        {step < 3 ? (
          <Button className="flex-1" onClick={() => setStep(s => s + 1)}>
            Próximo
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
            {saving ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar alerta"}
          </Button>
        )}
      </div>
    </div>
  );
}
