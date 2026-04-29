import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Link2,
  RefreshCw,
  Facebook,
  ShieldCheck,
  FileText,
  Image as ImageIcon,
  Users,
  Search,
  LayoutGrid,
  Table2,
  Sparkles,
  CheckCircle2,
  Clock3,
  ArrowUpDown,
  Activity,
  Filter,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { syncClientData, validateMetaConnection } from "@/lib/meta-api";
import { loadFacebookSDK, facebookLogin, type MetaAdAccount } from "@/lib/facebook-sdk";

const META_APP_ID = import.meta.env.VITE_META_APP_ID as string;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

interface Client {
  id: string;
  name: string;
  status: string;
  logo_url: string | null;
  meta_ad_account_id: string | null;
  meta_access_token: string | null;
  meta_auto_sync_enabled: boolean;
  meta_auto_sync_frequency_hours: number;
  meta_connected_at: string | null;
  meta_last_sync_at: string | null;
  meta_last_sync_error: string | null;
  meta_last_verified_at: string | null;
  meta_sync_runs: number;
  meta_sync_status: "pending" | "connected" | "syncing" | "healthy" | "warning" | "error" | "expired";
  created_at: string;
}

interface ReportRow {
  client_id: string;
  created_at: string;
}

type StatusFilter = "all" | "active" | "inactive";
type ConnectionFilter = "all" | "connected" | "disconnected";
type SortOption = "recent" | "name" | "reports" | "lastSync";

const AUTO_SYNC_OPTIONS = [
  { label: "A cada 6h", value: "6" },
  { label: "A cada 12h", value: "12" },
  { label: "A cada 24h", value: "24" },
  { label: "A cada 48h", value: "48" },
  { label: "A cada 72h", value: "72" },
];

const HEALTH_STYLES: Record<Client["meta_sync_status"], { label: string; badge: string }> = {
  pending: { label: "Pendente", badge: "border-slate-200 bg-slate-50 text-slate-600" },
  connected: { label: "Conectado", badge: "border-sky-200 bg-sky-50 text-sky-700" },
  syncing: { label: "Sincronizando", badge: "border-orange-200 bg-orange-50 text-orange-700" },
  healthy: { label: "Saudavel", badge: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  warning: { label: "Atencao", badge: "border-amber-200 bg-amber-50 text-amber-700" },
  error: { label: "Erro", badge: "border-rose-200 bg-rose-50 text-rose-700" },
  expired: { label: "Token expirado", badge: "border-rose-200 bg-rose-50 text-rose-700" },
};

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function getAvatarTone(name: string) {
  const tones = [
    "bg-rose-100 text-rose-700",
    "bg-amber-100 text-amber-700",
    "bg-emerald-100 text-emerald-700",
    "bg-sky-100 text-sky-700",
    "bg-indigo-100 text-indigo-700",
    "bg-fuchsia-100 text-fuchsia-700",
  ];

  const score = Array.from(name).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return tones[score % tones.length];
}

function isAutoSyncDue(client: Client) {
  if (!client.meta_auto_sync_enabled || !client.meta_ad_account_id) return false;
  if (!client.meta_last_sync_at) return true;

  const lastSync = new Date(client.meta_last_sync_at).getTime();
  const frequencyMs = (client.meta_auto_sync_frequency_hours || 24) * 60 * 60 * 1000;
  return Date.now() - lastSync >= frequencyMs;
}

export default function Clients() {
  const { role } = useAuth();
  const canManage = role === "owner" || role === "admin";
  const navigate = useNavigate();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("gallery");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [connectionFilter, setConnectionFilter] = useState<ConnectionFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [reportStats, setReportStats] = useState<Record<string, { count: number; latest: string | null }>>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLogoUrl, setNewLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const [connectClient, setConnectClient] = useState<Client | null>(null);
  const [adAccountId, setAdAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoSyncFrequencyHours, setAutoSyncFrequencyHours] = useState("24");
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState("");

  const [oauthLoading, setOauthLoading] = useState(false);
  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [longLivedToken, setLongLivedToken] = useState("");

  async function load() {
    setLoading(true);
    const [{ data: clientsData, error: clientsError }, { data: reportsData, error: reportsError }] = await Promise.all([
      supabase.from("clients").select("*, logo_url").order("created_at", { ascending: false }),
      supabase.from("reports").select("client_id, created_at"),
    ]);

    if (clientsError) toast.error(clientsError.message);
    if (reportsError) toast.error(reportsError.message);

    setClients((clientsData as Client[]) ?? []);

    const stats: Record<string, { count: number; latest: string | null }> = {};
    ((reportsData as ReportRow[]) ?? []).forEach((report) => {
      const current = stats[report.client_id] ?? { count: 0, latest: null };
      current.count += 1;
      if (!current.latest || new Date(report.created_at) > new Date(current.latest)) {
        current.latest = report.created_at;
      }
      stats[report.client_id] = current;
    });
    setReportStats(stats);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const clientsWithStats = useMemo(() => {
    return clients.map((client) => {
      const stats = reportStats[client.id] ?? { count: 0, latest: null };
      const isConnected = Boolean(client.meta_ad_account_id);
      const isActive = client.status === "active";
      const lastSyncDate = client.meta_last_sync_at ? new Date(client.meta_last_sync_at) : null;
      const verifiedAt = client.meta_last_verified_at ? new Date(client.meta_last_verified_at) : null;
      const health = HEALTH_STYLES[client.meta_sync_status] ?? HEALTH_STYLES.pending;
      const syncDue = isAutoSyncDue(client);
      const syncLabel = syncingId === client.id
        ? syncProgress || "Sincronizando agora"
        : client.meta_last_sync_error
          ? client.meta_last_sync_error
          : lastSyncDate
            ? `Ultima sync ${formatDistanceToNow(lastSyncDate, { addSuffix: true, locale: ptBR })}`
            : isConnected
              ? "Conta conectada, aguardando primeira sync"
              : "Conta Meta ainda nao conectada";

      return {
        client,
        stats,
        isConnected,
        isActive,
        health,
        lastSyncDate,
        verifiedAt,
        syncDue,
        syncLabel,
      };
    });
  }, [clients, reportStats, syncingId, syncProgress]);

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clientsWithStats
      .filter(({ client, isActive, isConnected }) => {
        const matchesSearch = !term || client.name.toLowerCase().includes(term);
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && isActive) ||
          (statusFilter === "inactive" && !isActive);
        const matchesConnection =
          connectionFilter === "all" ||
          (connectionFilter === "connected" && isConnected) ||
          (connectionFilter === "disconnected" && !isConnected);

        return matchesSearch && matchesStatus && matchesConnection;
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.client.name.localeCompare(b.client.name, "pt-BR");
        if (sortBy === "reports") return b.stats.count - a.stats.count;
        if (sortBy === "lastSync") return (b.lastSyncDate?.getTime() ?? 0) - (a.lastSyncDate?.getTime() ?? 0);
        return new Date(b.client.created_at).getTime() - new Date(a.client.created_at).getTime();
      });
  }, [clientsWithStats, search, statusFilter, connectionFilter, sortBy]);

  const filteredActiveCount = filteredClients.filter(({ isActive }) => isActive).length;
  const filteredConnectedCount = filteredClients.filter(({ isConnected }) => isConnected).length;
  const healthyCount = clients.filter((client) => client.meta_sync_status === "healthy").length;

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setConnectionFilter("all");
    setSortBy("recent");
  }

  function openConnectDialog(client: Client) {
    setAdAccountId(client.meta_ad_account_id ?? "");
    setAccessToken(client.meta_access_token ?? "");
    setAutoSyncEnabled(client.meta_auto_sync_enabled ?? false);
    setAutoSyncFrequencyHours(String(client.meta_auto_sync_frequency_hours ?? 24));
    setAdAccounts([]);
    setSelectedAccountId("");
    setLongLivedToken("");
    setConnectClient(client);
  }

  function closeConnectDialog() {
    setConnectClient(null);
    setAdAccounts([]);
    setSelectedAccountId("");
    setLongLivedToken("");
    setAutoSyncEnabled(false);
    setAutoSyncFrequencyHours("24");
  }

  async function handleFacebookLogin() {
    setOauthLoading(true);
    try {
      await loadFacebookSDK(META_APP_ID);
      const shortToken = await facebookLogin();

      setSyncProgress("Trocando token...");

      const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-exchange-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ short_lived_token: shortToken }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setLongLivedToken(data.access_token);
      setAdAccounts(data.ad_accounts ?? []);

      if (data.ad_accounts?.length === 1) {
        setSelectedAccountId(data.ad_accounts[0].id.replace("act_", ""));
      }

      toast.success(`${data.ad_accounts?.length ?? 0} conta(s) de anuncio encontrada(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro no login com Facebook");
    } finally {
      setOauthLoading(false);
      setSyncProgress("");
    }
  }

  async function handleSaveOAuth(event: React.FormEvent) {
    event.preventDefault();
    if (!connectClient || !selectedAccountId || !longLivedToken) return;
    await saveAndSync(connectClient, selectedAccountId, longLivedToken);
  }

  async function handleConnectManual(event: React.FormEvent) {
    event.preventDefault();
    if (!connectClient || !adAccountId.trim() || !accessToken.trim()) {
      toast.error("Preencha o ID da conta e o token de acesso");
      return;
    }
    await saveAndSync(connectClient, adAccountId, accessToken);
  }

  async function saveAndSync(client: Client, accountId: string, token: string) {
    setSyncingId(client.id);
    setSyncProgress("Salvando configuracoes...");
    try {
      const { error } = await supabase
        .from("clients")
        .update({
          meta_ad_account_id: accountId.replace("act_", ""),
          meta_access_token: token.trim(),
          meta_auto_sync_enabled: autoSyncEnabled,
          meta_auto_sync_frequency_hours: Number(autoSyncFrequencyHours),
          meta_last_sync_error: null,
          meta_sync_status: "connected",
        })
        .eq("id", client.id);

      if (error) throw error;

      const result = await syncClientData(client.id, accountId, token, setSyncProgress);
      toast.success(
        `Sincronizado! ${result.campaigns} campanhas · ${result.adSets} conjuntos · ${result.ads} anuncios`,
        { duration: 6000 }
      );
      closeConnectDialog();
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar");
    } finally {
      setSyncingId(null);
      setSyncProgress("");
    }
  }

  async function handleQuickSync(client: Client) {
    if (!client.meta_ad_account_id || !client.meta_access_token) {
      toast.error("Configure a conta Meta antes de sincronizar");
      return;
    }
    setSyncingId(client.id);
    try {
      const result = await syncClientData(client.id, client.meta_ad_account_id, client.meta_access_token, setSyncProgress);
      toast.success(
        `Sincronizado! ${result.campaigns} campanhas · ${result.adSets} conjuntos · ${result.ads} anuncios`,
        { duration: 6000 }
      );
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro na sincronizacao");
    } finally {
      setSyncingId(null);
      setSyncProgress("");
    }
  }

  async function createClient(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("clients").insert({
      name: newName.trim(),
      status: "active",
      logo_url: newLogoUrl.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Cliente criado");
    setNewName("");
    setNewLogoUrl("");
    setCreateOpen(false);
    load();
  }

  async function toggleStatus(client: Client) {
    const { error } = await supabase
      .from("clients")
      .update({ status: client.status === "active" ? "inactive" : "active" })
      .eq("id", client.id);
    if (error) return toast.error(error.message);
    load();
  }

  async function handleVerifyConnection(client: Client) {
    if (!client.meta_ad_account_id || !client.meta_access_token) {
      toast.error("Configure a conta Meta antes de verificar");
      return;
    }

    setVerifyingId(client.id);
    try {
      const result = await validateMetaConnection(client.meta_ad_account_id, client.meta_access_token);
      const { error } = await supabase
        .from("clients")
        .update({
          meta_last_verified_at: result.checkedAt,
          meta_last_sync_error: null,
          meta_sync_status: client.meta_last_sync_at ? "healthy" : "connected",
        })
        .eq("id", client.id);

      if (error) throw error;
      toast.success(result.accountName ? `Conta verificada: ${result.accountName}` : "Conexao Meta validada");
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao verificar integracao";
      await supabase
        .from("clients")
        .update({
          meta_last_verified_at: new Date().toISOString(),
          meta_last_sync_error: message,
          meta_sync_status: message.toLowerCase().includes("token") ? "expired" : "error",
        })
        .eq("id", client.id);
      toast.error(message);
      load();
    } finally {
      setVerifyingId(null);
    }
  }

  async function toggleAutoSync(client: Client, enabled: boolean) {
    const { error } = await supabase
      .from("clients")
      .update({
        meta_auto_sync_enabled: enabled,
      })
      .eq("id", client.id);

    if (error) return toast.error(error.message);
    toast.success(enabled ? "Auto sync ativada" : "Auto sync pausada");
    load();
  }

  async function runDueSyncs() {
    const dueClients = clients.filter(
      (client) => client.meta_ad_account_id && client.meta_access_token && isAutoSyncDue(client)
    );

    if (dueClients.length === 0) {
      toast("Nenhum cliente com sync automatica vencida");
      return;
    }

    try {
      for (const client of dueClients) {
        setSyncingId(client.id);
        await syncClientData(client.id, client.meta_ad_account_id!, client.meta_access_token!, setSyncProgress);
      }
      toast.success(`${dueClients.length} cliente(s) sincronizado(s)`);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao executar sync automatica");
      load();
    } finally {
      setSyncingId(null);
      setSyncProgress("");
    }
  }

  async function verifyConnectedClients() {
    const connectedClients = clients.filter((client) => client.meta_ad_account_id && client.meta_access_token);
    if (connectedClients.length === 0) {
      toast("Nenhum cliente conectado para verificar");
      return;
    }

    try {
      for (const client of connectedClients) {
        setVerifyingId(client.id);
        try {
          const result = await validateMetaConnection(client.meta_ad_account_id!, client.meta_access_token!);
          await supabase
            .from("clients")
            .update({
              meta_last_verified_at: result.checkedAt,
              meta_last_sync_error: null,
              meta_sync_status: client.meta_last_sync_at ? "healthy" : "connected",
            })
            .eq("id", client.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro ao verificar integracao";
          await supabase
            .from("clients")
            .update({
              meta_last_verified_at: new Date().toISOString(),
              meta_last_sync_error: message,
              meta_sync_status: message.toLowerCase().includes("token") ? "expired" : "error",
            })
            .eq("id", client.id);
        }
      }
      toast.success("Verificacao das integracoes concluida");
      load();
    } finally {
      setVerifyingId(null);
    }
  }

  const isSyncing = syncingId !== null;
  const activeCount = clients.filter((client) => client.status === "active").length;
  const connectedCount = clients.filter((client) => client.meta_ad_account_id).length;

  function renderClientActions(client: Client, compact = false) {
    return (
      <div className={`flex ${compact ? "flex-wrap" : "justify-end"} gap-2`}>
        {canManage && (
          <>
            <Button variant="outline" size="sm" onClick={() => openConnectDialog(client)} disabled={syncingId === client.id}>
              <Link2 className="mr-2 h-3 w-3" />
              {client.meta_ad_account_id ? "Reconfigurar" : "Conectar Meta"}
            </Button>
            {client.meta_ad_account_id && client.meta_access_token && (
              <Button variant="outline" size="sm" onClick={() => handleQuickSync(client)} disabled={isSyncing}>
                <RefreshCw className={`mr-2 h-3 w-3 ${syncingId === client.id ? "animate-spin" : ""}`} />
                {syncingId === client.id ? "Sincronizando..." : "Sincronizar"}
              </Button>
            )}
            {client.meta_ad_account_id && client.meta_access_token && (
              <Button variant="outline" size="sm" onClick={() => handleVerifyConnection(client)} disabled={verifyingId === client.id}>
                <ShieldAlert className="mr-2 h-3 w-3" />
                {verifyingId === client.id ? "Verificando..." : "Verificar"}
              </Button>
            )}
          </>
        )}
        <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${client.id}/audit`)}>
          <ShieldCheck className="mr-2 h-3 w-3" />Auditar
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${client.id}/reports`)}>
          <FileText className="mr-2 h-3 w-3" />Relatorios
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${client.id}/creatives`)}>
          <ImageIcon className="mr-2 h-3 w-3" />Criativos
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${client.id}/audiences`)}>
          <Users className="mr-2 h-3 w-3" />Publicos
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">Gerencie as empresas anunciantes da sua plataforma</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={verifyConnectedClients} disabled={!!verifyingId}>
              <ShieldAlert className="mr-2 h-4 w-4" />
              Verificar integracoes
            </Button>
            <Button variant="outline" onClick={runDueSyncs} disabled={isSyncing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              Sincronizar vencidos
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />Novo cliente</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
                <form onSubmit={createClient} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do cliente</Label>
                    <Input id="name" value={newName} onChange={(event) => setNewName(event.target.value)} required placeholder="Ex: Loja Aurora" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="logoUrl">Foto ou logo (URL)</Label>
                    <Input id="logoUrl" value={newLogoUrl} onChange={(event) => setNewLogoUrl(event.target.value)} placeholder="https://..." />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Criar"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Dialog open={!!connectClient} onOpenChange={(open) => !open && closeConnectDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar Meta Ads - {connectClient?.name}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="oauth">
            <TabsList className="w-full">
              <TabsTrigger value="oauth" className="flex-1">Via Facebook</TabsTrigger>
              <TabsTrigger value="manual" className="flex-1">Token manual</TabsTrigger>
            </TabsList>

            <TabsContent value="oauth" className="space-y-4 pt-2">
              {adAccounts.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Clique no botao abaixo para autorizar o acesso via sua conta do Facebook.
                    Um popup sera aberto para confirmar as permissoes necessarias.
                  </p>
                  <Button
                    className="w-full bg-[#1877F2] hover:bg-[#166fe5] text-white"
                    onClick={handleFacebookLogin}
                    disabled={oauthLoading || isSyncing}
                    type="button"
                  >
                    <Facebook className="mr-2 h-4 w-4" />
                    {oauthLoading ? syncProgress || "Conectando..." : "Entrar com Facebook"}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSaveOAuth} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Conta de anuncios</Label>
                    <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a conta..." />
                      </SelectTrigger>
                      <SelectContent>
                        {adAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id.replace("act_", "")}>
                            {account.name} ({account.id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Sync automatica</p>
                        <p className="text-xs text-muted-foreground">Mantenha a conta atualizada em intervalos fixos</p>
                      </div>
                      <Switch checked={autoSyncEnabled} onCheckedChange={setAutoSyncEnabled} />
                    </div>
                    <div className="space-y-2">
                      <Label>Frequencia</Label>
                      <Select value={autoSyncFrequencyHours} onValueChange={setAutoSyncFrequencyHours}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a frequencia..." />
                        </SelectTrigger>
                        <SelectContent>
                          {AUTO_SYNC_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {isSyncing && syncProgress && (
                    <p className="text-sm text-muted-foreground animate-pulse">{syncProgress}</p>
                  )}
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={closeConnectDialog} disabled={isSyncing}>Cancelar</Button>
                    <Button type="submit" disabled={!selectedAccountId || isSyncing}>
                      {isSyncing ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />{syncProgress}</> : "Salvar e Sincronizar"}
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </TabsContent>

            <TabsContent value="manual">
              <form onSubmit={handleConnectManual} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="adAccountId">ID da conta de anuncios</Label>
                  <Input
                    id="adAccountId"
                    value={adAccountId}
                    onChange={(event) => setAdAccountId(event.target.value)}
                    placeholder="act_123456789 ou 123456789"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accessToken">Token de acesso</Label>
                  <Input
                    id="accessToken"
                    type="password"
                    value={accessToken}
                    onChange={(event) => setAccessToken(event.target.value)}
                    placeholder="EAAxxxxxxxx..."
                    required
                  />
                </div>
                <div className="rounded-xl border border-slate-200 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Sync automatica</p>
                      <p className="text-xs text-muted-foreground">Ative para priorizar esta conta nas rotinas de sincronizacao</p>
                    </div>
                    <Switch checked={autoSyncEnabled} onCheckedChange={setAutoSyncEnabled} />
                  </div>
                  <div className="space-y-2">
                    <Label>Frequencia</Label>
                    <Select value={autoSyncFrequencyHours} onValueChange={setAutoSyncFrequencyHours}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a frequencia..." />
                      </SelectTrigger>
                      <SelectContent>
                        {AUTO_SYNC_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {isSyncing && syncProgress && (
                  <p className="text-sm text-muted-foreground animate-pulse">{syncProgress}</p>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={closeConnectDialog} disabled={isSyncing}>Cancelar</Button>
                  <Button type="submit" disabled={isSyncing}>
                    {isSyncing ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />{syncProgress}</> : "Salvar e Sincronizar"}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-orange-100 p-3 text-orange-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de clientes</p>
                <p className="text-2xl font-bold">{clients.length}</p>
                <p className="text-xs text-muted-foreground">{filteredClients.length} visiveis agora</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Clientes ativos</p>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-xs text-muted-foreground">{filteredActiveCount} no filtro atual</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-sky-100 p-3 text-sky-600">
                <Clock3 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Meta conectada</p>
                <p className="text-2xl font-bold">{connectedCount}</p>
                <p className="text-xs text-muted-foreground">{filteredConnectedCount} no filtro atual</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-600">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Integracoes saudaveis</p>
                <p className="text-2xl font-bold">{healthyCount}</p>
                <p className="text-xs text-muted-foreground">{clients.filter((client) => client.meta_auto_sync_enabled).length} com auto sync</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader className="gap-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Base de clientes</CardTitle>
              <CardDescription>{filteredClients.length} cliente(s) exibido(s)</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-[260px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente..." className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="inactive">Inativos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={connectionFilter} onValueChange={(value) => setConnectionFilter(value as ConnectionFilter)}>
                <SelectTrigger className="w-[170px]">
                  <Link2 className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Conexao Meta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toda conexao</SelectItem>
                  <SelectItem value="connected">Meta conectada</SelectItem>
                  <SelectItem value="disconnected">Nao conectada</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                <SelectTrigger className="w-[170px]">
                  <ArrowUpDown className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Mais recentes</SelectItem>
                  <SelectItem value="name">Nome A-Z</SelectItem>
                  <SelectItem value="reports">Mais relatorios</SelectItem>
                  <SelectItem value="lastSync">Ultima sync</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={resetFilters} className="text-muted-foreground">
                Limpar filtros
              </Button>
              <Tabs value={view} onValueChange={setView}>
                <TabsList>
                  <TabsTrigger value="gallery"><LayoutGrid className="mr-2 h-4 w-4" />Cards</TabsTrigger>
                  <TabsTrigger value="table"><Table2 className="mr-2 h-4 w-4" />Tabela</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 px-6 pb-2">
            <Badge variant="secondary" className="gap-1 rounded-full bg-orange-500/10 text-orange-200">
              <Sparkles className="h-3 w-3" />
              {filteredClients.length} em foco
            </Badge>
            <Badge variant="secondary" className="rounded-full bg-emerald-500/10 text-emerald-200">
              {filteredActiveCount} ativos
            </Badge>
            <Badge variant="secondary" className="rounded-full bg-sky-500/10 text-sky-200">
              {filteredConnectedCount} com Meta
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filteredClients.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
            </div>
          ) : view === "gallery" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredClients.map(({ client, stats, isActive, isConnected, health, syncLabel, lastSyncDate, verifiedAt, syncDue }) => {
                const latestText = stats.latest
                  ? `Ultimo relatorio gerado ${formatDistanceToNow(new Date(stats.latest), { addSuffix: true, locale: ptBR })}`
                  : "Nenhum relatorio gerado ainda";

                return (
                  <Card key={client.id} className="overflow-hidden border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center min-w-0">
                          {client.logo_url ? (
                            <img
                              src={client.logo_url}
                              alt={client.name}
                              className="w-10 h-10 rounded-full mr-4"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mr-4">
                              <span className="text-gray-500 font-bold">
                                {client.name.slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="min-w-0">
                            <h3 className="text-lg font-semibold truncate">{client.name}</h3>
                            <div className="mt-1 flex flex-wrap gap-2">
                              <Badge variant="outline" className={isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}>
                                {isActive ? "Ativo" : "Inativo"}
                              </Badge>
                              <Badge variant="outline" className={isConnected ? "border-sky-200 bg-sky-50 text-sky-700" : "border-slate-200 bg-slate-50 text-slate-500"}>
                                {isConnected ? "Meta conectada" : "Sem Meta"}
                              </Badge>
                              <Badge variant="outline" className={health.badge}>
                                {health.label}
                              </Badge>
                              {client.meta_auto_sync_enabled && (
                                <Badge variant="outline" className={syncDue ? "border-amber-200 bg-amber-50 text-amber-700" : "border-indigo-200 bg-indigo-50 text-indigo-700"}>
                                  {syncDue ? "Sync vencida" : `Auto ${client.meta_auto_sync_frequency_hours}h`}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {syncingId === client.id ? (
                            <span className="inline-flex items-center text-xs font-medium text-orange-600">
                              <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                              Sync...
                            </span>
                          ) : isConnected ? (
                            <span className="text-xs font-medium text-emerald-600">Conta pronta</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Pendente</span>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saude da integracao</p>
                          <Activity className={`h-3.5 w-3.5 ${client.meta_sync_status === "healthy" ? "text-emerald-500" : client.meta_sync_status === "expired" || client.meta_sync_status === "error" ? "text-rose-500" : "text-slate-400"}`} />
                        </div>
                        <p className="mt-2 text-xs text-slate-700">
                          <span className="font-semibold">{stats.count}</span> {stats.count === 1 ? "relatorio" : "relatorios"}
                        </p>
                        <p className="mt-1 text-[11px] text-sky-700">{latestText}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{syncLabel}</p>
                        {verifiedAt && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Verificada em {format(verifiedAt, "dd/MM/yyyy HH:mm")}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Criado em {format(new Date(client.created_at), "dd/MM/yyyy")}
                        </p>
                        {lastSyncDate && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Ultima sync em {format(lastSyncDate, "dd/MM/yyyy HH:mm")}
                          </p>
                        )}
                        {client.meta_auto_sync_enabled && (
                          <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <div>
                              <p className="text-[11px] font-medium text-slate-700">Auto sync</p>
                              <p className="text-[11px] text-muted-foreground">A cada {client.meta_auto_sync_frequency_hours} horas</p>
                            </div>
                            {canManage && (
                              <Switch checked={client.meta_auto_sync_enabled} onCheckedChange={(checked) => toggleAutoSync(client, checked)} />
                            )}
                          </div>
                        )}
                      </div>

                      <div className="mt-5 border-t border-slate-100 pt-4">
                        {renderClientActions(client, true)}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Meta Ads</TableHead>
                  <TableHead>Relatorios</TableHead>
                  <TableHead>Ultima sync</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map(({ client, stats, isConnected, lastSyncDate, syncLabel, health, syncDue }) => {
                  return (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border border-slate-200">
                            {client.logo_url && <AvatarImage src={client.logo_url} alt={client.name} />}
                            <AvatarFallback className={`${getAvatarTone(client.name)} text-xs font-semibold`}>
                              {getInitials(client.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{client.name}</p>
                            <p className="text-xs text-muted-foreground">{client.meta_ad_account_id ? `CA ${client.meta_ad_account_id}` : "Sem conta conectada"}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch checked={client.status === "active"} onCheckedChange={() => canManage && toggleStatus(client)} disabled={!canManage} />
                          <span className="text-xs text-muted-foreground">{client.status === "active" ? "Ativo" : "Inativo"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {isConnected ? (
                            <span className="text-xs font-medium text-emerald-600">Conectado</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Nao conectado</span>
                          )}
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className={health.badge}>{health.label}</Badge>
                            {client.meta_auto_sync_enabled && (
                              <Badge variant="outline" className={syncDue ? "border-amber-200 bg-amber-50 text-amber-700" : "border-indigo-200 bg-indigo-50 text-indigo-700"}>
                                {syncDue ? "Vencida" : `Auto ${client.meta_auto_sync_frequency_hours}h`}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {stats.count} {stats.count === 1 ? "relatorio" : "relatorios"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {syncingId === client.id ? (
                          <span className="inline-flex items-center text-orange-600">
                            <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                            {syncProgress || "Sincronizando"}
                          </span>
                        ) : lastSyncDate ? (
                          <div>
                            <p>{format(lastSyncDate, "dd/MM/yyyy HH:mm")}</p>
                            <p className="text-[11px]">{syncLabel}</p>
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(client.created_at), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell className="text-right">{renderClientActions(client)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
