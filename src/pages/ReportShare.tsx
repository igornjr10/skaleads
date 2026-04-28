import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { pdf } from "@react-pdf/renderer";
import { ReportPdfTemplate, type ReportData } from "@/components/reports/ReportPdfTemplate";

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
      <CardContent className="pt-4 pb-4 text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function fmtCurrency(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNum(v: number) {
  return v.toLocaleString("pt-BR");
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

    setReport(data as any);
    setLoading(false);

    // Increment view count silently
    supabase.rpc("increment_report_views", { p_share_token: token! }).then(() => {});
  }

  async function handleDownload() {
    if (!report?.data) return;
    setDownloading(true);
    try {
      const blob = await pdf(<ReportPdfTemplate data={report.data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.name}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="w-full max-w-2xl space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-6 w-1/3" />
          <div className="grid grid-cols-2 gap-3 mt-6">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
          <h1 className="text-xl font-bold">Relatório não encontrado</h1>
          <p className="text-muted-foreground text-sm">Este link pode ter expirado ou não existir.</p>
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
      {/* Header bar */}
      <div style={{ backgroundColor: primaryColor }} className="py-6 px-8 text-white">
        <p className="text-sm opacity-75 mb-1">{agencyName}</p>
        <h1 className="text-2xl font-bold">{data?.client?.name}</h1>
        <p className="text-sm opacity-85 mt-1">Relatório de Performance — Meta Ads</p>
        {data?.period?.label && (
          <p className="text-xs opacity-70 mt-1">{data.period.label}</p>
        )}
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Download button */}
        <div className="flex justify-end">
          <Button onClick={handleDownload} disabled={downloading} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            {downloading ? "Gerando PDF..." : "Baixar PDF"}
          </Button>
        </div>

        {/* KPIs */}
        {data?.summary && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Resumo Executivo</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Investimento" value={fmtCurrency(data.summary.spend)} />
              <KpiCard label="Receita" value={fmtCurrency(data.summary.revenue)} />
              <KpiCard label="ROAS" value={`${data.summary.roas.toFixed(2)}x`} />
              <KpiCard label="Conversões" value={fmtNum(data.summary.conversions)} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Impressões" value={fmtNum(data.summary.impressions)} />
              <KpiCard label="Cliques" value={fmtNum(data.summary.clicks)} />
              <KpiCard label="CTR" value={`${data.summary.ctr.toFixed(2)}%`} />
              <KpiCard
                label="CPA"
                value={data.summary.conversions > 0 ? fmtCurrency(data.summary.spend / data.summary.conversions) : "—"}
              />
            </div>
          </section>
        )}

        {/* Top campaigns */}
        {data?.topCampaigns && data.topCampaigns.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Top Campanhas</h2>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Campanha</th>
                        <th className="text-right p-3 font-medium">Investimento</th>
                        <th className="text-right p-3 font-medium">ROAS</th>
                        <th className="text-right p-3 font-medium">Conversões</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topCampaigns.map((c, i) => (
                        <tr key={i} className={i % 2 === 1 ? "bg-muted/20" : ""}>
                          <td className="p-3 max-w-[200px] truncate">{c.name}</td>
                          <td className="p-3 text-right">{fmtCurrency(c.spend)}</td>
                          <td className="p-3 text-right">{c.roas.toFixed(2)}x</td>
                          <td className="p-3 text-right">{fmtNum(c.conversions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Recommendations */}
        {data?.recommendations && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Recomendações</h2>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  {data.recommendations}
                </p>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          {agencyName} — Relatório gerado em {generatedAt}
        </p>
      </div>
    </div>
  );
}
