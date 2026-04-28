import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Link2, RefreshCw, Facebook, ShieldCheck, FileText, Image, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
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
  meta_ad_account_id: string | null;
  meta_access_token: string | null;
  meta_connected_at: string | null;
  created_at: string;
}

export default function Clients() {
  const { role } = useAuth();
  const canManage = role === "owner" || role === "admin";
  const navigate = useNavigate();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // New client dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  // Connect Meta dialog
  const [connectClient, setConnectClient] = useState<Client | null>(null);
  const [adAccountId, setAdAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState("");

  // OAuth state
  const [oauthLoading, setOauthLoading] = useState(false);
  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [longLivedToken, setLongLivedToken] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setClients((data as Client[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openConnectDialog(c: Client) {
    setAdAccountId(c.meta_ad_account_id ?? "");
    setAccessToken(c.meta_access_token ?? "");
    setAdAccounts([]);
    setSelectedAccountId("");
    setLongLivedToken("");
    setConnectClient(c);
  }

  function closeConnectDialog() {
    setConnectClient(null);
    setAdAccounts([]);
    setSelectedAccountId("");
    setLongLivedToken("");
  }

  // ── OAuth flow ──────────────────────────────────────────────────────────────
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

      toast.success(`${data.ad_accounts?.length ?? 0} conta(s) de anúncio encontrada(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no login com Facebook");
    } finally {
      setOauthLoading(false);
      setSyncProgress("");
    }
  }

  async function handleSaveOAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!connectClient || !selectedAccountId || !longLivedToken) return;
    await saveAndSync(connectClient, selectedAccountId, longLivedToken);
  }

  // ── Manual token flow ───────────────────────────────────────────────────────
  async function handleConnectManual(e: React.FormEvent) {
    e.preventDefault();
    if (!connectClient || !adAccountId.trim() || !accessToken.trim()) {
      toast.error("Preencha o ID da conta e o token de acesso");
      return;
    }
    await saveAndSync(connectClient, adAccountId, accessToken);
  }

  // ── Shared save + sync ──────────────────────────────────────────────────────
  async function saveAndSync(client: Client, accountId: string, token: string) {
    setSyncingId(client.id);
    setSyncProgress("Salvando configurações...");
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
        `Sincronizado! ${result.campaigns} campanhas · ${result.adSets} conjuntos · ${result.ads} anúncios`,
        { duration: 6000 }
      );
      closeConnectDialog();
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSyncingId(null);
      setSyncProgress("");
    }
  }

  async function handleQuickSync(c: Client) {
    if (!c.meta_ad_account_id || !c.meta_access_token) {
      toast.error("Configure a conta Meta antes de sincronizar");
      return;
    }
    setSyncingId(c.id);
    try {
      const result = await syncClientData(
        c.id, c.meta_ad_account_id, c.meta_access_token, setSyncProgress
      );
      toast.success(
        `Sincronizado! ${result.campaigns} campanhas · ${result.adSets} conjuntos · ${result.ads} anúncios`,
        { duration: 6000 }
      );
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na sincronização");
    } finally {
      setSyncingId(null);
      setSyncProgress("");
    }
  }

  async function createClient(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("clients").insert({ name: newName, status: "active" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Cliente criado");
    setNewName("");
    setCreateOpen(false);
    load();
  }

  async function toggleStatus(c: Client) {
    const { error } = await supabase
      .from("clients")
      .update({ status: c.status === "active" ? "inactive" : "active" })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    load();
  }

  const isSyncing = syncingId !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
                  <Input id="name" value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="Ex: Loja Aurora" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Criar"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Connect Meta dialog */}
      <Dialog open={!!connectClient} onOpenChange={(o) => !o && closeConnectDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar Meta Ads — {connectClient?.name}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="oauth">
            <TabsList className="w-full">
              <TabsTrigger value="oauth" className="flex-1">Via Facebook</TabsTrigger>
              <TabsTrigger value="manual" className="flex-1">Token manual</TabsTrigger>
            </TabsList>

            {/* OAuth tab */}
            <TabsContent value="oauth" className="space-y-4 pt-2">
              {adAccounts.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Clique no botão abaixo para autorizar o acesso via sua conta do Facebook.
                    Um popup será aberto para confirmar as permissões necessárias.
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
                    <Label>Conta de anúncios</Label>
                    <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a conta..." />
                      </SelectTrigger>
                      <SelectContent>
                        {adAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id.replace("act_", "")}>
                            {a.name} ({a.id})
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

            {/* Manual tab */}
            <TabsContent value="manual">
              <form onSubmit={handleConnectManual} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="adAccountId">ID da conta de anúncios</Label>
                  <Input
                    id="adAccountId"
                    value={adAccountId}
                    onChange={(e) => setAdAccountId(e.target.value)}
                    placeholder="act_123456789 ou 123456789"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accessToken">Token de acesso (System User)</Label>
                  <Input
                    id="accessToken"
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
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

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Lista de clientes</CardTitle>
          <CardDescription>{clients.length} cliente(s) cadastrado(s)</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : clients.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-muted-foreground">Nenhum cliente cadastrado ainda.</p>
              {canManage && <p className="mt-1 text-xs text-muted-foreground">Clique em "Novo cliente" para começar.</p>}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Meta Ads</TableHead>
                  <TableHead>Última sync</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={c.status === "active"}
                          onCheckedChange={() => canManage && toggleStatus(c)}
                          disabled={!canManage}
                        />
                        <span className="text-xs text-muted-foreground">
                          {c.status === "active" ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.meta_ad_account_id ? (
                        <span className="text-xs font-medium text-success">Conectado · {c.meta_ad_account_id}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Não conectado</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.meta_connected_at ? format(new Date(c.meta_connected_at), "dd/MM/yyyy HH:mm") : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(c.created_at), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && (
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openConnectDialog(c)} disabled={syncingId === c.id}>
                            <Link2 className="mr-2 h-3 w-3" />
                            {c.meta_ad_account_id ? "Reconfigurar" : "Conectar Meta"}
                          </Button>
                          {c.meta_ad_account_id && c.meta_access_token && (
                            <Button variant="outline" size="sm" onClick={() => handleQuickSync(c)} disabled={isSyncing}>
                              <RefreshCw className={`mr-2 h-3 w-3 ${syncingId === c.id ? "animate-spin" : ""}`} />
                              {syncingId === c.id ? syncProgress || "Sincronizando..." : "Sincronizar"}
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${c.id}/audit`)}>
                            <ShieldCheck className="mr-2 h-3 w-3" />Auditar
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${c.id}/reports`)}>
                            <FileText className="mr-2 h-3 w-3" />Relatórios
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${c.id}/creatives`)}>
                            <Image className="mr-2 h-3 w-3" />Criativos
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${c.id}/audiences`)}>
                            <Users className="mr-2 h-3 w-3" />Públicos
                          </Button>
                        </div>
                      )}
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
