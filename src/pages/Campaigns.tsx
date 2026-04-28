import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { syncClientData } from "@/lib/meta-api";
import { toast } from "sonner";

interface Ad {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
}

interface AdSet {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ads: Ad[];
}

interface Campaign {
  id: string;
  client_id: string;
  name: string;
  status: string;
  objective: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  ad_sets: AdSet[];
}

interface Client {
  id: string;
  name: string;
  meta_ad_account_id: string | null;
  meta_access_token: string | null;
}

export default function Campaigns() {
  const [clients, setClients] = useState<Client[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedClient, setSelectedClient] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name, meta_ad_account_id, meta_access_token")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => setClients((data as Client[]) ?? []));
  }, []);

  useEffect(() => {
    loadCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient]);

  async function loadCampaigns() {
    setLoading(true);
    setOpenId(null);

    let query = supabase
      .from("campaigns")
      .select("*, ad_sets(*, ads(*))")
      .order("spend", { ascending: false });

    if (selectedClient !== "all") {
      query = query.eq("client_id", selectedClient);
    }

    const { data, error } = await query;
    if (error) toast.error(error.message);
    setCampaigns((data as unknown as Campaign[]) ?? []);
    setLoading(false);
  }

  async function handleSync() {
    if (selectedClient === "all") {
      const connected = clients.filter((c) => c.meta_ad_account_id && c.meta_access_token);
      if (!connected.length) {
        toast.error("Nenhum cliente conectado ao Meta Ads. Configure em Clientes.");
        return;
      }
      setSyncing(true);
      let errors = 0;
      for (const c of connected) {
        setSyncProgress(`Sincronizando ${c.name}...`);
        try {
          await syncClientData(c.id, c.meta_ad_account_id!, c.meta_access_token!, setSyncProgress);
        } catch {
          errors++;
        }
      }
      setSyncing(false);
      setSyncProgress("");
      if (errors) toast.error(`${errors} cliente(s) falharam na sincronização`);
      else toast.success("Todos os clientes sincronizados");
      loadCampaigns();
      return;
    }

    const client = clients.find((c) => c.id === selectedClient);
    if (!client?.meta_ad_account_id || !client?.meta_access_token) {
      toast.error("Este cliente não está conectado ao Meta Ads. Configure em Clientes.");
      return;
    }

    setSyncing(true);
    try {
      const result = await syncClientData(
        client.id,
        client.meta_ad_account_id,
        client.meta_access_token,
        setSyncProgress
      );
      toast.success(
        `Sincronizado! ${result.campaigns} campanhas · ${result.adSets} conjuntos · ${result.ads} anúncios`,
        { duration: 6000 }
      );
      loadCampaigns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na sincronização");
    } finally {
      setSyncing(false);
      setSyncProgress("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campanhas</h1>
          <p className="text-sm text-muted-foreground">Veja campanhas, conjuntos de anúncios e anúncios individuais</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? syncProgress || "Sincronizando..." : "Sincronizar"}
          </Button>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Lista de campanhas</CardTitle>
          <CardDescription>Clique em uma campanha para ver conjuntos e anúncios</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : campaigns.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <p className="text-sm text-muted-foreground">Nenhuma campanha encontrada.</p>
              <p className="text-xs text-muted-foreground">
                Conecte um cliente ao Meta Ads em{" "}
                <a href="/clients" className="text-primary underline">Clientes</a>
                {" "}e clique em Sincronizar.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Objetivo</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Cliques</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => {
                  const isOpen = openId === c.id;
                  return (
                    <Collapsible key={c.id} open={isOpen} asChild>
                      <>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => setOpenId(isOpen ? null : c.id)}
                        >
                          <TableCell>
                            <CollapsibleTrigger asChild>
                              <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                            </CollapsibleTrigger>
                          </TableCell>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell><StatusBadge status={c.status} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{c.objective ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(c.spend)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(c.clicks)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatPercent(c.ctr)}</TableCell>
                        </TableRow>
                        <CollapsibleContent asChild>
                          <TableRow>
                            <TableCell colSpan={7} className="bg-muted/20 p-0">
                              {c.ad_sets?.length === 0 ? (
                                <p className="p-4 text-xs text-muted-foreground">Nenhum conjunto de anúncios encontrado.</p>
                              ) : (
                                <div className="space-y-4 p-4">
                                  {(c.ad_sets ?? []).map((as) => (
                                    <div key={as.id} className="rounded-lg border border-border bg-card p-4">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          <span className="text-xs uppercase text-muted-foreground">Conjunto</span>
                                          <span className="font-medium">{as.name}</span>
                                          <StatusBadge status={as.status} />
                                        </div>
                                        <div className="flex gap-4 text-xs text-muted-foreground tabular-nums">
                                          <span>Gasto: {formatCurrency(as.spend)}</span>
                                          <span>Impr: {formatNumber(as.impressions)}</span>
                                          <span>Cliques: {formatNumber(as.clicks)}</span>
                                        </div>
                                      </div>
                                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                                        {(as.ads ?? []).map((ad) => (
                                          <div
                                            key={ad.id}
                                            className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 p-2 text-sm"
                                          >
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs text-muted-foreground">Anúncio</span>
                                              <span>{ad.name}</span>
                                              <StatusBadge status={ad.status} />
                                            </div>
                                            <span className="text-xs tabular-nums text-muted-foreground">
                                              {formatCurrency(ad.spend)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
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
