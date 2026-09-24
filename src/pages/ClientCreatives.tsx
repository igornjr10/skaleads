import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, RefreshCw, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { syncAdDailyMetrics, syncAudienceBreakdowns } from "@/lib/meta-api";
import {
  getCreativesGallery,
  type CreativeItem,
  type GalleryFilters,
  type SortField,
} from "@/lib/creative-analysis";
import { CreativeCard } from "@/components/creatives/CreativeCard";
import { CreativeDrawer } from "@/components/creatives/CreativeDrawer";

const PERIOD_OPTIONS = [
  { label: "7 dias", value: "7" },
  { label: "14 dias", value: "14" },
  { label: "30 dias", value: "30" },
  { label: "90 dias", value: "90" },
];

const SORT_OPTIONS: { label: string; field: SortField; dir: "asc" | "desc" }[] = [
  { label: "Maior investimento", field: "spend", dir: "desc" },
  { label: "Maior CTR", field: "ctr", dir: "desc" },
  { label: "Menor CPA", field: "cpa", dir: "asc" },
  { label: "Mais conversões", field: "conversions", dir: "desc" },
  { label: "Maior frequência", field: "frequency", dir: "desc" },
];

export default function ClientCreatives() {
  const { id: clientId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [clientName, setClientName] = useState("");
  const [creatives, setCreatives] = useState<CreativeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<CreativeItem | null>(null);

  // Filters from URL
  const period = parseInt(searchParams.get("period") || "30");
  const fatigueOnly = searchParams.get("fatigue") === "true";
  const sortKey = searchParams.get("sort") || "spend:desc";
  const search = searchParams.get("search") || "";

  const currentSort = SORT_OPTIONS.find(o => `${o.field}:${o.dir}` === sortKey) || SORT_OPTIONS[0];

  function updateParam(key: string, value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  }

  useEffect(() => {
    if (!clientId) return;
    supabase.from("clients").select("name").eq("id", clientId).single()
      .then(({ data }) => { if (data) setClientName(data.name); });
  }, [clientId]);

  const fetchCreatives = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const filters: GalleryFilters = {
        period,
        fatigueOnly,
        sortField: currentSort.field,
        sortDir: currentSort.dir,
        search,
      };
      const data = await getCreativesGallery(clientId, filters);
      setCreatives(data);
    } catch (err) {
      toast.error("Erro ao carregar criativos");
    } finally {
      setLoading(false);
    }
  }, [clientId, period, fatigueOnly, sortKey, search]);

  useEffect(() => {
    fetchCreatives();
  }, [fetchCreatives]);

  async function handleSyncAdvanced() {
    if (!clientId) return;
    const { data: client } = await supabase
      .from("clients")
      .select("meta_ad_account_id, meta_access_token")
      .eq("id", clientId)
      .single();

    if (!client?.meta_ad_account_id || !client?.meta_access_token) {
      toast.error("Cliente sem conta Meta conectada");
      return;
    }

    setSyncing(true);
    try {
      const [metrics, breakdowns] = await Promise.all([
        syncAdDailyMetrics(clientId, client.meta_ad_account_id, client.meta_access_token, "last_30d",
          msg => toast.info(msg, { duration: 1500 })),
        syncAudienceBreakdowns(clientId, client.meta_ad_account_id, client.meta_access_token, "last_30d",
          msg => toast.info(msg, { duration: 1500 })),
      ]);
      toast.success(`Sincronizado: ${metrics} métricas diárias, ${breakdowns} breakdowns`);
      fetchCreatives();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  const fatigueCount = creatives.filter(c => c.fatigueStatus !== "NONE").length;
  const severeCount = creatives.filter(c => c.fatigueStatus === "SEVERE").length;

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/clients"><ChevronLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Galeria de Criativos</h1>
            {clientName && <p className="text-sm text-muted-foreground">{clientName}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/clients/${clientId}/audiences`}>
              <Users className="mr-2 h-3.5 w-3.5" />
              Públicos
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncAdvanced}
            disabled={syncing}
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sync avançado"}
          </Button>
        </div>
      </div>

      {/* Fatigue summary */}
      {fatigueCount > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          {severeCount > 0 && (
            <Badge variant="destructive">{severeCount} fadiga severa</Badge>
          )}
          {fatigueCount - severeCount > 0 && (
            <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-300 hover:bg-yellow-100">
              {fatigueCount - severeCount} atenção
            </Badge>
          )}
          <span className="text-xs text-amber-700 dark:text-amber-400">
            {fatigueCount} criativo{fatigueCount !== 1 ? "s" : ""} com sinais de fadiga
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar criativo..."
            value={search}
            onChange={e => updateParam("search", e.target.value)}
            className="pl-8 text-sm h-9"
          />
        </div>

        {/* Period */}
        <Select value={String(period)} onValueChange={v => updateParam("period", v)}>
          <SelectTrigger className="w-32 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map(p => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select
          value={sortKey}
          onValueChange={v => updateParam("sort", v)}
        >
          <SelectTrigger className="w-44 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(o => (
              <SelectItem key={`${o.field}:${o.dir}`} value={`${o.field}:${o.dir}`}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Fatigue toggle */}
        <div className="flex items-center gap-2">
          <Switch
            id="fatigue-filter"
            checked={fatigueOnly}
            onCheckedChange={v => updateParam("fatigue", v ? "true" : "")}
          />
          <Label htmlFor="fatigue-filter" className="text-sm cursor-pointer whitespace-nowrap">
            Só com fadiga
          </Label>
        </div>

        <span className="text-xs text-muted-foreground ml-auto">
          {creatives.length} criativo{creatives.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Gallery grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-[4/3] w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : creatives.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="font-medium text-muted-foreground">Nenhum criativo encontrado</p>
          <p className="text-sm text-muted-foreground mt-1">
            Sincronize os dados ou ajuste os filtros
          </p>
          <Button className="mt-4" variant="outline" onClick={handleSyncAdvanced} disabled={syncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {creatives.map(creative => (
            <CreativeCard
              key={creative.id}
              creative={creative}
              onClick={() => setSelected(creative)}
            />
          ))}
        </div>
      )}

      {/* Detail drawer */}
      <CreativeDrawer
        creative={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
