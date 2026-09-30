import { useCallback, useEffect, useState } from "react";
import {
  Link2,
  Loader2,
  RefreshCw,
  ExternalLink,
  Copy,
  PlugZap,
  AlertTriangle,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  connectClient,
  openConnectSession,
  listConnectIntegrations,
  getConnectMetrics,
  isMetricFailure,
  type ConnectIntegration,
  type IntegrationStatus,
} from "@/lib/connect";
import { errorMessage } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  client: { id: string; name: string; connect_customer_uuid: string | null };
  onConnected: (customerUuid: string) => void;
}

const STATUS_LABEL: Record<IntegrationStatus, { label: string; className: string }> = {
  active: { label: "Ativa", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  expired: { label: "Expirada", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  revoked: { label: "Revogada", className: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
  synchronizing: { label: "Sincronizando", className: "bg-sky-500/15 text-sky-600 border-sky-500/30" },
  synchronization_error: { label: "Erro de sync", className: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
};

const COMPONENTS = ["number_v1", "chart_v1", "datatable_v1"];

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return format(date, "yyyy-MM-dd");
}

export function ConnectDialog({ open, onClose, client, onConnected }: Props) {
  const [customerUuid, setCustomerUuid] = useState(client.connect_customer_uuid);
  const [creating, setCreating] = useState(false);
  const [integrations, setIntegrations] = useState<ConnectIntegration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [session, setSession] = useState<{ link: string; expiresAt: string } | null>(null);
  const [openingSession, setOpeningSession] = useState(false);

  const [integrationUuid, setIntegrationUuid] = useState("");
  const [start, setStart] = useState(daysAgo(30));
  const [end, setEnd] = useState(daysAgo(0));
  const [referenceKey, setReferenceKey] = useState("");
  const [component, setComponent] = useState("number_v1");
  const [metrics, setMetrics] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    setCustomerUuid(client.connect_customer_uuid);
  }, [client.connect_customer_uuid]);

  const refreshIntegrations = useCallback(async () => {
    if (!customerUuid) return;
    setLoadingIntegrations(true);
    try {
      const data = await listConnectIntegrations(client.id);
      setIntegrations(data.integrations);
      setIntegrationUuid((current) => current || data.integrations[0]?.uuid || "");
    } catch (error) {
      toast.error(errorMessage(error, "Erro ao listar integrações do Connect"));
    } finally {
      setLoadingIntegrations(false);
    }
  }, [client.id, customerUuid]);

  useEffect(() => {
    if (open) refreshIntegrations();
  }, [open, refreshIntegrations]);

  async function handleCreateCustomer() {
    setCreating(true);
    try {
      const data = await connectClient(client.id);
      setCustomerUuid(data.customer_uuid);
      onConnected(data.customer_uuid);
      toast.success(data.created ? "Cliente criado no Connect" : "Cliente já existia no Connect");
    } catch (error) {
      toast.error(errorMessage(error, "Erro ao criar o cliente no Connect"));
    } finally {
      setCreating(false);
    }
  }

  async function handleOpenSession() {
    setOpeningSession(true);
    try {
      const data = await openConnectSession(client.id);
      setSession({ link: data.session_link, expiresAt: data.expires_at });
    } catch (error) {
      toast.error(errorMessage(error, "Erro ao gerar o link de autorização"));
    } finally {
      setOpeningSession(false);
    }
  }

  async function handleRunMetric() {
    if (!referenceKey.trim() || splitList(metrics).length === 0) {
      toast.error("Informe a reference_key e ao menos uma métrica");
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const id = crypto.randomUUID();
      const dimensionList = splitList(dimensions);
      const response = await getConnectMetrics(client.id, {
        start,
        end,
        customerIntegration: integrationUuid,
        metrics: [
          {
            id,
            reference_key: referenceKey.trim(),
            component: component.trim(),
            metrics: splitList(metrics),
            ...(dimensionList.length ? { dimensions: dimensionList } : {}),
          },
        ],
      });
      const value = response.data?.[id];
      if (isMetricFailure(value)) {
        toast.error(`${value.type}: ${value.message}`);
      }
      setResult(JSON.stringify(value ?? response.data, null, 2));
    } catch (error) {
      toast.error(errorMessage(error, "Erro ao consultar a métrica"));
    } finally {
      setRunning(false);
    }
  }

  function copyLink() {
    if (!session) return;
    navigator.clipboard.writeText(session.link);
    toast.success("Link copiado");
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlugZap className="h-5 w-5" />
            Reportei Connect — {client.name}
          </DialogTitle>
          <DialogDescription>
            Conecte as contas do cliente (Instagram, Facebook, Google Analytics…) e leia as métricas delas.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="conexoes">
          <TabsList>
            <TabsTrigger value="conexoes">Conexões</TabsTrigger>
            <TabsTrigger value="metricas" disabled={!customerUuid}>Métricas</TabsTrigger>
          </TabsList>

          <TabsContent value="conexoes" className="space-y-4 pt-4">
            {!customerUuid ? (
              <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  Este cliente ainda não existe no Reportei Connect. Criar o cadastro é o primeiro passo — só
                  depois dá para pedir a autorização das contas dele.
                </p>
                <Button onClick={handleCreateCustomer} disabled={creating}>
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                  Criar cliente no Connect
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs text-muted-foreground font-mono">customer {customerUuid}</div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={refreshIntegrations} disabled={loadingIntegrations}>
                      <RefreshCw className={`mr-2 h-3 w-3 ${loadingIntegrations ? "animate-spin" : ""}`} />
                      Atualizar
                    </Button>
                    <Button size="sm" onClick={handleOpenSession} disabled={openingSession}>
                      {openingSession ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : (
                        <Link2 className="mr-2 h-3 w-3" />
                      )}
                      Gerar link de autorização
                    </Button>
                  </div>
                </div>

                {session && (
                  <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Link temporário — expira em {format(new Date(session.expiresAt), "dd/MM/yyyy HH:mm")}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Mande para o cliente agora; não guarde o link. É nessa tela que ele autoriza as contas dele.
                    </p>
                    <div className="flex gap-2">
                      <Input readOnly value={session.link} className="font-mono text-xs" />
                      <Button variant="outline" size="sm" onClick={copyLink}>
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a href={session.link} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                  </div>
                )}

                <Separator />

                {integrations.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    {loadingIntegrations ? "Carregando..." : "Nenhuma conta conectada ainda."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {integrations.map((item) => {
                      const status = STATUS_LABEL[item.status];
                      return (
                        <div key={item.uuid} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{item.source_name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {item.integration.name}
                              {item.email ? ` · ${item.email}` : ""}
                              {item.currency ? ` · ${item.currency}` : ""}
                            </div>
                          </div>
                          <Badge variant="outline" className={status.className}>
                            {status.label}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="metricas" className="space-y-4 pt-4">
            {integrations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Conecte ao menos uma conta na aba Conexões antes de consultar métricas.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  As <span className="font-mono">reference_key</span> dependem da plataforma conectada e não estão na
                  especificação da API. Descubra as do cliente no{" "}
                  <a
                    className="underline"
                    href="https://connect.reportei.com/tools/explorer"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Connect Explorer
                  </a>{" "}
                  e valide aqui antes de fixar no relatório.
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Conexão</Label>
                    <Select value={integrationUuid} onValueChange={setIntegrationUuid}>
                      <SelectTrigger>
                        <SelectValue placeholder="Escolha a conta" />
                      </SelectTrigger>
                      <SelectContent>
                        {integrations.map((item) => (
                          <SelectItem key={item.uuid} value={item.uuid}>
                            {item.source_name} · {item.integration.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Início</Label>
                    <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Fim</Label>
                    <Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>reference_key</Label>
                    <Input
                      placeholder="ig:story_replies"
                      value={referenceKey}
                      onChange={(event) => setReferenceKey(event.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>component</Label>
                    <Select value={component} onValueChange={setComponent}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COMPONENTS.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      metrics <span className="text-muted-foreground font-normal">(separadas por vírgula)</span>
                    </Label>
                    <Input
                      placeholder="replies"
                      value={metrics}
                      onChange={(event) => setMetrics(event.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      dimensions <span className="text-muted-foreground font-normal">(opcional)</span>
                    </Label>
                    <Input
                      placeholder="stories"
                      value={dimensions}
                      onChange={(event) => setDimensions(event.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>

                <Button onClick={handleRunMetric} disabled={running || !integrationUuid}>
                  {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  Consultar
                </Button>

                {result && (
                  <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs font-mono">
                    {result}
                  </pre>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
