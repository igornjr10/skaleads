import { useMemo, useState } from "react";
import { AlertTriangle, Link2, Loader2, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import { guardarTokensMeta } from "@/lib/meta-client";
import { errorMessage } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

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

// account_status da Meta: 1 = ativa. Desativada/encerrada entra na lista, mas
// desmarcada — virar cliente so faz sentido se ainda roda anuncio.
const CONTA_ATIVA = 1;

interface Vinculo {
  accountId: string;
  page?: MetaPage | null;
  instagram?: MetaInstagramAccount | null;
}

function semAct(id: string) {
  return id.replace("act_", "");
}

export function BulkMetaConnectDialog({ open, onClose, clients, onSaved }: Props) {
  const { empresa } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");
  const [token, setToken] = useState("");
  const [inventory, setInventory] = useState<MetaInventory | null>(null);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  const [search, setSearch] = useState("");
  const [onlyPending, setOnlyPending] = useState(true);
  const [syncAfterSave, setSyncAfterSave] = useState(true);
  const [report, setReport] = useState<BulkSyncReport | null>(null);
  const [criar, setCriar] = useState<Record<string, boolean>>({});

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
    setCriar({});
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
      const sugestoes = buildSuggestions(clients, found);
      setAssignments(sugestoes);
      const usadas = contasUsadas(clients, sugestoes);
      setCriar(
        Object.fromEntries(
          found.adAccounts
            .filter((conta) => !usadas.has(semAct(conta.id)))
            .map((conta) => [semAct(conta.id), conta.account_status === CONTA_ATIVA])
        )
      );

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

  function contasUsadas(list: BulkClient[], atribuicoes: Record<string, Assignment>) {
    return new Set(
      [...list.map((c) => c.meta_ad_account_id), ...Object.values(atribuicoes).map((a) => a.accountId)].filter(
        (id): id is string => Boolean(id)
      )
    );
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

  // Conta escolhida para um cliente existente sai daqui na hora: senao viraria
  // cliente duplicado.
  const contasSemCliente = useMemo(() => {
    if (!inventory) return [];
    const usadas = contasUsadas(clients, assignments);
    return inventory.adAccounts.filter((conta) => !usadas.has(semAct(conta.id)));
  },[inventory, clients, assignments]);

  const novos = contasSemCliente.filter((conta) => criar[semAct(conta.id)]);
  const totalASalvar = pending.length + novos.length;

  async function vincular(clientId: string, nome: string, v: Vinculo, atual?: BulkClient): Promise<string | null> {
    const instagram = v.instagram ?? pageInstagram(v.page);
    const pageIdForLogo = v.page?.id || atual?.meta_page_id;

    // Cofre primeiro: se falhar, o cliente nao fica marcado como conectado sem token.
    try {
      await guardarTokensMeta(clientId, { token, pageToken: v.page?.access_token });
    } catch (err) {
      return `${nome}: ${errorMessage(err, "falha ao guardar o token")}`;
    }

    const { error } = await supabase
      .from("clients")
      .update({
        meta_ad_account_id: v.accountId,
        meta_page_id: v.page?.id ?? atual?.meta_page_id ?? null,
        meta_page_name: v.page?.name ?? atual?.meta_page_name ?? null,
        meta_instagram_account_id: instagram?.id ?? atual?.meta_instagram_account_id ?? null,
        meta_instagram_username: instagram?.username ?? atual?.meta_instagram_username ?? null,
        meta_connected_at: new Date().toISOString(),
        meta_last_sync_error: null,
        meta_sync_status: "connected",
        logo_url: pageIdForLogo ? metaPageLogoUrl(pageIdForLogo) : atual?.logo_url ?? null,
      })
      .eq("id", clientId);
    return error ? `${nome}: ${error.message}` : null;
  }

  async function handleSave() {
    if (totalASalvar === 0 || !token) return;

    setPhase("saving");
    let ok = 0;
    const failures: string[] = [];
    const salvos: { id: string; name: string; meta_ad_account_id: string }[] = [];

    for (const client of pending) {
      const assignment = assignments[client.id];
      const falha = await vincular(
        client.id,
        client.name,
        {
          accountId: assignment.accountId,
          page: inventory?.pages.find((item) => item.id === assignment.pageId),
          instagram: inventory?.instagramAccounts.find((item) => item.id === assignment.instagramId),
        },
        client
      );
      if (falha) failures.push(falha);
      else {
        ok += 1;
        salvos.push({ id: client.id, name: client.name, meta_ad_account_id: assignment.accountId });
      }
    }

    let criados = 0;
    for (const conta of novos) {
      const nome = (conta.name || conta.id).trim();
      setProgress(`Criando ${nome}...`);
      const { data: novo, error } = await supabase
        .from("clients")
        .insert({ name: nome, status: "active", ...(empresa ? { company_id: empresa.id } : {}) })
        .select("id")
        .single();
      if (error || !novo) {
        failures.push(`${nome}: ${error?.message ?? "nao consegui criar o cliente"}`);
        continue;
      }
      const page = inventory ? suggestByName(nome, inventory.pages, (item) => item.name) : null;
      const instagram =
        pageInstagram(page) ??
        (inventory ? suggestByName(nome, inventory.instagramAccounts, (item) => item.username ?? item.id) : null);
      const falha = await vincular(novo.id, nome, { accountId: semAct(conta.id), page, instagram });
      if (falha) failures.push(falha);
      else {
        criados += 1;
        salvos.push({ id: novo.id, name: nome, meta_ad_account_id: semAct(conta.id) });
      }
    }
    setProgress("");

    if (ok > 0) toast.success(`${ok} cliente(s) vinculado(s) a Meta`);
    if (criados > 0) toast.success(`${criados} cliente(s) criado(s) a partir das contas de anuncio`);
    if (failures.length > 0) {
      toast.error(`${failures.length} falharam ao salvar. ${failures[0]}`, { duration: 12000 });
    }
    onSaved();

    if (!syncAfterSave || salvos.length === 0) {
      setPhase("mapping");
      if (failures.length === 0) {
        reset();
        onClose();
      }
      return;
    }

    setPhase("syncing");
    const resultado = await syncClientsSequentially(salvos, {
      onProgress: (name, done, total) => setProgress(name ? `${name} (${done + 1}/${total})` : ""),
    });

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
            Um login, uma varredura. Voce escolhe qual conta pertence a qual cliente, e as contas que ainda nao tem
            cliente viram cliente novo.
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
              {contasSemCliente.length > 0 && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{contasSemCliente.length} conta(s) de anuncio sem cliente</p>
                      <p className="text-xs text-muted-foreground">
                        As marcadas viram cliente novo com o nome da conta, ja conectado. Pagina e Instagram vem pelo
                        nome quando a Meta acha.
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCriar(Object.fromEntries(contasSemCliente.map((c) => [semAct(c.id), true])))}
                      >
                        Marcar todas
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setCriar({})}>
                        Nenhuma
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {contasSemCliente.map((conta) => {
                      const id = semAct(conta.id);
                      return (
                        <label
                          key={id}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={Boolean(criar[id])}
                            onCheckedChange={(v) => setCriar((prev) => ({ ...prev, [id]: Boolean(v) }))}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm">{conta.name || conta.id}</span>
                          {conta.account_status !== CONTA_ATIVA && (
                            <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                              inativa
                            </Badge>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

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
                  {totalASalvar === 0
                    ? "Nada para salvar ainda."
                    : [
                        pending.length > 0 ? `${pending.length} cliente(s) a salvar` : "",
                        novos.length > 0 ? `${novos.length} cliente(s) novo(s)` : "",
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
                <Button onClick={handleSave} disabled={totalASalvar === 0}>
                  Salvar {totalASalvar > 0 ? `(${totalASalvar})` : ""}
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
