import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ReportData } from "@/lib/report-types";
import { buildReportPdfBlob, downloadBlob } from "@/lib/report-pdf";

interface SharedReport {
  id: string;
  name: string;
  data: ReportData;
  period: { start: string; end: string; label: string };
  share_token: string;
  view_count: number;
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pb-4 pt-4 text-center">
        <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function fmtCurrency(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(value: number) {
  return value.toLocaleString("pt-BR");
}

export default function ReportShare() {
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<SharedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (token) fetchReport();
  }, [token]);

  async function fetchReport() {
    const { data, error } = await supabase
      .from("reports")
      .select("id, name, data, period, share_token, view_count")
      .eq("share_token", token!)
      .single();

    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setReport(data as SharedReport);
    setLoading(false);

    supabase.rpc("increment_report_views", { p_share_token: token! }).then(() => {});
  }

  async function handleDownload() {
    if (!report?.data) return;

    setDownloading(true);
    try {
      const blob = await buildReportPdfBlob(report.data);
      downloadBlob(blob, `${report.name}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="w-full max-w-2xl space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-6 w-1/3" />
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className="h-20" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="space-y-3 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
          <h1 className="text-xl font-bold">Relatorio nao encontrado</h1>
          <p className="text-sm text-muted-foreground">Este link pode ter expirado ou nao existir.</p>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const { data } = report;
  const generatedAt = data?.generatedAt;
  const primaryColor = data?.branding?.primaryColor || "#6366f1";
  const agencyName = data?.branding?.agencyName || "MarketProAds";

  return (
    <div className="min-h-screen bg-muted/30">
      <div style={{ backgroundColor: primaryColor }} className="px-8 py-6 text-white">
        <p className="mb-1 text-sm opacity-75">{agencyName}</p>
        <h1 className="text-2xl font-bold">{data?.client?.name}</h1>
        <p className="mt-1 text-sm opacity-85">Relatorio de Performance - Meta Ads</p>
        {data?.period?.label && <p className="mt-1 text-xs opacity-70">{data.period.label}</p>}
      </div>

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        <div className="flex justify-end">
          <Button onClick={handleDownload} disabled={downloading} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            {downloading ? "Gerando PDF..." : "Baixar PDF"}
          </Button>
        </div>

        {data?.summary && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Resumo Executivo</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Investimento" value={fmtCurrency(data.summary.spend)} />
              <KpiCard label="Receita" value={fmtCurrency(data.summary.revenue)} />
              <KpiCard label="ROAS" value={`${data.summary.roas.toFixed(2)}x`} />
              <KpiCard label="Conversoes" value={fmtNum(data.summary.conversions)} />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <KpiCard label="Impressoes" value={fmtNum(data.summary.impressions)} />
              <KpiCard label="Cliques" value={fmtNum(data.summary.clicks)} />
              <KpiCard label="Mensagens iniciadas" value={fmtNum(data.summary.messagesStarted || 0)} />
              <KpiCard label="CTR" value={`${data.summary.ctr.toFixed(2)}%`} />
              <KpiCard
                label="CPA"
                value={data.summary.conversions > 0 ? fmtCurrency(data.summary.spend / data.summary.conversions) : "-"}
              />
            </div>
          </section>
        )}

        {data?.topCampaigns && data.topCampaigns.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Top Campanhas</h2>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-left font-medium">Campanha</th>
                        <th className="p-3 text-right font-medium">Investimento</th>
                        <th className="p-3 text-right font-medium">ROAS</th>
                        <th className="p-3 text-right font-medium">Conversoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topCampaigns.map((campaign, index) => (
                        <tr key={index} className={index % 2 === 1 ? "bg-muted/20" : ""}>
                          <td className="max-w-[200px] truncate p-3">{campaign.name}</td>
                          <td className="p-3 text-right">{fmtCurrency(campaign.spend)}</td>
                          <td className="p-3 text-right">{campaign.roas.toFixed(2)}x</td>
                          <td className="p-3 text-right">{fmtNum(campaign.conversions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {data?.recommendations && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Recomendacoes</h2>
            <Card>
              <CardContent className="pt-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{data.recommendations}</p>
              </CardContent>
            </Card>
          </section>
        )}

        <p className="text-center text-xs text-muted-foreground">
          {agencyName} - Relatorio gerado em {generatedAt}
        </p>
      </div>
    </div>
  );
}
