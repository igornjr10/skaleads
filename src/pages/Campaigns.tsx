import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mockCampaigns, mockClients } from "@/lib/mockData";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";

// Mock ad sets / ads (gerados a partir das campanhas)
function buildAdSets(campaignId: string) {
  const seed = campaignId.charCodeAt(1);
  const count = 2 + (seed % 2);
  return Array.from({ length: count }).map((_, i) => ({
    id: `${campaignId}-as${i}`,
    name: ["Público lookalike 1%", "Interesses + Comportamentos", "Remarketing 30d", "Broad targeting"][i % 4],
    status: i === 1 && seed % 3 === 0 ? "PAUSED" : "ACTIVE",
    spend: Math.round((seed * 137 + i * 280) % 5000) + 200,
    impressions: Math.round((seed * 4521 + i * 12000) % 200000) + 5000,
    clicks: Math.round((seed * 89 + i * 320) % 8000) + 100,
    ads: Array.from({ length: 2 + (i % 2) }).map((_, j) => ({
      id: `${campaignId}-as${i}-ad${j}`,
      name: `Criativo ${["Vídeo 15s", "Carrossel 4 cards", "Imagem estática", "Reels"][j % 4]}`,
      status: "ACTIVE" as const,
      spend: Math.round((seed * 41 + j * 130) % 1500) + 80,
      impressions: Math.round((seed * 1521 + j * 4200) % 70000) + 2000,
      clicks: Math.round((seed * 27 + j * 110) % 3000) + 40,
    })),
  }));
}

export default function Campaigns() {
  const [client, setClient] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const campaigns = useMemo(
    () => (client === "all" ? mockCampaigns : mockCampaigns.filter((c) => c.client_id === client)),
    [client]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campanhas</h1>
          <p className="text-sm text-muted-foreground">Veja campanhas, conjuntos de anúncios e anúncios individuais</p>
        </div>
        <div className="flex gap-2">
          <Select value={client} onValueChange={setClient}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {mockClients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => toast.info("Sincronização Meta API em breve")}>
            <RefreshCw className="mr-2 h-4 w-4" /> Sincronizar
          </Button>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Lista de campanhas</CardTitle>
          <CardDescription>Clique em uma campanha para ver conjuntos e anúncios</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
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
                const adSets = buildAdSets(c.id);
                return (
                  <Collapsible key={c.id} open={isOpen} asChild>
                    <>
                      <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setOpenId(isOpen ? null : c.id)}>
                        <TableCell>
                          <CollapsibleTrigger asChild>
                            <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                          </CollapsibleTrigger>
                        </TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell><StatusBadge status={c.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.objective}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(c.spend)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(c.clicks)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(c.ctr)}</TableCell>
                      </TableRow>
                      <CollapsibleContent asChild>
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/20 p-0">
                            <div className="space-y-4 p-4">
                              {adSets.map((as) => (
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
                                    {as.ads.map((ad) => (
                                      <div key={ad.id} className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 p-2 text-sm">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-muted-foreground">Anúncio</span>
                                          <span>{ad.name}</span>
                                          <StatusBadge status={ad.status} />
                                        </div>
                                        <span className="text-xs tabular-nums text-muted-foreground">{formatCurrency(ad.spend)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
