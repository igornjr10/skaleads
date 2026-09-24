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
import { Copy, Loader2, RefreshCw, Users, CircleCheck, CircleX, CircleAlert, QrCode, RotateCw, Power, Trash2 } from "lucide-react";

interface Member {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  company_id: string | null;
}

interface Company {
  id: string;
  name: string;
}

// Radix nao aceita "" como value de SelectItem.
const NO_COMPANY = "none";

interface WhatsAppGroup {
  id: string;
  subject: string;
  size: number;
  pictureUrl: string | null;
}

interface InstanceStatus {
  state: "open" | "connecting" | "close" | "unknown";
  connected: boolean;
  socketAlive: boolean;
  staleState: boolean;
  message: string;
  instance: string;
  ownerJid: string | null;
  profileName: string | null;
}

const ROLES = ["owner", "admin", "analyst", "viewer"] as const;

const IMPACT_LABELS: Record<string, string> = {
  reports: "relatórios",
  report_templates: "templates de relatório",
  report_schedules: "agendamentos de relatório",
  alerts: "alertas",
  notifications: "notificações",
};

type AdminAction = "restart" | "logout" | "connect";

// O QR vem normalizado pela Edge Function como `qrcode.base64`, e o base64
// às vezes já vem com o prefixo data: e às vezes não.
function extractQr(response: unknown): { image: string | null; pairingCode: string | null } {
  const payload = (response as any)?.qrcode ?? response;
  const raw = payload?.base64 ?? null;
  return {
    image: raw ? (String(raw).startsWith("data:") ? raw : `data:image/png;base64,${raw}`) : null,
    pairingCode: payload?.pairingCode ?? null,
  };
}

// O erro real vem embrulhado em duas camadas de `response`
function adminErrorMessage(detail: any, fallback: string): string {
  const nested = detail?.response?.response?.message ?? detail?.response?.message;
  if (Array.isArray(nested)) return nested.join(" · ");
  if (typeof nested === "string") return nested;
  return detail?.error ?? fallback;
}

export default function Settings() {
  const { user, role } = useAuth();
  const isOwner = role === "owner";
  const [members, setMembers] = useState<Member[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [fullName, setFullName] = useState("");
  const [whatsappGroups, setWhatsappGroups] = useState<WhatsAppGroup[] | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [instanceStatus, setInstanceStatus] = useState<InstanceStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [adminBusy, setAdminBusy] = useState<AdminAction | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<Record<string, number> | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletingUser, setDeletingUser] = useState(false);

  async function load() {
    const { data: profiles } = await supabase.from("profiles").select("id, email, full_name");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const { data: companiesData } = await supabase.from("companies").select("id, name").order("name");
    const { data: links } = await supabase.from("user_companies").select("user_id, company_id");

    setCompanies((companiesData as Company[]) ?? []);

    const merged: Member[] = (profiles ?? []).map((p) => ({
      user_id: p.id,
      email: p.email,
      full_name: p.full_name,
      role: roles?.find((r) => r.user_id === p.id)?.role ?? "viewer",
      company_id: links?.find((l) => l.user_id === p.id)?.company_id ?? null,
    }));
    setMembers(merged);

    const me = profiles?.find((p) => p.id === user?.id);
    setFullName(me?.full_name ?? "");
  }

  useEffect(() => { if (user) { load(); checkInstanceStatus(); } /* eslint-disable-next-line */ }, [user?.id]);

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
      if (error) {
        // FunctionsHttpError esconde o corpo — precisamos dele para ver o erro da uazapi
        const detail = await (error as any)?.context?.json?.().catch(() => null);
        throw new Error(detail?.error || error.message);
      }
      if (data?.error) throw new Error(data.error);
      setInstanceStatus(data as InstanceStatus);
    } catch (err) {
      setInstanceStatus(null);
      setStatusError(err instanceof Error ? err.message : "Erro ao consultar a instância");
    } finally {
      setLoadingStatus(false);
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
        const { image, pairingCode: code } = extractQr(data?.response);
        if (!image) {
          setQrImage(null);
          setPairingCode(null);
          // Instância já conectada não precisa de QR — a uazapi devolve só o
          // estado. Para trocar o número é preciso Desconectar antes.
          toast.info(
            "A instância já está conectada, por isso não veio QR. " +
            "Para parear outro número, use Desconectar e gere o QR de novo.",
            { duration: 15000 }
          );
          await checkInstanceStatus();
          return;
        }
        setQrImage(image);
        setPairingCode(code);
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
      if (error) {
        // FunctionsHttpError esconde o corpo — precisamos dele para ver o erro da uazapi
        const detail = await (error as any)?.context?.json?.().catch(() => null);
        throw new Error(detail?.error || error.message);
      }
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

  // Um usuario por empresa na tela — a tabela suporta mais de uma, mas hoje nao
  // ha caso de alguem atender duas.
  async function changeCompany(userId: string, companyId: string | null) {
    await supabase.from("user_companies").delete().eq("user_id", userId);
    if (companyId) {
      const { error } = await supabase.from("user_companies").insert({ user_id: userId, company_id: companyId });
      if (error) return toast.error(error.message);
    }
    toast.success(companyId ? "Empresa atualizada" : "Usuario ficou sem empresa");
    load();
  }

  async function invokeDeleteUser(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke("delete-user", { body });
    if (error) {
      // FunctionsHttpError esconde o corpo — precisamos dele para ver o motivo real
      const detail = await (error as any)?.context?.json?.().catch(() => null);
      throw new Error(detail?.error || error.message);
    }
    if (data?.error) throw new Error(data.error);
    return data as { user: Member; impact: Record<string, number> };
  }

  async function openDeleteDialog(member: Member) {
    setDeleteTarget(member);
    setDeleteImpact(null);
    setDeleteConfirm("");
    try {
      const preview = await invokeDeleteUser({ user_id: member.user_id, dry_run: true });
      setDeleteImpact(preview.impact ?? {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao consultar o impacto");
      setDeleteTarget(null);
    }
  }

  async function confirmDeleteUser() {
    if (!deleteTarget) return;
    setDeletingUser(true);
    try {
      await invokeDeleteUser({ user_id: deleteTarget.user_id });
      toast.success(`${deleteTarget.email ?? "Usuario"} excluido`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir usuario");
    } finally {
      setDeletingUser(false);
    }
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
                <TableHead>Empresa</TableHead>
                {isOwner && <TableHead className="w-12" />}
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
                  <TableCell>
                    {m.role === "owner" ? (
                      <span className="text-xs text-muted-foreground">Todas</span>
                    ) : isOwner ? (
                      <Select
                        value={m.company_id ?? NO_COMPANY}
                        onValueChange={(v) => changeCompany(m.user_id, v === NO_COMPANY ? null : v)}
                      >
                        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_COMPANY}>Nenhuma (sem acesso)</SelectItem>
                          {companies.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {companies.find((c) => c.id === m.company_id)?.name ?? "—"}
                      </span>
                    )}
                  </TableCell>
                  {isOwner && (
                    <TableCell>
                      {m.user_id !== user?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => openDeleteDialog(m)}
                          title="Excluir usuario"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleteTarget?.email ?? "usuário"}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  A conta é removida em definitivo e a pessoa perde o acesso na hora. Não dá para desfazer.
                </p>
                {deleteImpact === null ? (
                  <p className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Verificando o que será apagado junto...
                  </p>
                ) : Object.values(deleteImpact).some((n) => n > 0) ? (
                  <div className="space-y-1">
                    <p className="font-medium text-destructive">Estes dados serão apagados junto:</p>
                    <ul className="list-disc pl-5">
                      {Object.entries(deleteImpact)
                        .filter(([, total]) => total > 0)
                        .map(([table, total]) => (
                          <li key={table}>{total} {IMPACT_LABELS[table] ?? table}</li>
                        ))}
                    </ul>
                  </div>
                ) : (
                  <p>Nenhum relatório, alerta ou agendamento está vinculado a esta conta.</p>
                )}
                <p>
                  Digite <span className="font-mono font-medium text-foreground">{deleteTarget?.email ?? "EXCLUIR"}</span> para confirmar.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={deleteTarget?.email ?? "EXCLUIR"}
            autoComplete="off"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingUser}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingUser || deleteImpact === null || deleteConfirm !== (deleteTarget?.email ?? "EXCLUIR")}
              onClick={(e) => { e.preventDefault(); confirmDeleteUser(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              <li>Em <strong className="text-foreground">Facebook Login → Configurações</strong>, adicione nas <em>URIs de redirecionamento OAuth válidas</em>: <code className="rounded bg-muted px-1 font-mono text-xs">https://manager.marketprosystem.com/</code> e <code className="rounded bg-muted px-1 font-mono text-xs">http://localhost:8080</code></li>
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

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>WhatsApp — Conexão e grupos (uazapi)</CardTitle>
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
                      : "WhatsApp desconectado"}
              </p>
              <p className="text-xs text-muted-foreground break-words">
                {statusError ?? instanceStatus?.message ?? "Consultando a uazapi"}
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
                    <AlertDialogTitle>Desconectar a instância {instanceStatus?.instance ?? "WhatsApp"}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso encerra a sessão do WhatsApp e exige ler o QR Code de novo, com o celular em mãos.
                      A instância é compartilhada com outro sistema — ele também para de enviar mensagens até o novo pareamento.
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
