import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Copy, Loader2, RefreshCw, Users, CircleCheck, CircleX, CircleAlert, QrCode, RotateCw, Power, PlugZap } from "lucide-react";

interface Member {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
}

interface WhatsAppGroup {
  id: string;
  subject: string;
  size: number;
  pictureUrl: string | null;
}

type Provider = "evolution" | "uazapi";

interface InstanceStatus {
  state: "open" | "connecting" | "close" | "unknown";
  connected: boolean;
  socketAlive: boolean;
  staleState: boolean;
  message: string;
  instance: string;
  ownerJid: string | null;
  profileName: string | null;
  provider?: Provider;
}

interface ProviderConfig {
  provider: Provider;
  evolution: { configured: boolean; instance: string | null };
  uazapi: {
    baseUrl: string;
    tokenMask: string | null;
    adminTokenMask: string | null;
    configured: boolean;
  };
}

const ROLES = ["owner", "admin", "analyst", "viewer"] as const;

const PROVIDER_LABEL: Record<Provider, string> = {
  evolution: "Evolution API",
  uazapi: "Uazapi",
};

type AdminAction = "restart" | "logout" | "connect";

// O erro real da Evolution vem embrulhado em duas camadas de `response`
function adminErrorMessage(detail: any, fallback: string): string {
  const nested = detail?.response?.response?.message ?? detail?.response?.message;
  if (Array.isArray(nested)) return nested.join(" · ");
  if (typeof nested === "string") return nested;
  return detail?.error ?? fallback;
}

// FunctionsHttpError esconde o corpo — sem ele a tela mostra "non-2xx status"
// em vez do erro que o provedor realmente devolveu.
async function invokeError(error: unknown, fallback: string): Promise<string> {
  const detail = await (error as any)?.context?.json?.().catch(() => null);
  return detail?.error || (error as any)?.message || fallback;
}

export default function Settings() {
  const { user, role } = useAuth();
  const isOwner = role === "owner";
  const [members, setMembers] = useState<Member[]>([]);
  const [fullName, setFullName] = useState("");
  const [whatsappGroups, setWhatsappGroups] = useState<WhatsAppGroup[] | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [instanceStatus, setInstanceStatus] = useState<InstanceStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [adminBusy, setAdminBusy] = useState<AdminAction | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(null);
  const [provider, setProvider] = useState<Provider>("evolution");
  const [uazapiUrl, setUazapiUrl] = useState("");
  const [uazapiToken, setUazapiToken] = useState("");
  const [uazapiAdminToken, setUazapiAdminToken] = useState("");
  const [savingProvider, setSavingProvider] = useState(false);
  const [testingProvider, setTestingProvider] = useState(false);

  async function load() {
    const { data: profiles } = await supabase.from("profiles").select("id, email, full_name");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const merged: Member[] = (profiles ?? []).map((p) => ({
      user_id: p.id,
      email: p.email,
      full_name: p.full_name,
      role: roles?.find((r) => r.user_id === p.id)?.role ?? "viewer",
    }));
    setMembers(merged);

    const me = profiles?.find((p) => p.id === user?.id);
    setFullName(me?.full_name ?? "");
  }

  useEffect(() => {
    if (!user) return;
    load();
    checkInstanceStatus();
    if (isOwner) loadProviderConfig();
    /* eslint-disable-next-line */
  }, [user?.id, isOwner]);

  // Enquanto o QR estiver na tela, detectar o pareamento sozinho — o usuário
  // está com o celular na mão, não vai clicar em "atualizar"
  useEffect(() => {
    if (!qrImage) return;
    const id = setInterval(async () => {
      const { data } = await supabase.functions.invoke("whatsapp-instance-status");
      if (data?.connected) {
        setInstanceStatus(data as InstanceStatus);
        setStatusError(null);
        setQrImage(null);
        setPairingCode(null);
        toast.success("WhatsApp conectado");
      }
    }, 5000);
    return () => clearInterval(id);
  }, [qrImage]);

  async function saveProfile() {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado");
  }

  async function checkInstanceStatus() {
    setLoadingStatus(true);
    setStatusError(null);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-instance-status");
      if (error) throw new Error(await invokeError(error, "Erro ao consultar a instância"));
      if (data?.error) throw new Error(data.error);
      setInstanceStatus(data as InstanceStatus);
    } catch (err) {
      setInstanceStatus(null);
      setStatusError(err instanceof Error ? err.message : "Erro ao consultar a instância");
    } finally {
      setLoadingStatus(false);
    }
  }

  async function loadProviderConfig() {
    const { data, error } = await supabase.functions.invoke("whatsapp-provider-config", {
      body: { action: "get" },
    });
    if (error || data?.error) return;

    const cfg = data as ProviderConfig;
    setProviderConfig(cfg);
    setProvider(cfg.provider);
    setUazapiUrl(cfg.uazapi.baseUrl);
  }

  async function saveProviderConfig() {
    setSavingProvider(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-provider-config", {
        body: {
          action: "save",
          provider,
          baseUrl: uazapiUrl,
          token: uazapiToken,
          adminToken: uazapiAdminToken,
        },
      });
      if (error) throw new Error(await invokeError(error, "Falha ao salvar"));
      if (data?.error) throw new Error(data.error);

      // Os campos de segredo saem da tela depois de gravados: o que fica e a
      // mascara devolvida pelo backend.
      setUazapiToken("");
      setUazapiAdminToken("");
      toast.success(`Provedor ativo: ${PROVIDER_LABEL[provider]}`);

      await loadProviderConfig();
      setQrImage(null);
      setPairingCode(null);
      await checkInstanceStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar", { duration: 15000 });
    } finally {
      setSavingProvider(false);
    }
  }

  async function testProviderConfig() {
    setTestingProvider(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-provider-config", {
        body: { action: "test" },
      });
      if (error) throw new Error(await invokeError(error, "Falha no teste"));
      if (data?.error) throw new Error(data.error);

      const status = data.status as InstanceStatus;
      setInstanceStatus(status);
      setStatusError(null);
      if (status.connected) {
        toast.success(`${PROVIDER_LABEL[data.provider as Provider]} respondeu: ${status.message}`);
      } else {
        toast.warning(`${PROVIDER_LABEL[data.provider as Provider]} respondeu: ${status.message}`, { duration: 12000 });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no teste", { duration: 15000 });
    } finally {
      setTestingProvider(false);
    }
  }

  async function runAdminAction(action: AdminAction) {
    setAdminBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-instance-admin", { body: { action } });
      if (error) {
        const detail = await (error as any)?.context?.json?.().catch(() => null);
        throw new Error(adminErrorMessage(detail, error.message));
      }
      if (data?.error) throw new Error(data.error);

      if (action === "connect") {
        if (!data?.qrcode) {
          setQrImage(null);
          setPairingCode(null);
          // Os dois provedores só oferecem QR quando consideram a sessão
          // encerrada. Se acham que estão conectados — mesmo com o socket
          // morto — devolvem só o estado.
          toast.info(
            `A ${PROVIDER_LABEL[provider]} considera esta instância conectada e por isso não gerou QR. ` +
            "Se os envios estão falhando, use Reiniciar instância; se não resolver, Desconectar e então gerar o QR.",
            { duration: 15000 }
          );
          await checkInstanceStatus();
          return;
        }
        setQrImage(data.qrcode);
        setPairingCode(data.paircode ?? null);
        toast.success("QR Code gerado — leia com o WhatsApp do número da instância");
        return;
      }

      if (action === "logout") {
        setQrImage(null);
        setPairingCode(null);
        toast.success("Sessão encerrada. Gere o QR Code para parear de novo");
        await checkInstanceStatus();
        return;
      }

      toast.success("Instância reiniciada — reconectando o socket");
      // O socket do Baileys leva alguns segundos para subir; consultar na hora
      // devolveria o estado antigo
      await new Promise((r) => setTimeout(r, 4000));
      await checkInstanceStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Falha ao executar ${action}`, { duration: 15000 });
    } finally {
      setAdminBusy(null);
    }
  }

  async function loadWhatsappGroups() {
    setLoadingGroups(true);
    try {
      const { data, error } = await supabase.functions.invoke("list-whatsapp-groups");
      if (error) throw new Error(await invokeError(error, "Erro ao carregar grupos"));
      if (data?.error) throw new Error(data.error);
      setWhatsappGroups(data.groups ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar grupos", { duration: 15000 });
    } finally {
      setLoadingGroups(false);
    }
  }

  function copyGroupId(id: string) {
    navigator.clipboard.writeText(id);
    toast.success("JID do grupo copiado");
  }

  async function changeRole(userId: string, newRole: string) {
    // Remove existing roles, insert new one
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole as typeof ROLES[number] });
    if (error) return toast.error(error.message);
    toast.success("Papel atualizado");
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu perfil e os membros da plataforma</p>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Seu perfil</CardTitle>
          <CardDescription>Informações da sua conta</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div className="space-y-2">
            <Label>Nome completo</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <Button onClick={saveProfile}>Salvar</Button>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Membros</CardTitle>
          <CardDescription>
            {isOwner ? "Gerencie os papéis dos membros da plataforma" : "Apenas Owners podem alterar papéis"}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Papel</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.user_id}>
                  <TableCell className="font-medium">{m.full_name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.email}</TableCell>
                  <TableCell>
                    {isOwner && m.user_id !== user?.id ? (
                      <Select value={m.role} onValueChange={(v) => changeRole(m.user_id, v)}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs uppercase text-muted-foreground">{m.role}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Integração Meta Ads — App configurado</CardTitle>
          <CardDescription>App ID: 2156684861751630</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm text-muted-foreground">

          <div className="space-y-2">
            <p className="font-medium text-foreground">1. Configurar o App no Meta Developers</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Acesse{" "}
                <a href="https://developers.facebook.com/apps/2156684861751630/settings/basic/" target="_blank" rel="noreferrer" className="text-primary underline">
                  developers.facebook.com → seu App
                </a>
              </li>
              <li>Em <strong className="text-foreground">Configurações → Básico</strong>, adicione em <em>Domínios do App</em> o domínio onde o app estará hospedado (ex: <code className="rounded bg-muted px-1 font-mono text-xs">localhost</code> para dev)</li>
              <li>Em <strong className="text-foreground">Facebook Login → Configurações</strong>, adicione nas <em>URIs de redirecionamento OAuth válidas</em>: <code className="rounded bg-muted px-1 font-mono text-xs">https://ad-campaign-hub-one.vercel.app/</code> e <code className="rounded bg-muted px-1 font-mono text-xs">http://localhost:5173</code></li>
              <li>Certifique-se de que o produto <strong className="text-foreground">Marketing API</strong> está adicionado ao App</li>
            </ol>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-foreground">2. Implantar a Edge Function no Supabase</p>
            <p>A Edge Function <code className="rounded bg-muted px-1 font-mono text-xs">meta-exchange-token</code> faz a troca segura do token (sem expor o App Secret no frontend). Para implantá-la:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Acesse{" "}
                <a href="https://supabase.com/dashboard/project/npfcxgijwrxrssinpkdw/functions" target="_blank" rel="noreferrer" className="text-primary underline">
                  Supabase → Edge Functions
                </a>
                {" "}e crie uma nova função chamada <code className="rounded bg-muted px-1 font-mono text-xs">meta-exchange-token</code>
              </li>
              <li>Cole o conteúdo de <code className="rounded bg-muted px-1 font-mono text-xs">supabase/functions/meta-exchange-token/index.ts</code></li>
              <li>
                Em{" "}
                <a href="https://supabase.com/dashboard/project/npfcxgijwrxrssinpkdw/settings/vault" target="_blank" rel="noreferrer" className="text-primary underline">
                  Supabase → Settings → Edge Function Secrets
                </a>
                , adicione as variáveis:
                <br />
                <code className="rounded bg-muted px-1 font-mono text-xs">META_APP_ID</code> = <code className="rounded bg-muted px-1 font-mono text-xs">2156684861751630</code>
                <br />
                <code className="rounded bg-muted px-1 font-mono text-xs">META_APP_SECRET</code> = (sua chave secreta)
              </li>
            </ol>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-foreground">3. Conectar clientes</p>
            <p>
              Com a Edge Function implantada, vá em{" "}
              <strong className="text-foreground">Clientes → Conectar Meta → aba "Via Facebook"</strong>{" "}
              para conectar cada cliente via popup OAuth. O fluxo manual (token de sistema) também continua disponível na aba "Token manual".
            </p>
          </div>

        </CardContent>
      </Card>

      {isOwner && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>WhatsApp — Provedor da API</CardTitle>
            <CardDescription>
              Escolha por qual API as automações enviam mensagens. A troca vale na hora para alertas, relatórios
              e mensagens agendadas — nenhum agendamento precisa ser refeito.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Provedor ativo</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
                <SelectTrigger className="max-w-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="evolution">
                    Evolution API {providerConfig?.evolution.configured ? "" : "(sem credenciais)"}
                  </SelectItem>
                  <SelectItem value="uazapi">
                    Uazapi {providerConfig?.uazapi.configured ? "" : "(sem credenciais)"}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {provider === "evolution"
                  ? `Credenciais da Evolution vêm dos secrets do Supabase${
                      providerConfig?.evolution.instance ? ` · instância ${providerConfig.evolution.instance}` : ""
                    }.`
                  : "Credenciais da Uazapi ficam guardadas no banco, fora do alcance do navegador."}
              </p>
            </div>

            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="space-y-2">
                <Label htmlFor="uazapi-url">URL do servidor Uazapi</Label>
                <Input
                  id="uazapi-url"
                  value={uazapiUrl}
                  onChange={(e) => setUazapiUrl(e.target.value)}
                  placeholder="https://seuservidor.uazapi.com"
                />
                <p className="text-xs text-muted-foreground">
                  O host que a Uazapi te entregou — normalmente <code className="font-mono">https://free.uazapi.com</code>{" "}
                  ou o subdomínio do seu servidor dedicado.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="uazapi-token">Token da instância</Label>
                <Input
                  id="uazapi-token"
                  type="password"
                  value={uazapiToken}
                  onChange={(e) => setUazapiToken(e.target.value)}
                  placeholder={providerConfig?.uazapi.tokenMask ?? "cole o token da instância"}
                />
                <p className="text-xs text-muted-foreground">
                  {providerConfig?.uazapi.tokenMask
                    ? `Token gravado: ${providerConfig.uazapi.tokenMask}. Deixe em branco para manter o atual.`
                    : "É o token que identifica a instância na Uazapi. Só sai daqui para o banco."}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="uazapi-admin-token">Admin token (opcional)</Label>
                <Input
                  id="uazapi-admin-token"
                  type="password"
                  value={uazapiAdminToken}
                  onChange={(e) => setUazapiAdminToken(e.target.value)}
                  placeholder={providerConfig?.uazapi.adminTokenMask ?? "só para criar instâncias"}
                />
                <p className="text-xs text-muted-foreground">
                  {providerConfig?.uazapi.adminTokenMask
                    ? `Admin token gravado: ${providerConfig.uazapi.adminTokenMask}. Deixe em branco para manter o atual.`
                    : "Necessário apenas para operações administrativas do servidor. Os envios não usam."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={saveProviderConfig} disabled={savingProvider}>
                {savingProvider && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar provedor
              </Button>
              <Button onClick={testProviderConfig} disabled={testingProvider} variant="outline">
                {testingProvider
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <PlugZap className="mr-2 h-4 w-4" />}
                Testar conexão
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>
            WhatsApp — Conexão e grupos ({PROVIDER_LABEL[instanceStatus?.provider ?? providerConfig?.provider ?? "evolution"]})
          </CardTitle>
          <CardDescription>
            Reinicie, reconecte ou pareie a instância sem sair do sistema. Abaixo, os grupos ativos no número conectado —
            copie o JID para usar como destino de alertas/relatórios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`flex items-start gap-3 rounded-lg border p-3 ${
              loadingStatus || (!instanceStatus && !statusError)
                ? "border-border bg-muted/40"
                : instanceStatus?.connected
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : instanceStatus?.state === "connecting"
                    ? "border-amber-500/30 bg-amber-500/10"
                    : "border-destructive/30 bg-destructive/10"
            }`}
          >
            {loadingStatus || (!instanceStatus && !statusError) ? (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            ) : instanceStatus?.connected ? (
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            ) : instanceStatus?.state === "connecting" ? (
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            ) : (
              <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            )}

            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-sm font-medium">
                {loadingStatus || (!instanceStatus && !statusError)
                  ? "Verificando a instância..."
                  : statusError
                    ? "Não foi possível consultar a instância"
                    : instanceStatus?.connected
                      ? "WhatsApp conectado"
                      : instanceStatus?.staleState
                        ? "WhatsApp fora do ar (o painel da Evolution mostra conectado)"
                        : "WhatsApp desconectado"}
              </p>
              <p className="text-xs text-muted-foreground break-words">
                {statusError ?? instanceStatus?.message ?? "Consultando o provedor de WhatsApp"}
              </p>
              {instanceStatus?.connected && (instanceStatus.profileName || instanceStatus.ownerJid) && (
                <p className="text-xs text-muted-foreground">
                  {instanceStatus.profileName ?? "Número"}
                  {instanceStatus.ownerJid ? ` · ${instanceStatus.ownerJid.split("@")[0]}` : ""}
                  {` · instância ${instanceStatus.instance}`}
                </p>
              )}
            </div>

            <Button
              onClick={checkInstanceStatus}
              disabled={loadingStatus}
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingStatus ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {isOwner ? (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => runAdminAction("restart")}
                disabled={adminBusy !== null}
                variant="outline"
                size="sm"
              >
                {adminBusy === "restart"
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <RotateCw className="mr-2 h-4 w-4" />}
                Reiniciar instância
              </Button>

              <Button
                onClick={() => runAdminAction("connect")}
                disabled={adminBusy !== null}
                variant="outline"
                size="sm"
              >
                {adminBusy === "connect"
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <QrCode className="mr-2 h-4 w-4" />}
                {qrImage ? "Gerar novo QR Code" : "Gerar QR Code"}
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={adminBusy !== null} variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    {adminBusy === "logout"
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <Power className="mr-2 h-4 w-4" />}
                    Desconectar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Desconectar a instância {instanceStatus?.instance ?? PROVIDER_LABEL[provider]}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso encerra a sessão do WhatsApp e exige ler o QR Code de novo, com o celular em mãos.
                      A instância pode ser compartilhada com outro sistema — ele também para de enviar mensagens até o novo pareamento.
                      Se o objetivo é só destravar um socket caído, prefira <strong>Reiniciar instância</strong>.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => runAdminAction("logout")}>Desconectar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Apenas Owners podem reiniciar, desconectar ou reparear a instância.
            </p>
          )}

          {qrImage && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/40 p-4">
              <img src={qrImage} alt="QR Code para conectar o WhatsApp" className="h-56 w-56 rounded-md bg-white p-2" />
              <div className="space-y-1 text-center">
                <p className="text-sm font-medium">WhatsApp → Aparelhos conectados → Conectar aparelho</p>
                <p className="text-xs text-muted-foreground">
                  O QR expira em cerca de 1 minuto. Se não ler a tempo, clique em <strong>Gerar novo QR Code</strong>.
                </p>
                {pairingCode && (
                  <p className="text-xs text-muted-foreground">
                    Ou use o código de pareamento:{" "}
                    <code className="rounded bg-muted px-1 font-mono text-xs">{pairingCode}</code>
                  </p>
                )}
              </div>
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Aguardando o pareamento...
              </span>
            </div>
          )}

          <Button onClick={loadWhatsappGroups} disabled={loadingGroups} variant="outline" size="sm">
            {loadingGroups ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {whatsappGroups ? "Atualizar grupos" : "Carregar grupos"}
          </Button>

          {whatsappGroups && whatsappGroups.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum grupo encontrado nesse número.</p>
          )}

          {whatsappGroups && whatsappGroups.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Membros</TableHead>
                  <TableHead>JID</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {whatsappGroups.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.subject}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{g.size}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{g.id}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyGroupId(g.id)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
