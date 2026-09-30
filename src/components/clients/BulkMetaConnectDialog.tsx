import { useMemo, useState } from "react";
import { AlertTriangle, Link2, Loader2, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { loadFacebookSDK, facebookLogin, type MetaAdAccount, type MetaInstagramAccount, type MetaPage } from "@/lib/facebook-sdk";
import { ensureAdsScope, exchangeMetaToken, suggestByName } from "@/lib/meta-connect";
import { discoverMetaInventory, metaPageLogoUrl, type MetaInventory } from "@/lib/meta-discovery";
import {
  precisaReconectar,
  selecionarParaGravar,
  syncClientsSequentially,
  type BulkSyncReport,
} from "@/lib/meta-bulk-sync";
import { META_APP_ID } from "@/lib/env";
import { errorMessage } from "@/lib/utils";

interface BulkClient {
  id: string;
  name: string;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
  meta_page_name: string | null;
  meta_instagram_account_id: string | null;
  meta_instagram_username: string | null;
  meta_sync_status: string | null;
  logo_url: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  clients: BulkClient[];
  onSaved: () => void;
}

interface Assignment {
  accountId: string;
  pageId: string;
  instagramId: string;
  suggested: boolean;
}

type Phase = "idle" | "connecting" | "mapping" | "saving" | "syncing" | "report";

const NONE = "__none__";

export function BulkMetaConnectDialog({ open, onClose, clients, onSaved }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");
  const [token, setToken] = useState("");
  const [inventory, setInventory] = useState<MetaInventory | null>(null);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  const [search, setSearch] = useState("");
  const [onlyPending, setOnlyPending] = useState(true);
  const [syncAfterSave, setSyncAfterSave] = useState(true);
  const [report, setReport] = useState<BulkSyncReport | null>(null);

  function reset() {
    setPhase("idle");
    setProgress("");
    setToken("");
    setInventory(null);
    setAssignments({});
    setSearch("");
    setOnlyPending(true);
    setSyncAfterSave(true);
    setReport(null);
  }

  async function handleConnect() {
    if (!META_APP_ID) {
      toast.error("VITE_META_APP_ID nao foi definida no build. Cadastre no Vercel e refaca o deploy.");
      return;
    }

    setPhase("connecting");
    try {
      setProgress("Abrindo o login do Facebook...");
      await loadFacebookSDK(META_APP_ID);
      const login = await facebookLogin();
      ensureAdsScope(login.grantedScopes);

      setProgress("Trocando token...");
      const exchange = await exchangeMetaToken(login.accessToken);
      setToken(exchange.access_token);

      const found = await discoverMetaInventory(exchange.access_token, setProgress);
      setInventory(found);

      setProgress("Sugerindo vinculos por nome...");
      setAssignments(buildSuggestions(clients, found));

      setPhase("mapping");
      toast.success(
        `${found.adAccounts.length} conta(s) · ${found.pages.length} pagina(s) · ${found.instagramAccounts.length} Instagram`
      );
    } catch (error) {
      setPhase("idle");
      toast.error(errorMessage(error, "Erro no login com Facebook"), { duration: 12000 });
    } finally {
      setProgress("");
    }
  }

  function buildSuggestions(list: BulkClient[], found: MetaInventory): Record<string, Assignment> {
    const next: Record<string, Assignment> = {};

    for (const client of list) {
      const jaTem = client.meta_ad_account_id;
      const account = jaTem
        ? found.adAccounts.find((item) => item.id.replace("act_", "") === jaTem)
        : suggestByName(client.name, found.adAccounts, (item) => item.name ?? item.id);

      const page = client.meta_page_id
        ? found.pages.find((item) => item.id === client.meta_page_id)
        : suggestByName(client.name, found.pages, (item) => item.name);

      const instagram = client.meta_instagram_account_id
        ? found.instagramAccounts.find((item) => item.id === client.meta_instagram_account_id)
        : pageInstagram(page) ??
          suggestByName(client.name, found.instagramAccounts, (item) => item.username ?? item.id);

      next[client.id] = {
        accountId: account ? account.id.replace("act_", "") : "",
        pageId: page?.id ?? "",
        instagramId: instagram?.id ?? "",
        suggested: !jaTem && Boolean(account),
      };
    }

    return next;
  }

  function pageInstagram(page?: MetaPage | null): MetaInstagramAccount | null {
    return page?.instagram_business_account ?? page?.connected_instagram_account ?? null;
  }

  function update(clientId: string, patch: Partial<Assignment>) {
    setAssignments((prev) => ({
      ...prev,
      [clientId]: { ...prev[clientId], ...patch, suggested: false },
    }));
  }

  const accountOptions = useMemo(
    () =>
      (inventory?.adAccounts ?? []).map((account: MetaAdAccount) => ({
        value: account.id.replace("act_", ""),
        label: account.name ?? account.id,
        description: account.business?.name ?? account.id,
      })),
    [inventory]
  );

  const pageOptions = useMemo(
    () => [
      { value: NONE, label: "Sem pagina" },
      ...(inventory?.pages ?? []).map((page) => ({ value: page.id, label: page.name, description: page.id })),
    ],
    [inventory]
  );

  const instagramOptions = useMemo(
    () => [
      { value: NONE, label: "Sem Instagram" },
      ...(inventory?.instagramAccounts ?? []).map((account) => ({
        value: account.id,
        label: account.username ? `@${account.username}` : account.id,
        description: account.origin,
      })),
    ],
    [inventory]
  );

  const visibleClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clients.filter((client) => {
      // "Falta resolver" nao e so quem esta sem Meta: quem esta vinculado mas
      // quebrado tambem precisa aparecer, senao o filtro esconde justamente
      // quem o login novo conserta.
      if (onlyPending && client.meta_ad_account_id && !precisaReconectar(client)) return false;
      if (!term) return true;
      return client.name.toLowerCase().includes(term);
    });
  }, [clients, search, onlyPending]);

  const pending = useMemo(() => selecionarParaGravar(clients, assignments), [clients, assignments]);

  async function handleSave() {
    if (pending.length === 0 || !token) return;

    setPhase("saving");
    let ok = 0;
    const failures: string[] = [];

    for (const client of pending) {
      const assignment = assignments[client.id];
      const page = inventory?.pages.find((item) => item.id === assignment.pageId);
      const instagram =
        inventory?.instagramAccounts.find((item) => item.id === assignment.instagramId) ?? pageInstagram(page);
      const pageIdForLogo = page?.id || client.meta_page_id;

      const { error } = await supabase
        .from("clients")
        .update({
          meta_ad_account_id: assignment.accountId,
          meta_access_token: token,
          meta_page_id: page?.id ?? client.meta_page_id,
          meta_page_name: page?.name ?? client.meta_page_name,
          meta_page_access_token: page?.access_token ?? null,
          meta_instagram_account_id: instagram?.id ?? client.meta_instagram_account_id,
          meta_instagram_username: instagram?.username ?? client.meta_instagram_username,
          meta_connected_at: new Date().toISOString(),
          meta_last_sync_error: null,
          meta_sync_status: "connected",
          logo_url: pageIdForLogo ? metaPageLogoUrl(pageIdForLogo) : client.logo_url,
        })
        .eq("id", client.id);

      if (error) failures.push(`${client.name}: ${error.message}`);
      else ok += 1;
    }

    if (ok > 0) toast.success(`${ok} cliente(s) vinculado(s) a Meta`);
    if (failures.length > 0) {
      toast.error(`${failures.length} falharam ao salvar. ${failures[0]}`, { duration: 12000 });
    }
    onSaved();

    const salvos = pending.filter((client) => !failures.some((f) => f.startsWith(`${client.name}:`)));
    if (!syncAfterSave || salvos.length === 0) {
      setPhase("mapping");
      if (failures.length === 0) {
        reset();
        onClose();
      }
      return;
    }

    setPhase("syncing");
    const resultado = await syncClientsSequentially(
      salvos.map((client) => ({
        id: client.id,
        name: client.name,
        meta_ad_account_id: assignments[client.id].accountId,
        meta_access_token: token,
      })),
      {
        onProgress: (name, done, total) => setProgress(name ? `${name} (${done + 1}/${total})` : ""),
      }
    );

    setReport(resultado);
    setPhase("report");
    onSaved();
  }

  const busy = phase === "connecting" || phase === "saving" || phase === "syncing";
  const semMeta = clients.filter((client) => !client.meta_ad_account_id).length;
  const quebrados = clients.filter(precisaReconectar).length;
  const reconectando = pending.filter(precisaReconectar).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (value || busy) return;
        reset();
        onClose();
      }}
    >
      <DialogContent className="flex max-h-[88vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Conectar Meta para varios clientes</DialogTitle>
          <DialogDescription>
            Um login, uma varredura. Depois voce so escolhe qual conta pertence a qual cliente.
          </DialogDescription>
        </DialogHeader>

        {phase === "idle" && (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
            <div className="rounded-xl border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
              <p>
                Hoje a varredura roda de novo a cada cliente que voce abre — centenas de chamadas repetidas para
                descobrir sempre o mesmo inventario. Aqui ela roda uma vez e vale para todos.
              </p>
              <p className="mt-2">
                <span className="font-medium text-foreground">{clients.length}</span> cliente(s) na lista,{" "}
                <span className="font-medium text-foreground">{semMeta}</span> ainda sem Meta
                {quebrados > 0 && (
                  <>
                    {" "}e <span className="font-medium text-foreground">{quebrados}</span> com a conexao
                    quebrada, que este login tambem reconecta
                  </>
                )}
                .
              </p>
            </div>
            <Button onClick={handleConnect} className="w-full">
              <Link2 className="mr-2 h-4 w-4" />
              Conectar com o Facebook
            </Button>
          </div>
        )}

        {busy && (
          <div className="space-y-2 py-10">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {phase === "syncing"
                ? `Sincronizando ${progress || "..."}`
                : progress || (phase === "saving" ? "Salvando vinculos..." : "Consultando a Meta...")}
            </div>
            {phase === "syncing" && (
              <p className="text-xs text-muted-foreground">
                Uma conta por vez, de proposito. Se a Meta reclamar de limite ou tres falharem seguidas, paro sozinho.
              </p>
            )}
          </div>
        )}

        {phase === "mapping" && inventory && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar cliente..."
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="only-pending" checked={onlyPending} onCheckedChange={setOnlyPending} />
                <Label htmlFor="only-pending" className="text-sm text-muted-foreground">
                  So quem falta resolver
                </Label>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {visibleClients.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhum cliente nesse filtro.</p>
              )}

              {visibleClients.map((client) => {
                const assignment = assignments[client.id] ?? {
                  accountId: "",
                  pageId: "",
                  instagramId: "",
                  suggested: false,
                };
                return (
                  <div key={client.id} className="rounded-xl border border-border/60 bg-card/40 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-sm font-medium">{client.name}</span>
                      {assignment.suggested && (
                        <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/10 text-primary">
                          <Sparkles className="h-3 w-3" />
                          sugerido
                        </Badge>
                      )}
                      {client.meta_ad_account_id && !precisaReconectar(client) && (
                        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                          ja conectado
                        </Badge>
                      )}
                      {precisaReconectar(client) && (
                        <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700">
                          <AlertTriangle className="h-3 w-3" />
                          {client.meta_sync_status === "expired" ? "token expirado" : "sync falhando"}
                        </Badge>
                      )}
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                      <SearchableSelect
                        options={accountOptions}
                        value={assignment.accountId}
                        onChange={(value) => update(client.id, { accountId: value })}
                        placeholder="Conta de anuncio"
                        searchPlaceholder="Buscar conta..."
                      />
                      <SearchableSelect
                        options={pageOptions}
                        value={assignment.pageId || NONE}
                        onChange={(value) => update(client.id, { pageId: value === NONE ? "" : value })}
                        placeholder="Pagina"
                        searchPlaceholder="Buscar pagina..."
                      />
                      <SearchableSelect
                        options={instagramOptions}
                        value={assignment.instagramId || NONE}
                        onChange={(value) => update(client.id, { instagramId: value === NONE ? "" : value })}
                        placeholder="Instagram"
                        searchPlaceholder="Buscar perfil..."
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {pending.length === 0
                    ? "Nada para salvar ainda."
                    : [
                        `${pending.length} cliente(s) a salvar`,
                        reconectando > 0 ? `${reconectando} reconectando por token vencido` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ") + "."}
                </p>
                <div className="flex items-center gap-2">
                  <Switch id="sync-after" checked={syncAfterSave} onCheckedChange={setSyncAfterSave} />
                  <Label htmlFor="sync-after" className="text-xs text-muted-foreground">
                    Sincronizar em seguida
                  </Label>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { reset(); onClose(); }}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={pending.length === 0}>
                  Salvar {pending.length > 0 ? `${pending.length} vinculo(s)` : ""}
                </Button>
              </div>
            </div>
          </div>
        )}

        {phase === "report" && report && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {(() => {
              const ok = report.outcomes.filter((item) => item.ok);
              const falhas = report.outcomes.filter((item) => !item.ok);
              return (
                <>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600">
                      {ok.length} sincronizado(s)
                    </Badge>
                    {falhas.length > 0 && (
                      <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-600">
                        {falhas.length} com erro
                      </Badge>
                    )}
                  </div>

                  {report.abortedReason && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
                      {report.abortedReason}
                    </div>
                  )}

                  {falhas.length > 0 && (
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                      {falhas.map((item) => (
                        <div key={item.id} className="rounded-xl border border-border/60 bg-card/40 p-3">
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs leading-relaxed text-muted-foreground">{item.error}</p>
                        </div>
                      ))}
                      <p className="pt-1 text-xs text-muted-foreground">
                        Use Diagnosticar conexao no menu do cliente para saber se e cargo na conta, escopo do token
                        ou acesso do app.
                      </p>
                    </div>
                  )}

                  <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 pt-3">
                    <Button variant="outline" onClick={() => setPhase("mapping")}>
                      Voltar aos vinculos
                    </Button>
                    <Button onClick={() => { reset(); onClose(); }}>Fechar</Button>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
