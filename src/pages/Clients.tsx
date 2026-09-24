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
  Stethoscope,
  MoreVertical,
  Archive,
  ArchiveRestore,
  Trash2,
  Pencil,
  MapPin,
  Store,
  Send,
  Loader2,
  ExternalLink,
  Wallet,
  UserCog,
  PlugZap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { syncClientData, validateMetaConnection } from "@/lib/meta-api";
import { metaGet, metaGetAll } from "@/lib/meta-fetch";
import { loadFacebookSDK, facebookLogin, type MetaAdAccount, type MetaInstagramAccount, type MetaPage } from "@/lib/facebook-sdk";
import { BUSINESS_SEGMENTS, LOCAL_GOALS, segmentLabel } from "@/lib/local-business";
import { computeBudgetStatus } from "@/lib/client-budget";
import { fetchClientFundingSummaries, type ClientFundingSummary } from "@/lib/meta-funding";
import { formatCurrency } from "@/lib/format";
import { errorMessage } from "@/lib/utils";
import { ConnectDialog } from "@/components/clients/ConnectDialog";
import { MetaDiagnosticsDialog } from "@/components/clients/MetaDiagnosticsDialog";
import { BulkMetaConnectDialog } from "@/components/clients/BulkMetaConnectDialog";
import { ensureAdsScope, exchangeMetaToken } from "@/lib/meta-connect";
import {
  discoverInstagramFromAdAccount,
  discoverMetaInventory,
  mergeAdAccounts,
  mergeInstagramAccounts,
  metaPageLogoUrl,
  resolveInstagramUser,
} from "@/lib/meta-discovery";
import { META_APP_ID, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/env";
import { ClientBudgetMeter, ClientBudgetCell } from "@/components/clients/ClientBudgetMeter";
import ClientReportDialog from "@/components/ClientReportDialog";
import { ClientAvatar } from "@/components/ClientAvatar";

const AD_ACCOUNT_STATUS_LABELS: Record<number, string> = {
  2: "Desativada",
  3: "Nao liquidada",
  7: "Em analise",
  8: "Encerramento pendente",
  9: "Periodo de carencia",
  100: "Encerrada",
};

function adAccountStatusLabel(status?: number) {
  return status == null ? "" : AD_ACCOUNT_STATUS_LABELS[status] ?? "";
}

const META_V21 = "https://graph.facebook.com/v21.0";
const SUPABASE_KEY = SUPABASE_PUBLISHABLE_KEY;

interface Client {
  id: string;
  name: string;
  status: string;
  logo_url: string | null;
  business_segment: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  service_radius_km: number | null;
  primary_goal: string | null;
  meta_balance_cents: number | null;
  meta_ad_account_id: string | null;
  meta_access_token: string | null;
  meta_page_id: string | null;
  meta_page_name: string | null;
  meta_instagram_account_id: string | null;
  meta_instagram_username: string | null;
  meta_auto_sync_enabled: boolean;
  meta_auto_sync_frequency_hours: number;
  meta_connected_at: string | null;
  meta_last_sync_at: string | null;
  meta_last_sync_error: string | null;
  meta_last_verified_at: string | null;
  meta_sync_runs: number;
  meta_sync_status: "pending" | "connected" | "syncing" | "healthy" | "warning" | "error" | "expired";
  connect_customer_uuid: string | null;
  connect_connected_at: string | null;
  manager_id: string | null;
  company_id: string | null;
  dashboard_share_token: string;
  created_at: string;
  whatsapp_number: string | null;
  whatsapp_group_jid: string | null;
  report_template: Record<string, unknown> | null;
}

interface ManagerOption {
  id: string;
  name: string;
  is_active: boolean;
}

interface ReportRow {
  client_id: string;
  created_at: string;
}

type StatusFilter = "all" | "active" | "inactive" | "archived";
type ConnectionFilter = "all" | "connected" | "disconnected";
type SortOption = "recent" | "name" | "reports" | "lastSync" | "balance";
type BudgetFilter = "all" | "vaiFaltar" | "sobrando" | "lowBalance" | "noBalance";
type ManagerFilter = "all" | "none" | string;

const NO_MANAGER = "none";

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
  syncing: { label: "Sincronizando", badge: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  healthy: { label: "Saudavel", badge: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  warning: { label: "Atencao", badge: "border-amber-200 bg-amber-50 text-amber-700" },
  error: { label: "Erro", badge: "border-rose-200 bg-rose-50 text-rose-700" },
  expired: { label: "Token expirado", badge: "border-rose-200 bg-rose-50 text-rose-700" },
};

// Conta arquivada fica na listagem por historico, mas nao e operacao do dia a
// dia. Ate agora so o badge diferenciava, e badge se perde numa grade de 64
// cards: o tom recuado separa antes da leitura.
function tomArquivado(isArchived: boolean, isActive: boolean) {
  if (isArchived) return "border-slate-200 border-l-4 border-l-slate-400 bg-slate-50";
  if (!isActive) return "border-slate-200 border-l-4 border-l-amber-300 bg-white";
  return "border-slate-200 bg-white";
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
  const [budgetFilter, setBudgetFilter] = useState<BudgetFilter>("all");
  const [managerFilter, setManagerFilter] = useState<ManagerFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [reportStats, setReportStats] = useState<Record<string, { count: number; latest: string | null }>>({});
  const [monthSpend, setMonthSpend] = useState<Record<string, number>>({});
  const [fundingSummaries, setFundingSummaries] = useState<Record<string, ClientFundingSummary>>({});
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [newName, setNewName] = useState("");
  const [newLogoUrl, setNewLogoUrl] = useState("");
  const [newSegment, setNewSegment] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newRadius, setNewRadius] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newWhatsapp, setNewWhatsapp] = useState("");
  const [newWhatsappGroupJid, setNewWhatsappGroupJid] = useState("");
  const [newManagerId, setNewManagerId] = useState("");
  const [newCompanyId, setNewCompanyId] = useState("");
  const [waGroups, setWaGroups] = useState<{ id: string; subject: string }[] | null>(null);
  const [loadingWaGroups, setLoadingWaGroups] = useState(false);
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
  const [pages, setPages] = useState<MetaPage[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedPageId, setSelectedPageId] = useState("");
  const [selectedInstagramId, setSelectedInstagramId] = useState("");
  const [instagramAccounts, setInstagramAccounts] = useState<MetaInstagramAccount[]>([]);
  const [longLivedToken, setLongLivedToken] = useState("");

  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reportClient, setReportClient] = useState<Client | null>(null);
  const [reporteiClient, setReporteiClient] = useState<Client | null>(null);
  const [diagnosticsClient, setDiagnosticsClient] = useState<Client | null>(null);
  const [bulkConnectOpen, setBulkConnectOpen] = useState(false);
  const [refreshingLogos, setRefreshingLogos] = useState(false);

  // Gasto do mes corrente por cliente. Paginado porque a tabela tem 1 linha por
  // cliente/dia e o teto padrao do PostgREST corta em 1000 linhas.
  async function fetchMonthSpendByClient() {
    const now = new Date();
    const firstOfMonth = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
    const pageSize = 1000;
    const totals: Record<string, number> = {};

    for (let page = 0; ; page += 1) {
      const { data, error } = await supabase
        .from("campaign_daily_metrics")
        .select("client_id, spend")
        .gte("date", firstOfMonth)
        .order("id", { ascending: true })
        .range(page * pageSize, page * pageSize + pageSize - 1);

      if (error) throw error;
      const rows = data ?? [];
      for (const row of rows) {
        totals[row.client_id] = (totals[row.client_id] ?? 0) + (Number(row.spend) || 0);
      }
      if (rows.length < pageSize) break;
    }

    return totals;
  }

  async function load() {
    setLoading(true);
    const [
      { data: clientsData, error: clientsError },
      { data: reportsData, error: reportsError },
      spendTotals,
      funding,
      { data: managersData },
      { data: companiesData },
    ] =
      await Promise.all([
        supabase.from("clients").select("*, logo_url").order("created_at", { ascending: false }),
        supabase.from("reports").select("client_id, created_at"),
        fetchMonthSpendByClient().catch((error: unknown) => {
          toast.error(errorMessage(error, "Erro ao carregar verba do mes"));
          return {} as Record<string, number>;
        }),
        // Aporte e complemento: sem ele a verba cai no valor digitado, que e
        // exatamente o comportamento antigo. Nao vale travar a tela por isso.
        fetchClientFundingSummaries().catch(() => ({} as Record<string, ClientFundingSummary>)),
        supabase.from("managers").select("id, name, is_active").order("name"),
        supabase.from("companies").select("id, name").eq("is_active", true).order("name"),
      ]);

    if (clientsError) toast.error(clientsError.message);
    if (reportsError) toast.error(reportsError.message);

    setMonthSpend(spendTotals);
    setFundingSummaries(funding);

    setClients((clientsData as Client[]) ?? []);
    setManagers((managersData as ManagerOption[]) ?? []);
    setCompanies((companiesData as { id: string; name: string }[]) ?? []);

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

  const managerById = useMemo(() => {
    return new Map(managers.map((manager) => [manager.id, manager]));
  }, [managers]);

  const clientsWithStats = useMemo(() => {
    return clients.map((client) => {
      const stats = reportStats[client.id] ?? { count: 0, latest: null };
      const funding = fundingSummaries[client.id];
      const budget = computeBudgetStatus({
        spent: monthSpend[client.id] ?? 0,
        deposited: funding?.depositedThisMonth ?? null,
        depositCount: funding?.depositCount ?? 0,
        balance: client.meta_balance_cents != null ? client.meta_balance_cents / 100 : null,
      });
      const isConnected = Boolean(client.meta_ad_account_id);
      const isActive = client.status === "active";
      const isArchived = client.status === "archived";
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
        budget,
        isConnected,
        isActive,
        isArchived,
        health,
        lastSyncDate,
        verifiedAt,
        syncDue,
        syncLabel,
      };
    });
  }, [clients, reportStats, monthSpend, fundingSummaries, syncingId, syncProgress]);

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clientsWithStats
      .filter(({ client, isActive, isArchived, isConnected, budget }) => {
        const matchesSearch = !term || client.name.toLowerCase().includes(term);
        let matchesStatus = true;
        if (statusFilter === "active") matchesStatus = isActive;
        else if (statusFilter === "inactive") matchesStatus = !isActive && !isArchived;
        else if (statusFilter === "archived") matchesStatus = isArchived;
        else matchesStatus = !isArchived;
        const matchesConnection =
          connectionFilter === "all" ||
          (connectionFilter === "connected" && isConnected) ||
          (connectionFilter === "disconnected" && !isConnected);
        const matchesManager =
          managerFilter === "all" ||
          (managerFilter === NO_MANAGER ? !client.manager_id : client.manager_id === managerFilter);
        const matchesBudget =
          budgetFilter === "all" ||
          (budgetFilter === "vaiFaltar" && (budget.level === "ahead" || budget.level === "over")) ||
          (budgetFilter === "sobrando" && (budget.level === "behind" || budget.level === "idle")) ||
          (budgetFilter === "lowBalance" && budget.lowBalance) ||
          (budgetFilter === "noBalance" && budget.balance === null);

        return matchesSearch && matchesStatus && matchesConnection && matchesManager && matchesBudget;
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.client.name.localeCompare(b.client.name, "pt-BR");
        if (sortBy === "reports") return b.stats.count - a.stats.count;
        if (sortBy === "lastSync") return (b.lastSyncDate?.getTime() ?? 0) - (a.lastSyncDate?.getTime() ?? 0);
        if (sortBy === "balance") {
          // Menor saldo primeiro: e quem para de entregar antes. Conta sem
          // saldo lido vai pro fim, porque ausencia nao e zero.
          if (a.budget.balance === null) return b.budget.balance === null ? 0 : 1;
          if (b.budget.balance === null) return -1;
          return a.budget.balance - b.budget.balance;
        }
        return new Date(b.client.created_at).getTime() - new Date(a.client.created_at).getTime();
      });
  }, [clientsWithStats, search, statusFilter, connectionFilter, managerFilter, budgetFilter, sortBy]);

  const filteredActiveCount = filteredClients.filter(({ isActive }) => isActive).length;
  const filteredConnectedCount = filteredClients.filter(({ isConnected }) => isConnected).length;
  const healthyCount = clients.filter((client) => client.meta_sync_status === "healthy").length;

  // O resumo agora soma dinheiro que existe: saldo nas contas e aporte do mes.
  // Antes somava o teto digitado, que era promessa e nao caixa.
  const budgetOverview = useMemo(() => {
    return clientsWithStats.reduce(
      (acc, { budget, isArchived }) => {
        if (isArchived) return acc;
        acc.spent += budget.spent;
        if (budget.balance !== null) {
          acc.balance += budget.balance;
          acc.withBalance += 1;
          if (budget.lowBalance) acc.lowBalance += 1;
        } else {
          acc.withoutBalance += 1;
        }
        if (budget.deposited) acc.deposited += budget.deposited;
        return acc;
      },
      { balance: 0, deposited: 0, spent: 0, withBalance: 0, withoutBalance: 0, lowBalance: 0 }
    );
  }, [clientsWithStats]);

  const budgetOverviewPct =
    budgetOverview.deposited > 0 ? (budgetOverview.spent / budgetOverview.deposited) * 100 : 0;

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setConnectionFilter("all");
    setManagerFilter("all");
    setBudgetFilter("all");
    setSortBy("recent");
  }

  function openConnectDialog(client: Client) {
    setAdAccountId(client.meta_ad_account_id ?? "");
    setAccessToken(client.meta_access_token ?? "");
    setAutoSyncEnabled(client.meta_auto_sync_enabled ?? false);
    setAutoSyncFrequencyHours(String(client.meta_auto_sync_frequency_hours ?? 24));
    setAdAccounts([]);
    setPages([]);
    // Reabrir o dialogo nao pode perder o que ja estava conectado: zerar isso
    // obrigava a reescolher a conta, e se ela nao voltasse na lista do OAuth
    // nao havia como salvar de novo.
    setSelectedAccountId(client.meta_ad_account_id ?? "");
    setSelectedPageId(client.meta_page_id ?? "");
    setSelectedInstagramId(client.meta_instagram_account_id ?? "");
    setInstagramAccounts(
      client.meta_instagram_account_id
        ? [{ id: client.meta_instagram_account_id, username: client.meta_instagram_username ?? undefined, origin: "Salvo no cliente" }]
        : []
    );
    setLongLivedToken("");
    setConnectClient(client);
  }

  function closeConnectDialog() {
    setConnectClient(null);
    setAdAccounts([]);
    setPages([]);
    setSelectedAccountId("");
    setSelectedPageId("");
    setSelectedInstagramId("");
    setInstagramAccounts([]);
    setLongLivedToken("");
    setAutoSyncEnabled(false);
    setAutoSyncFrequencyHours("24");
  }

  // Alguns clientes tem o IG vinculado so na conta de anuncios, sem passar pela Pagina.
  useEffect(() => {
    if (!selectedAccountId || !longLivedToken) return;
    let cancelled = false;
    discoverInstagramFromAdAccount(selectedAccountId, longLivedToken).then((found) => {
      if (cancelled || found.length === 0) return;
      setInstagramAccounts((prev) => mergeInstagramAccounts(prev, found));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, longLivedToken]);

  async function handleFacebookLogin() {
    // Nao e fatal para o app (so o fluxo de conexao Meta depende dela), por isso
    // fica fora do REQUIRED do `env.ts` e e checada aqui, no ponto de uso.
    if (!META_APP_ID) {
      toast.error("VITE_META_APP_ID nao foi definida no build. Cadastre no Vercel e refaca o deploy.");
      return;
    }

    setOauthLoading(true);
    try {
      await loadFacebookSDK(META_APP_ID);
      const loginResult = await facebookLogin();
      const shortToken = loginResult.accessToken;

      ensureAdsScope(loginResult.grantedScopes);

      const missing = ["instagram_basic", "instagram_manage_insights"].filter(
        (scope) => !loginResult.grantedScopes.includes(scope)
      );
      if (missing.length > 0) {
        toast.warning(
          `Voce nao concedeu: ${missing.join(", ")}. Insights de Instagram (alcance, engajamento, visitas) virao vazios. Reconecte e marque tudo.`,
          { duration: 10000 }
        );
      }

      setSyncProgress("Trocando token...");
      const data = await exchangeMetaToken(shortToken);

      setLongLivedToken(data.access_token);
      setAdAccounts(data.ad_accounts ?? []);

      const inventory = await discoverMetaInventory(data.access_token, setSyncProgress);
      const facebookPages = inventory.pages;
      setPages(facebookPages);

      const accounts = mergeAdAccounts(data.ad_accounts ?? [], inventory.adAccounts);
      setAdAccounts(accounts);

      if (accounts.length === 1) {
        setSelectedAccountId((prev) => prev || accounts[0].id.replace("act_", ""));
      }
      if (facebookPages.length === 1) {
        setSelectedPageId((prev) => prev || facebookPages[0].id);
      }

      const discovered = inventory.instagramAccounts;
      // Merge, nunca substituicao: trocar a lista derrubava o perfil que ja
      // estava salvo no cliente, e o SearchableSelect mostra o placeholder
      // quando o id selecionado nao esta entre as opcoes — o perfil "sumia"
      // da tela mesmo continuando selecionado por baixo.
      setInstagramAccounts((prev) => mergeInstagramAccounts(prev, discovered));
      if (discovered.length === 1) {
        setSelectedInstagramId((prev) => prev || discovered[0].id);
      }

      if (accounts.length === 0) {
        toast.warning(
          "Nenhuma conta de anuncios foi retornada pela Meta. Confirme que o usuario tem acesso a conta no Business Manager e que voce autorizou ads_read/business_management, ou informe o ID manualmente.",
          { duration: 10000 }
        );
      } else {
        toast.success(`${accounts.length} conta(s) de anuncio · ${facebookPages.length} pagina(s) · ${discovered.length} Instagram`);
      }
    } catch (error) {
      toast.error(errorMessage(error, "Erro no login com Facebook"));
    } finally {
      setOauthLoading(false);
      setSyncProgress("");
    }
  }

  async function handleSaveOAuth(event: React.FormEvent) {
    event.preventDefault();
    if (!connectClient || !selectedAccountId || !longLivedToken) return;
    const selectedPage = pages.find((page) => page.id === selectedPageId);
    let explicitInstagram: MetaInstagramAccount | null = null;
    if (selectedInstagramId) {
      explicitInstagram =
        instagramAccounts.find((account) => account.id === selectedInstagramId) ??
        (await resolveInstagramUser(selectedInstagramId, longLivedToken));
      if (!explicitInstagram) {
        toast.error("O ID de Instagram informado nao foi reconhecido pela Meta");
        return;
      }
    }
    await saveAndSync(connectClient, selectedAccountId, longLivedToken, selectedPage, explicitInstagram);
  }

  async function handleConnectManual(event: React.FormEvent) {
    event.preventDefault();
    if (!connectClient || !adAccountId.trim() || !accessToken.trim()) {
      toast.error("Preencha o ID da conta e o token de acesso");
      return;
    }
    await saveAndSync(connectClient, adAccountId, accessToken);
  }

  async function saveAndSync(
    client: Client,
    accountId: string,
    token: string,
    selectedPage?: MetaPage,
    explicitInstagram?: MetaInstagramAccount | null
  ) {
    setSyncingId(client.id);
    setSyncProgress("Salvando configuracoes...");
    try {
      const instagramFromPage = selectedPage?.instagram_business_account ?? selectedPage?.connected_instagram_account ?? null;
      const instagramFinal = explicitInstagram ?? instagramFromPage;
      const pageIdForLogo = selectedPage?.id || client.meta_page_id;
      const { error } = await supabase
        .from("clients")
        .update({
          meta_ad_account_id: accountId.replace("act_", ""),
          meta_access_token: token.trim(),
          meta_page_id: selectedPage?.id || client.meta_page_id,
          meta_page_name: selectedPage?.name || client.meta_page_name,
          // Vem do PAGE_FIELDS da descoberta e ate agora era descartado.
          meta_page_access_token: selectedPage?.access_token ?? null,
          meta_instagram_account_id: instagramFinal?.id || client.meta_instagram_account_id,
          meta_instagram_username: instagramFinal?.username || client.meta_instagram_username,
          meta_auto_sync_enabled: autoSyncEnabled,
          meta_auto_sync_frequency_hours: Number(autoSyncFrequencyHours),
          meta_last_sync_error: null,
          meta_sync_status: "connected",
          logo_url: pageIdForLogo ? metaPageLogoUrl(pageIdForLogo) : client.logo_url,
        })
        .eq("id", client.id);

      if (error) throw error;

      // Copia a foto pro Storage em segundo plano. Ate terminar (ou se falhar),
      // a URL do Graph gravada acima ja segura a exibicao.
      if (pageIdForLogo) {
        supabase.functions
          .invoke("sync-client-logo", { body: { clientId: client.id } })
          .then(({ error: logoError }) => { if (!logoError) load(); })
          .catch(() => {});
      }

      const result = await syncClientData(client.id, accountId, token, setSyncProgress);
      toast.success(
        `Sincronizado! ${result.campaigns} campanhas · ${result.adSets} conjuntos · ${result.ads} anuncios`,
        { duration: 6000 }
      );
      closeConnectDialog();
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Erro ao salvar"));
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
      toast.error(errorMessage(error, "Erro na sincronizacao"));
    } finally {
      setSyncingId(null);
      setSyncProgress("");
    }
  }

  function resetClientForm() {
    setNewName("");
    setNewLogoUrl("");
    setNewSegment("");
    setNewCity("");
    setNewState("");
    setNewAddress("");
    setNewRadius("");
    setNewGoal("");
    setNewWhatsapp("");
    setNewWhatsappGroupJid("");
    setNewManagerId("");
    setNewCompanyId("");
  }

  async function loadWaGroups() {
    if (waGroups || loadingWaGroups) return;
    setLoadingWaGroups(true);
    try {
      const { data, error } = await supabase.functions.invoke("list-whatsapp-groups");
      if (error) throw new Error(error.message);
      setWaGroups(data?.groups ?? []);
    } catch {
      setWaGroups([]);
    } finally {
      setLoadingWaGroups(false);
    }
  }

  function openCreateDialog() {
    setEditClient(null);
    resetClientForm();
    // Cliente sem empresa fica invisivel para quem nao e owner, entao quando so
    // existe uma empresa ela ja vem escolhida.
    if (companies.length === 1) setNewCompanyId(companies[0].id);
    setCreateOpen(true);
    loadWaGroups();
  }

  function openEditDialog(client: Client) {
    setEditClient(client);
    setNewName(client.name ?? "");
    setNewLogoUrl(client.logo_url ?? "");
    setNewSegment(client.business_segment ?? "");
    setNewCity(client.city ?? "");
    setNewState(client.state ?? "");
    setNewAddress(client.address ?? "");
    setNewRadius(client.service_radius_km != null ? String(client.service_radius_km) : "");
    setNewGoal(client.primary_goal ?? "");
    setNewWhatsapp(client.whatsapp_number ?? "");
    setNewWhatsappGroupJid(client.whatsapp_group_jid ?? "");
    setNewManagerId(client.manager_id ?? "");
    setNewCompanyId(client.company_id ?? "");
    setCreateOpen(true);
    loadWaGroups();
  }

  async function createClient(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const payload = {
      name: newName.trim(),
      logo_url: newLogoUrl.trim() || null,
      business_segment: newSegment || null,
      city: newCity.trim() || null,
      state: newState.trim().toUpperCase() || null,
      address: newAddress.trim() || null,
      service_radius_km: newRadius.trim() ? Number(newRadius) : null,
      primary_goal: newGoal || null,
      whatsapp_number: newWhatsapp.trim().replace(/\D/g, "") || null,
      whatsapp_group_jid: newWhatsappGroupJid || null,
      manager_id: newManagerId || null,
      company_id: newCompanyId || null,
    };
    const { error } = editClient
      ? await supabase.from("clients").update(payload).eq("id", editClient.id)
      : await supabase.from("clients").insert({ ...payload, status: "active" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editClient ? "Cliente atualizado" : "Cliente criado");
    resetClientForm();
    setEditClient(null);
    setCreateOpen(false);
    load();
  }

  async function assignManager(client: Client, managerId: string | null) {
    const { error } = await supabase.from("clients").update({ manager_id: managerId }).eq("id", client.id);
    if (error) return toast.error(error.message);
    setClients((prev) => prev.map((item) => (item.id === client.id ? { ...item, manager_id: managerId } : item)));
    toast.success(
      managerId
        ? `${client.name} atribuido a ${managerById.get(managerId)?.name ?? "gestor"}`
        : "Gestor removido da conta"
    );
  }

  async function toggleStatus(client: Client) {
    const { error } = await supabase
      .from("clients")
      .update({ status: client.status === "active" ? "inactive" : "active" })
      .eq("id", client.id);
    if (error) return toast.error(error.message);
    load();
  }

  async function archiveClient(client: Client) {
    const nextStatus = client.status === "archived" ? "inactive" : "archived";
    const { error } = await supabase
      .from("clients")
      .update({ status: nextStatus })
      .eq("id", client.id);
    if (error) return toast.error(error.message);
    toast.success(nextStatus === "archived" ? "Cliente arquivado" : "Cliente desarquivado");
    load();
  }

  async function confirmDeleteClient() {
    if (!deleteClient) return;
    setDeleting(true);
    const { error } = await supabase.from("clients").delete().eq("id", deleteClient.id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success("Cliente excluido");
    setDeleteClient(null);
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
      const message = errorMessage(error, "Erro ao verificar integracao");
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

  async function refreshClientLogos() {
    setRefreshingLogos(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-client-logo", { body: { all: true } });
      if (error) {
        const detail = await (error as { context?: { json?: () => Promise<{ error?: string }> } })
          ?.context?.json?.()
          .catch(() => null);
        throw new Error(detail?.error || error.message);
      }
      if (data?.error) throw new Error(data.error);

      const updated = data?.updated?.length ?? 0;
      const failed = data?.failed?.length ?? 0;
      if (updated === 0) {
        toast.error(failed > 0 ? `Nenhuma foto atualizada · ${failed} com erro` : "Nenhuma foto atualizada");
      } else {
        toast.success(`${updated} foto(s) atualizada(s)${failed > 0 ? ` · ${failed} com erro` : ""}`);
      }
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Erro ao atualizar as fotos"));
    } finally {
      setRefreshingLogos(false);
    }
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
      toast.error(errorMessage(error, "Erro ao executar sync automatica"));
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
          const message = errorMessage(error, "Erro ao verificar integracao");
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
  const expiredClients = clients.filter((client) => client.meta_sync_status === "expired");

  async function copyDashboardLink(client: Client) {
    const url = `${window.location.origin}/dashboard/${client.dashboard_share_token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link do dashboard copiado — pode enviar pro cliente");
  }

  // So 3 acoes primarias visiveis (as mais usadas no dia a dia); o resto fica
  // organizado no menu "..." pra nao poluir o card com 9 botoes de uma vez.
  function renderClientActions(client: Client, compact = false) {
    const connected = !!(client.meta_ad_account_id && client.meta_access_token);

    return (
      <div className={`flex ${compact ? "flex-wrap" : "justify-end"} gap-2`}>
        {canManage && !connected && (
          <Button variant="outline" size="sm" onClick={() => openConnectDialog(client)} disabled={syncingId === client.id}>
            <Link2 className="mr-2 h-3 w-3" />Conectar Meta
          </Button>
        )}
        {canManage && connected && (
          <Button variant="outline" size="sm" onClick={() => handleQuickSync(client)} disabled={isSyncing}>
            <RefreshCw className={`mr-2 h-3 w-3 ${syncingId === client.id ? "animate-spin" : ""}`} />
            {syncingId === client.id ? "Sincronizando..." : "Sincronizar"}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${client.id}/reports`)}>
          <FileText className="mr-2 h-3 w-3" />Relatorios
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-green-500/30 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
          onClick={() => setReportClient(client)}
        >
          <Send className="mr-2 h-3 w-3" />Relatório WA
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" aria-label="Mais acoes">
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canManage && connected && (
              <DropdownMenuItem onClick={() => openConnectDialog(client)} disabled={syncingId === client.id}>
                <Link2 className="mr-2 h-4 w-4" />Reconfigurar Meta
              </DropdownMenuItem>
            )}
            {canManage && connected && (
              <DropdownMenuItem onClick={() => handleVerifyConnection(client)} disabled={verifyingId === client.id}>
                <ShieldAlert className="mr-2 h-4 w-4" />
                {verifyingId === client.id ? "Verificando..." : "Verificar conexão"}
              </DropdownMenuItem>
            )}
            {canManage && connected && (
              <DropdownMenuItem onClick={() => setDiagnosticsClient(client)}>
                <Stethoscope className="mr-2 h-4 w-4" />Diagnosticar conexão
              </DropdownMenuItem>
            )}
            {canManage && (
              <DropdownMenuItem onClick={() => setReporteiClient(client)}>
                <PlugZap className="mr-2 h-4 w-4" />
                {client.connect_customer_uuid ? "Reportei Connect" : "Conectar Reportei"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => navigate(`/clients/${client.id}/audit`)}>
              <ShieldCheck className="mr-2 h-4 w-4" />Auditar conta
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/clients/${client.id}/creatives`)}>
              <ImageIcon className="mr-2 h-4 w-4" />Criativos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/clients/${client.id}/audiences`)}>
              <Users className="mr-2 h-4 w-4" />Públicos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => copyDashboardLink(client)}>
              <ExternalLink className="mr-2 h-4 w-4" />Copiar link do dashboard
            </DropdownMenuItem>
            {canManage && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <UserCog className="mr-2 h-4 w-4" />Gestor responsavel
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {managers.length === 0 ? (
                      <DropdownMenuItem disabled>Cadastre gestores em Automacao</DropdownMenuItem>
                    ) : (
                      <DropdownMenuRadioGroup
                        value={client.manager_id ?? NO_MANAGER}
                        onValueChange={(value) => assignManager(client, value === NO_MANAGER ? null : value)}
                      >
                        <DropdownMenuRadioItem value={NO_MANAGER}>Sem gestor</DropdownMenuRadioItem>
                        {managers.map((manager) => (
                          <DropdownMenuRadioItem key={manager.id} value={manager.id}>
                            {manager.name}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={() => openEditDialog(client)}>
                  <Pencil className="mr-2 h-4 w-4" />Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => archiveClient(client)}>
                  {client.status === "archived" ? (
                    <>
                      <ArchiveRestore className="mr-2 h-4 w-4" />Desarquivar
                    </>
                  ) : (
                    <>
                      <Archive className="mr-2 h-4 w-4" />Arquivar
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeleteClient(client)}
                  className="text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                >
                  <Trash2 className="mr-2 h-4 w-4" />Excluir
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
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
            <Button variant="outline" onClick={refreshClientLogos} disabled={refreshingLogos}>
              <ImageIcon className={`mr-2 h-4 w-4 ${refreshingLogos ? "animate-pulse" : ""}`} />
              {refreshingLogos ? "Atualizando fotos..." : "Atualizar fotos"}
            </Button>
            {canManage && (
              <Button variant="outline" onClick={() => setBulkConnectOpen(true)}>
                <Link2 className="mr-2 h-4 w-4" />
                Conectar Meta em massa
              </Button>
            )}
            <Button onClick={openCreateDialog}><Plus className="mr-2 h-4 w-4" />Novo cliente</Button>
            <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setEditClient(null); }}>
              <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-lg">
                <DialogHeader className="shrink-0"><DialogTitle>{editClient ? "Editar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
                <form onSubmit={createClient} className="flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do cliente</Label>
                    <Input id="name" value={newName} onChange={(event) => setNewName(event.target.value)} required placeholder="Ex: Pizzaria do Bairro" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Segmento do negócio</Label>
                      <Select value={newSegment} onValueChange={setNewSegment}>
                        <SelectTrigger><SelectValue placeholder="Selecione o nicho..." /></SelectTrigger>
                        <SelectContent>
                          {BUSINESS_SEGMENTS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Objetivo principal</Label>
                      <Select value={newGoal} onValueChange={setNewGoal}>
                        <SelectTrigger><SelectValue placeholder="O que mais importa?" /></SelectTrigger>
                        <SelectContent>
                          {LOCAL_GOALS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      Empresa
                      <span className="text-xs font-normal text-muted-foreground">(quem enxerga esse cliente)</span>
                    </Label>
                    <Select value={newCompanyId} onValueChange={setNewCompanyId}>
                      <SelectTrigger><SelectValue placeholder="Selecione a empresa..." /></SelectTrigger>
                      <SelectContent>
                        {companies.map((company) => (
                          <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!newCompanyId && (
                      <p className="text-xs text-amber-600">
                        Sem empresa, esse cliente so aparece para o owner.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      Gestor responsavel
                      <span className="text-xs font-normal text-muted-foreground">(quem cuida dessa conta)</span>
                    </Label>
                    <Select
                      value={newManagerId || NO_MANAGER}
                      onValueChange={(value) => setNewManagerId(value === NO_MANAGER ? "" : value)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_MANAGER}>Sem gestor definido</SelectItem>
                        {managers.map((manager) => (
                          <SelectItem key={manager.id} value={manager.id}>{manager.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_120px_140px]">
                    <div className="space-y-2">
                      <Label htmlFor="city">Cidade</Label>
                      <Input id="city" value={newCity} onChange={(event) => setNewCity(event.target.value)} placeholder="Ex: Campinas" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">UF</Label>
                      <Input id="state" value={newState} onChange={(event) => setNewState(event.target.value)} maxLength={2} placeholder="SP" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="radius">Raio (km)</Label>
                      <Input id="radius" type="number" min={0} value={newRadius} onChange={(event) => setNewRadius(event.target.value)} placeholder="10" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Endereço</Label>
                    <Input id="address" value={newAddress} onChange={(event) => setNewAddress(event.target.value)} placeholder="Rua, número, bairro" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="logoUrl">Foto ou logo (URL)</Label>
                    <Input id="logoUrl" value={newLogoUrl} onChange={(event) => setNewLogoUrl(event.target.value)} placeholder="https://..." />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp" className="flex items-center gap-1.5">
                      WhatsApp
                      <span className="text-xs font-normal text-muted-foreground">(para receber relatórios)</span>
                    </Label>
                    <Input
                      id="whatsapp"
                      value={newWhatsapp}
                      onChange={(event) => setNewWhatsapp(event.target.value)}
                      placeholder="5511999999999"
                      inputMode="numeric"
                    />
                    <p className="text-xs text-muted-foreground">DDI + DDD + número, só dígitos. Ex: 5511999999999</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsappGroup" className="flex items-center gap-1.5">
                      Grupo do WhatsApp
                      <span className="text-xs font-normal text-muted-foreground">(opcional, sobrepõe o número acima)</span>
                    </Label>
                    <Select
                      value={newWhatsappGroupJid || "none"}
                      onValueChange={(v) => setNewWhatsappGroupJid(v === "none" ? "" : v)}
                    >
                      <SelectTrigger id="whatsappGroup">
                        {loadingWaGroups ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SelectValue />}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum — usar número acima</SelectItem>
                        {(waGroups ?? []).map(g => (
                          <SelectItem key={g.id} value={g.id}>{g.subject}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  </div>
                  <DialogFooter className="shrink-0 border-t border-border/60 pt-3">
                    <Button type="submit" disabled={saving}>{saving ? "Salvando..." : editClient ? "Salvar" : "Criar"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Dialog open={!!connectClient} onOpenChange={(open) => !open && closeConnectDialog()}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar Meta Ads - {connectClient?.name}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="oauth">
            <TabsList className="w-full">
              <TabsTrigger value="oauth" className="flex-1">Via Facebook</TabsTrigger>
              <TabsTrigger value="manual" className="flex-1">Token manual</TabsTrigger>
            </TabsList>

            <TabsContent value="oauth" className="space-y-4 pt-2">
              {!longLivedToken ? (
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
                    {adAccounts.length > 0 ? (
                      <SearchableSelect
                        value={selectedAccountId}
                        onChange={setSelectedAccountId}
                        placeholder="Selecione a conta..."
                        searchPlaceholder="Buscar conta ou ID..."
                        emptyText="Nenhuma conta encontrada"
                        options={adAccounts.map((account) => ({
                          value: account.id.replace("act_", ""),
                          label: account.name || account.id,
                          description: [account.id, account.business?.name, adAccountStatusLabel(account.account_status)]
                            .filter(Boolean)
                            .join(" · "),
                          keywords: [account.id, account.id.replace("act_", ""), account.business?.name ?? ""],
                        }))}
                      />
                    ) : (
                      <Input
                        value={selectedAccountId}
                        onChange={(event) => setSelectedAccountId(event.target.value.trim().replace("act_", ""))}
                        placeholder="ID da conta (ex: 123456789)"
                      />
                    )}
                    {adAccounts.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        A Meta nao devolveu nenhuma conta de anuncios para este usuario. Verifique em
                        business.facebook.com se o seu usuario tem acesso a conta do cliente (Contas de anuncio &gt;
                        Adicionar pessoas) e reconecte, ou cole o ID da conta aqui - o token ja esta salvo.
                      </p>
                    )}
                    {/* A lista da Meta nem sempre traz a conta do cliente. Sem
                        esta saida, quando ela nao vinha a tela travava: o campo
                        manual so aparecia com a lista completamente vazia. */}
                    {adAccounts.length > 0 && (
                      <>
                        <Input
                          value={selectedAccountId}
                          onChange={(event) => setSelectedAccountId(event.target.value.trim().replace("act_", ""))}
                          placeholder="Ou informe o ID da conta (ex: 123456789)"
                          className="text-xs"
                        />
                        {selectedAccountId &&
                          !adAccounts.some((account) => account.id.replace("act_", "") === selectedAccountId) && (
                            <p className="text-xs text-amber-600">
                              Essa conta nao veio na lista da Meta, mas o ID informado sera salvo do mesmo jeito.
                            </p>
                          )}
                      </>
                    )}
                  </div>
                  {pages.length > 0 && (
                    <div className="space-y-2">
                      <Label>Pagina do Facebook</Label>
                      <SearchableSelect
                        value={selectedPageId}
                        onChange={(value) => {
                          setSelectedPageId(value);
                          const page = pages.find((item) => item.id === value);
                          const igFromPage = page?.instagram_business_account ?? page?.connected_instagram_account;
                          if (igFromPage?.id) setSelectedInstagramId(igFromPage.id);
                        }}
                        placeholder="Selecione a pagina para usar a logo..."
                        searchPlaceholder="Buscar pagina..."
                        emptyText="Nenhuma pagina encontrada"
                        options={pages.map((page) => ({
                          value: page.id,
                          label: page.name,
                          description: page.id,
                          keywords: [page.id],
                        }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        A foto da pagina selecionada sera usada como logo automatica do cliente.
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Perfil do Instagram</Label>
                    {instagramAccounts.length > 0 ? (
                      <SearchableSelect
                        value={selectedInstagramId}
                        onChange={setSelectedInstagramId}
                        placeholder="Selecione o Instagram..."
                        searchPlaceholder="Buscar Instagram..."
                        emptyText="Nenhum Instagram encontrado"
                        options={instagramAccounts.map((account) => ({
                          value: account.id,
                          label: account.username ? `@${account.username}` : `Instagram ${account.id}`,
                          description: account.origin ? `Via ${account.origin}` : account.id,
                          keywords: [account.id, account.username ?? "", account.origin ?? ""],
                        }))}
                      />
                    ) : (
                      <Input
                        value={selectedInstagramId}
                        onChange={(event) => setSelectedInstagramId(event.target.value.trim())}
                        placeholder="ID do perfil (ex: 17841400000000000)"
                      />
                    )}
                    <p className="text-xs text-muted-foreground">
                      {instagramAccounts.length > 0
                        ? "Define o perfil usado para seguidores, alcance e visitas ao perfil."
                        : "Nenhum perfil vinculado foi encontrado nesta conta. Cole o ID do Instagram (Meta Business > Contas do Instagram) ou vincule o perfil a Pagina e conecte de novo."}
                    </p>
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

      {canManage && expiredClients.length > 0 && (
        <Card className="border-rose-200 bg-rose-50/70">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-rose-100 p-3 text-rose-600">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-rose-800">
                    {expiredClients.length} integração(ões) com token expirado
                  </p>
                  <p className="text-sm text-rose-700">
                    A sessão do Facebook foi invalidada (troca de senha ou segurança). Esses clientes não sincronizam até reconectar a Meta. Como o login costuma ser o mesmo, ao reconectar um, os demais ficam rápidos.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {expiredClients.map((client) => (
                <Button
                  key={client.id}
                  variant="outline"
                  size="sm"
                  className="border-rose-200 bg-white text-rose-700 hover:bg-rose-100"
                  onClick={() => openConnectDialog(client)}
                >
                  <Link2 className="mr-2 h-3 w-3" />
                  Reconectar {client.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="border-slate-200 md:col-span-2 xl:col-span-1">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-violet-100 p-3 text-violet-600">
                <Wallet className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">Saldo nas contas</p>
                <p className="text-2xl font-bold">{formatCurrency(budgetOverview.balance)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(budgetOverview.spent)} gastos · {formatCurrency(budgetOverview.deposited)} aportados
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${budgetOverviewPct >= 100 ? "bg-rose-500" : "bg-violet-500"}`}
                    style={{ width: `${Math.min(budgetOverviewPct, 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {budgetOverview.lowBalance} com saldo baixo · {budgetOverview.withoutBalance} sem saldo lido
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-600">
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
                  <SelectItem value="archived">Arquivados</SelectItem>
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
              <Select value={managerFilter} onValueChange={(value) => setManagerFilter(value as ManagerFilter)}>
                <SelectTrigger className="w-[170px]">
                  <UserCog className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Gestor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos gestores</SelectItem>
                  <SelectItem value={NO_MANAGER}>Sem gestor</SelectItem>
                  {managers.map((manager) => (
                    <SelectItem key={manager.id} value={manager.id}>{manager.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={budgetFilter} onValueChange={(value) => setBudgetFilter(value as BudgetFilter)}>
                <SelectTrigger className="w-[180px]">
                  <Wallet className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Verba" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toda verba</SelectItem>
                  <SelectItem value="vaiFaltar">Saldo nao cobre o mes</SelectItem>
                  <SelectItem value="sobrando">Saldo sobrando</SelectItem>
                  <SelectItem value="lowBalance">Saldo baixo</SelectItem>
                  <SelectItem value="noBalance">Sem saldo lido</SelectItem>
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
                  <SelectItem value="balance">Menor saldo</SelectItem>
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
            <Badge variant="secondary" className="gap-1 rounded-full bg-emerald-500/10 text-emerald-200">
              <Sparkles className="h-3 w-3" />
              {filteredClients.length} em foco
            </Badge>
            <Badge variant="secondary" className="rounded-full bg-emerald-500/10 text-emerald-200">
              {filteredActiveCount} ativos
            </Badge>
            <Badge variant="secondary" className="rounded-full bg-sky-500/10 text-sky-200">
              {filteredConnectedCount} com Meta
            </Badge>
            <Badge variant="secondary" className="gap-1 rounded-full bg-violet-500/10 text-violet-200">
              <Wallet className="h-3 w-3" />
              {formatCurrency(budgetOverview.balance)} em saldo
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
              {filteredClients.map(({ client, stats, budget, isActive, isArchived, isConnected, health, syncLabel, syncDue }) => {
                const latestText = stats.latest
                  ? `ultimo ${formatDistanceToNow(new Date(stats.latest), { addSuffix: true, locale: ptBR })}`
                  : "nenhum gerado ainda";

                return (
                  <Card key={client.id} className={`overflow-hidden shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tomArquivado(isArchived, isActive)}`}>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div
                          className="flex items-center min-w-0 cursor-pointer group/clientlink"
                          onClick={() => navigate(`/clients/${client.id}`)}
                        >
                          <ClientAvatar name={client.name} logoUrl={client.logo_url} className={`mr-4 h-10 w-10 ${isArchived ? "opacity-60 grayscale" : ""}`} />
                          <div className="min-w-0">
                            <h3 className={`text-lg font-semibold truncate group-hover/clientlink:text-primary group-hover/clientlink:underline ${isArchived ? "text-slate-500" : ""}`}>{client.name}</h3>
                            <div className="mt-1 flex flex-wrap gap-2">
                              <Badge variant="outline" className={isArchived ? "border-amber-200 bg-amber-50 text-amber-700" : isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}>
                                {isArchived ? "Arquivado" : isActive ? "Ativo" : "Inativo"}
                              </Badge>
                              <Badge variant="outline" className={isConnected ? "border-sky-200 bg-sky-50 text-sky-700" : "border-slate-200 bg-slate-50 text-slate-500"}>
                                {isConnected ? "Meta conectada" : "Sem Meta"}
                              </Badge>
                              {client.connect_customer_uuid && (
                                <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700">
                                  <PlugZap className="h-3 w-3" />Reportei
                                </Badge>
                              )}
                              <Badge variant="outline" className={health.badge}>
                                {health.label}
                              </Badge>
                              {client.meta_auto_sync_enabled && (
                                <Badge variant="outline" className={syncDue ? "border-amber-200 bg-amber-50 text-amber-700" : "border-indigo-200 bg-indigo-50 text-indigo-700"}>
                                  {syncDue ? "Sync vencida" : `Auto ${client.meta_auto_sync_frequency_hours}h`}
                                </Badge>
                              )}
                              {client.business_segment && (
                                <Badge variant="outline" className="gap-1 border-violet-200 bg-violet-50 text-violet-700">
                                  <Store className="h-3 w-3" />{segmentLabel(client.business_segment)}
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className={client.manager_id
                                  ? "gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "gap-1 border-dashed border-slate-200 bg-slate-50 text-slate-500"}
                              >
                                <UserCog className="h-3 w-3" />
                                {client.manager_id ? managerById.get(client.manager_id)?.name ?? "Gestor removido" : "Sem gestor"}
                              </Badge>
                              {(client.city || client.state) && (
                                <Badge variant="outline" className="gap-1 border-slate-200 bg-slate-50 text-slate-600">
                                  <MapPin className="h-3 w-3" />{[client.city, client.state].filter(Boolean).join("/")}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {syncingId === client.id ? (
                            <span className="inline-flex items-center text-xs font-medium text-emerald-600">
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
                          <span className="font-semibold">{stats.count}</span> {stats.count === 1 ? "relatorio" : "relatorios"} · {latestText}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{syncLabel}</p>
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

                      <div className="mt-3">
                        <ClientBudgetMeter
                          status={budget}
                          onSync={canManage && client.meta_ad_account_id ? () => handleQuickSync(client) : undefined}
                        />
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
                  <TableHead>Gestor</TableHead>
                  <TableHead>Verba do mes</TableHead>
                  <TableHead>Relatorios</TableHead>
                  <TableHead>Ultima sync</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map(({ client, stats, budget, isArchived, isConnected, lastSyncDate, syncLabel, health, syncDue }) => {
                  return (
                    <TableRow key={client.id} className={isArchived ? "bg-slate-50/70 text-slate-500" : undefined}>
                      <TableCell>
                        <div
                          className="flex items-center gap-3 cursor-pointer group/clientlink"
                          onClick={() => navigate(`/clients/${client.id}`)}
                        >
                          <Avatar className={`h-10 w-10 border border-slate-200 ${isArchived ? "opacity-60 grayscale" : ""}`}>
                            {client.logo_url && <AvatarImage src={client.logo_url} alt={client.name} />}
                            <AvatarFallback className={`${getAvatarTone(client.name)} text-xs font-semibold`}>
                              {getInitials(client.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium group-hover/clientlink:text-primary group-hover/clientlink:underline">{client.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {[segmentLabel(client.business_segment), [client.city, client.state].filter(Boolean).join("/") || null]
                                .filter(Boolean)
                                .join(" · ") || (client.meta_ad_account_id ? `CA ${client.meta_ad_account_id}` : "Sem conta conectada")}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {client.status === "archived" ? (
                          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Arquivado</Badge>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Switch checked={client.status === "active"} onCheckedChange={() => canManage && toggleStatus(client)} disabled={!canManage} />
                            <span className="text-xs text-muted-foreground">{client.status === "active" ? "Ativo" : "Inativo"}</span>
                          </div>
                        )}
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
                      <TableCell>
                        {client.manager_id ? (
                          <span className="text-xs font-medium text-slate-700">
                            {managerById.get(client.manager_id)?.name ?? "Gestor removido"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem gestor</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ClientBudgetCell status={budget} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {stats.count} {stats.count === 1 ? "relatorio" : "relatorios"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {syncingId === client.id ? (
                          <span className="inline-flex items-center text-emerald-600">
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

      <AlertDialog open={!!deleteClient} onOpenChange={(open) => !open && !deleting && setDeleteClient(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao remove permanentemente <strong>{deleteClient?.name}</strong> e todos os dados vinculados (campanhas, conjuntos, anuncios, relatorios e auditorias). Nao e possivel desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmDeleteClient();
              }}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600"
            >
              {deleting ? "Excluindo..." : "Excluir definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {reportClient && (
        <ClientReportDialog
          open={!!reportClient}
          onClose={() => setReportClient(null)}
          client={reportClient}
        />
      )}

      {reporteiClient && (
        <ConnectDialog
          open={!!reporteiClient}
          onClose={() => setReporteiClient(null)}
          client={reporteiClient}
          onConnected={(customerUuid) => {
            setClients((prev) =>
              prev.map((item) =>
                item.id === reporteiClient.id
                  ? { ...item, connect_customer_uuid: customerUuid, connect_connected_at: new Date().toISOString() }
                  : item,
              ),
            );
            setReporteiClient((current) =>
              current ? { ...current, connect_customer_uuid: customerUuid } : current,
            );
          }}
        />
      )}

      {diagnosticsClient && (
        <MetaDiagnosticsDialog
          open={!!diagnosticsClient}
          onClose={() => setDiagnosticsClient(null)}
          client={diagnosticsClient}
        />
      )}

      <BulkMetaConnectDialog
        open={bulkConnectOpen}
        onClose={() => setBulkConnectOpen(false)}
        clients={clients}
        onSaved={load}
      />
    </div>
  );
}
