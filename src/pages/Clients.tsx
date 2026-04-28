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
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { syncClientData } from "@/lib/meta-api";
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
  meta_connected_at: string | null;
  created_at: string;
}

interface ReportRow {
  client_id: string;
  created_at: string;
}

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

export default function Clients() {
  const { role } = useAuth();
  const canManage = role === "owner" || role === "admin";
  const navigate = useNavigate();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("gallery");
  const [reportStats, setReportStats] = useState<Record<string, { count: number; latest: string | null }>>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLogoUrl, setNewLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const [connectClient, setConnectClient] = useState<Client | null>(null);
  const [adAccountId, setAdAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState("");

  const [oauthLoading, setOauthLoading] = useState(false);
  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [longLivedToken, setLongLivedToken] = useState("");

  async function load() {
    setLoading(true);
    const [{ data: clientsData, error: clientsError }, { data: reportsData, error: reportsError }] = await Promise.all([
      supabase.from("clients").select("*").order("created_at", { ascending: false }),
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

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((client) => client.name.toLowerCase().includes(term));
  }, [clients, search]);

  function openConnectDialog(client: Client) {
    setAdAccountId(client.meta_ad_account_id ?? "");
    setAccessToken(client.meta_access_token ?? "");
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-orange-100 p-3 text-orange-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de clientes</p>
                <p className="text-2xl font-bold">{clients.length}</p>
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
            <div className="flex items-center gap-2">
              <div className="relative w-[260px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente..." className="pl-9" />
              </div>
              <Tabs value={view} onValueChange={setView}>
                <TabsList>
                  <TabsTrigger value="gallery"><LayoutGrid className="mr-2 h-4 w-4" />Cards</TabsTrigger>
                  <TabsTrigger value="table"><Table2 className="mr-2 h-4 w-4" />Tabela</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
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
              {filteredClients.map((client) => {
                const stats = reportStats[client.id] ?? { count: 0, latest: null };
                const latestText = stats.latest
                  ? `Ultimo relatorio gerado ${formatDistanceToNow(new Date(stats.latest), { addSuffix: true, locale: ptBR })}`
                  : "Nenhum relatorio gerado ainda";

                return (
                  <Card key={client.id} className="overflow-hidden border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        <Avatar className="h-14 w-14 border border-slate-200">
                          {client.logo_url && <AvatarImage src={client.logo_url} alt={client.name} />}
                          <AvatarFallback className={`${getAvatarTone(client.name)} text-sm font-semibold`}>
                            {getInitials(client.name)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="truncate text-sm font-bold uppercase tracking-tight">{client.name}</p>
                              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${client.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                                  {client.status === "active" ? "Ativo" : "Inativo"}
                                </span>
                                {client.meta_ad_account_id && (
                                  <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-700">
                                    Meta OK
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 text-sky-600">
                              <Facebook className="h-3.5 w-3.5" />
                              <span className="text-[11px] font-semibold">Meta</span>
                            </div>
                          </div>

                          <div className="mt-4 space-y-1.5">
                            <p className="text-xs text-slate-700">
                              <span className="font-semibold">{stats.count}</span> {stats.count === 1 ? "relatorio" : "relatorios"}
                            </p>
                            <p className="text-[11px] text-sky-700">{latestText}</p>
                            <p className="text-[11px] text-muted-foreground">
                              Criado em {format(new Date(client.created_at), "dd/MM/yyyy")}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
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
                {filteredClients.map((client) => {
                  const stats = reportStats[client.id] ?? { count: 0, latest: null };
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
                        {client.meta_ad_account_id ? (
                          <span className="text-xs font-medium text-emerald-600">Conectado</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Nao conectado</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {stats.count} {stats.count === 1 ? "relatorio" : "relatorios"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {client.meta_connected_at ? format(new Date(client.meta_connected_at), "dd/MM/yyyy HH:mm") : "-"}
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
