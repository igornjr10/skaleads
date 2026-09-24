import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MarketProLogo } from "@/components/MarketProLogo";

interface DashboardData {
  client: { name: string; logoUrl: string | null; businessSegment: string | null };
  summary: {
    spend: number; clicks: number; impressions: number; ctr: number; cpm: number; cpc: number;
    messages: number; calls: number; directions: number; leads: number;
  };
  balance: number | null;
  dailySeries: { date: string; spend: number; clicks: number; impressions: number }[];
  campaigns: { key: number; adsCount: number; name: string; status: string; spend: number; impressions: number; clicks: number; ctr: number; messages: number }[];
  ads: { campaignKey: number | null; name: string; status: string; spend: number; impressions: number; clicks: number; ctr: number; messages: number; thumbnailUrl: string | null }[];
  lastSyncAt: string | null;
}

// Mesmo vocabulario do relatorio que vai no WhatsApp: o cliente le a mesma
// palavra nos dois lugares.
const RESULT_LABELS = {
  messages: "Conversas iniciadas",
  calls: "Ligações",
  directions: "Rotas traçadas",
  leads: "Cadastros",
} as const;

const RESULT_UNIT = {
  messages: "conversa",
  calls: "ligação",
  directions: "rota",
  leads: "cadastro",
} as const;

type ResultKey = keyof typeof RESULT_LABELS;

// O que o cliente chama de resultado depende do objetivo da campanha, e
// campanha de mensagem nunca preenche `conversions` na Meta. Em vez de escolher
// uma metrica e arriscar mostrar zero, mostramos as que de fato aconteceram.
function resultsOf(summary: DashboardData["summary"]) {
  return (Object.keys(RESULT_LABELS) as ResultKey[])
    .map((key) => ({ key, label: RESULT_LABELS[key], value: summary[key] ?? 0 }))
    .filter((item) => item.value > 0);
}

function fmtCurrency(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(value: number) {
  return value.toLocaleString("pt-BR");
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 text-center">
        <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 text-xs text-muted-foreground">
        {label ? format(new Date(label), "dd MMM", { locale: ptBR }) : ""}
      </p>
      <p className="font-semibold">{fmtCurrency(payload[0].value)}</p>
    </div>
  );
}

export default function ClientDashboardShare() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [showAllAds, setShowAllAds] = useState(false);

  useEffect(() => {
    if (token) fetchData();
  }, [token]);

  async function fetchData() {
    const { data: result, error } = await supabase.functions.invoke("get-client-dashboard", { body: { token } });
    if (error || !result || result.error) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setData(result as DashboardData);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 p-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <Skeleton className="h-16 w-2/3" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[1, 2, 3, 4, 5].map((item) => (
              <Skeleton key={item} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="space-y-3 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
          <h1 className="text-xl font-bold">Dashboard não encontrado</h1>
          <p className="text-sm text-muted-foreground">Este link pode estar incorreto.</p>
        </div>
      </div>
    );
  }

  const { client, summary, campaigns, ads, dailySeries, balance, lastSyncAt } = data;
  const results = resultsOf(summary);
  const mainResult = results[0] ?? null;

  // A quebra por anuncio so existe depois que o sync grava `messages` por
  // entidade. Enquanto nao houver nenhum, a coluna fica fora: coluna inteira de
  // "—" ao lado de um total de conversas la em cima parece defeito.
  const adsHaveMessages = ads?.some((ad) => (ad.messages ?? 0) > 0);
  const campaignsHaveMessages = campaigns.some((campaign) => (campaign.messages ?? 0) > 0);

  const selected = selectedCampaign === null
    ? null
    : campaigns.find((campaign) => campaign.key === selectedCampaign) ?? null;

  const filteredAds = selected
    ? (ads ?? []).filter((ad) => ad.campaignKey === selected.key)
    : (ads ?? []);

  // Conta media passa de 40 anuncios. Despejar todos de uma vez num link que o
  // cliente abre no celular enterra o resto da pagina, entao mostramos os mais
  // caros e deixamos o resto a um clique.
  const ADS_PREVIEW = 8;
  const visibleAds = showAllAds ? filteredAds : filteredAds.slice(0, ADS_PREVIEW);
  const hiddenAdsCount = filteredAds.length - visibleAds.length;

  function toggleCampaign(key: number) {
    const abrindo = selectedCampaign !== key;
    setSelectedCampaign(abrindo ? key : null);
    setShowAllAds(false);
    // No celular a tabela de anuncios fica abaixo da dobra: sem isto o toque na
    // campanha parece nao ter feito nada.
    if (abrindo) {
      requestAnimationFrame(() => {
        document.getElementById("anuncios")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-background px-4 py-6 md:px-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-4">
            {client.logoUrl && (
              <img src={client.logoUrl} alt={client.name} className="h-14 w-14 rounded-full border object-cover" />
            )}
            <div>
              <h1 className="text-2xl font-bold">{client.name}</h1>
              <p className="text-sm text-muted-foreground">Desempenho das campanhas — últimos 30 dias</p>
            </div>
          </div>
          <div className="hidden opacity-60 md:block">
            <MarketProLogo size={28} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8">
        {mainResult && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-wrap items-end justify-between gap-4 pt-5 pb-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{mainResult.label}</p>
                <p className="text-3xl font-bold">{fmtNum(mainResult.value)}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtCurrency(summary.spend / mainResult.value)} por {RESULT_UNIT[mainResult.key]} · últimos 30 dias
                </p>
              </div>
              {results.length > 1 && (
                <div className="flex flex-wrap gap-5">
                  {results.slice(1).map((item) => (
                    <div key={item.key}>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                      <p className="text-xl font-semibold">{fmtNum(item.value)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <KpiCard label="Investido" value={fmtCurrency(summary.spend)} />
          <KpiCard label="Impressões" value={fmtNum(summary.impressions)} />
          <KpiCard label="Cliques" value={fmtNum(summary.clicks)} />
          <KpiCard label="CTR" value={`${summary.ctr.toFixed(2)}%`} />
          <KpiCard label="CPC" value={fmtCurrency(summary.cpc)} />
        </section>

        {balance !== null && (
          <Card>
            <CardContent className="flex items-center justify-between pt-5 pb-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Saldo na conta de anuncios</p>
                <p className="text-lg font-semibold">{fmtCurrency(balance)}</p>
              </div>
              <Badge variant={balance < 50 ? "destructive" : "default"} className="text-sm">
                {balance < 50 ? "saldo baixo" : "disponivel"}
              </Badge>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Investimento diário</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySeries} margin={{ left: 4, right: 12, top: 8 }}>
                <defs>
                  <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(24 95% 55%)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(24 95% 55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickFormatter={(value) => format(new Date(value), "dd/MM")}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} width={40} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="spend" stroke="hsl(24 95% 55%)" strokeWidth={2} fill="url(#spendFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {campaigns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campanhas ativas</CardTitle>
              <p className="text-xs text-muted-foreground">Toque em uma campanha para ver os anúncios dela.</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-left font-medium">Campanha</th>
                      <th className="p-3 text-right font-medium">Investimento</th>
                      {campaignsHaveMessages && <th className="p-3 text-right font-medium">Conversas</th>}
                      <th className="p-3 text-right font-medium">CTR</th>
                      <th className="p-3 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((campaign, index) => (
                      <tr
                        key={index}
                        onClick={() => campaign.adsCount > 0 && toggleCampaign(campaign.key)}
                        aria-selected={selected?.key === campaign.key}
                        className={[
                          campaign.adsCount > 0 ? "cursor-pointer hover:bg-primary/10" : "",
                          selected?.key === campaign.key ? "bg-primary/10" : index % 2 === 1 ? "bg-muted/20" : "",
                        ].join(" ")}
                      >
                        <td className="max-w-[240px] p-3">
                          <span className="block truncate">{campaign.name}</span>
                          {campaign.adsCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {selected?.key === campaign.key
                                ? "mostrando os anúncios · toque para limpar"
                                : `${campaign.adsCount} ${campaign.adsCount === 1 ? "anúncio" : "anúncios"}`}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">{fmtCurrency(campaign.spend)}</td>
                        {campaignsHaveMessages && (
                          <td className="p-3 text-right font-medium">{fmtNum(campaign.messages ?? 0)}</td>
                        )}
                        <td className="p-3 text-right">{campaign.ctr.toFixed(2)}%</td>
                        <td className="p-3 text-right">
                          <Badge variant={campaign.status === "ACTIVE" ? "default" : "secondary"}>
                            {campaign.status === "ACTIVE" ? "Ativa" : campaign.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {ads?.length > 0 && (
          <Card id="anuncios">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-base">
                  {selected ? `Anúncios de ${selected.name}` : "Anúncios"}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {filteredAds.length} {filteredAds.length === 1 ? "anúncio no ar" : "anúncios no ar"}
                  {!selected && campaigns.length > 1 && " · todas as campanhas"}
                </p>
              </div>
              {selected && (
                <button
                  type="button"
                  onClick={() => { setSelectedCampaign(null); setShowAllAds(false); }}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  Ver todas as campanhas
                </button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-left font-medium">Anúncio</th>
                      <th className="p-3 text-right font-medium">Investimento</th>
                      {adsHaveMessages && <th className="p-3 text-right font-medium">Conversas</th>}
                      <th className="p-3 text-right font-medium">Cliques</th>
                      <th className="p-3 text-right font-medium">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAds.map((ad, index) => (
                      <tr key={index} className={index % 2 === 1 ? "bg-muted/20" : ""}>
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            {ad.thumbnailUrl && (
                              <img
                                src={ad.thumbnailUrl}
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="h-10 w-10 shrink-0 rounded-md border object-cover"
                              />
                            )}
                            <span className="max-w-[220px] truncate">{ad.name}</span>
                          </div>
                        </td>
                        <td className="p-3 text-right">{fmtCurrency(ad.spend)}</td>
                        {adsHaveMessages && (
                          <td className="p-3 text-right">
                            <span className="font-medium">{fmtNum(ad.messages ?? 0)}</span>
                            {(ad.messages ?? 0) > 0 && (
                              <span className="block text-xs text-muted-foreground">
                                {fmtCurrency(ad.spend / ad.messages)} cada
                              </span>
                            )}
                          </td>
                        )}
                        <td className="p-3 text-right">{fmtNum(ad.clicks)}</td>
                        <td className="p-3 text-right">{ad.ctr.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hiddenAdsCount > 0 && (
                <div className="border-t p-3 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAllAds(true)}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Ver todos os {filteredAds.length} anúncios
                  </button>
                </div>
              )}
              {showAllAds && filteredAds.length > ADS_PREVIEW && (
                <div className="border-t p-3 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAllAds(false)}
                    className="text-sm font-medium text-muted-foreground hover:underline"
                  >
                    Mostrar menos
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          {lastSyncAt
            ? `Atualizado em ${format(new Date(lastSyncAt), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}`
            : "Aguardando primeira sincronização"}
        </p>
      </div>
    </div>
  );
}
