import { useState } from "react";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FileText, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pdf } from "@react-pdf/renderer";
import { ReportPdfTemplate, type ReportData } from "./ReportPdfTemplate";

interface ReportGeneratorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  onReportCreated?: () => void;
}

const PERIOD_PRESETS = [
  { label: "Ultimos 7 dias", days: 7 },
  { label: "Ultimos 30 dias", days: 30 },
  { label: "Ultimos 90 dias", days: 90 },
  { label: "Este mes", days: 0 },
];

export function ReportGeneratorDialog({
  isOpen,
  onClose,
  clientId,
  clientName,
  onReportCreated,
}: ReportGeneratorDialogProps) {
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState("30");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [recommendations, setRecommendations] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [agencyName, setAgencyName] = useState("MarketProAds");

  function applyPreset(value: string) {
    setPreset(value);
    const days = parseInt(value);
    if (days === 0) {
      setStartDate(format(startOfMonth(new Date()), "yyyy-MM-dd"));
      setEndDate(format(endOfMonth(new Date()), "yyyy-MM-dd"));
    } else {
      setStartDate(format(subDays(new Date(), days), "yyyy-MM-dd"));
      setEndDate(format(new Date(), "yyyy-MM-dd"));
    }
  }

  async function buildReportData(): Promise<ReportData> {
    const { data: clientRaw, error: clientError } = await supabase
      .from("clients")
      .select("name, meta_ad_account_id")
      .eq("id", clientId)
      .single();

    if (clientError) throw clientError;

    const { data: metricsRaw, error: metricsError } = await supabase
      .from("campaign_daily_metrics")
      .select("spend, impressions, clicks")
      .eq("client_id", clientId)
      .gte("date", startDate)
      .lte("date", endDate);

    if (metricsError) throw metricsError;

    const { data: campaignsRaw, error: campaignsError } = await supabase
      .from("campaigns")
      .select("name, status, spend, conversions")
      .eq("client_id", clientId);

    if (campaignsError) throw campaignsError;

    const { data: adsRaw, error: adsError } = await supabase
      .from("ads")
      .select("name, spend, impressions, clicks, status, ad_sets(campaigns(client_id))");

    if (adsError) throw adsError;

    const metrics = metricsRaw || [];
    const campaigns = campaignsRaw || [];
    const ads = (adsRaw || []).filter((ad: any) => ad.ad_sets?.campaigns?.client_id === clientId);

    const summary = metrics.reduce(
      (acc: any, item: any) => ({
        spend: acc.spend + (item.spend || 0),
        revenue: 0,
        impressions: acc.impressions + (item.impressions || 0),
        clicks: acc.clicks + (item.clicks || 0),
        conversions: acc.conversions,
      }),
      { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 }
    );

    summary.conversions = campaigns.reduce((total: number, campaign: any) => total + (campaign.conversions || 0), 0);
    summary.roas = summary.spend > 0 ? summary.revenue / summary.spend : 0;
    summary.ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions) * 100 : 0;
    summary.cpc = summary.clicks > 0 ? summary.spend / summary.clicks : 0;
    summary.cpm = summary.impressions > 0 ? (summary.spend / summary.impressions) * 1000 : 0;

    const topCampaigns = campaigns
      .map((campaign: any) => ({
        name: campaign.name,
        status: campaign.status,
        spend: campaign.spend || 0,
        conversions: campaign.conversions || 0,
        revenue: 0,
        roas: 0,
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10);

    const topAds = ads
      .map((ad: any) => ({
        name: ad.name,
        spend: ad.spend || 0,
        impressions: ad.impressions || 0,
        clicks: ad.clicks || 0,
        status: ad.status || "ACTIVE",
        ctr: ad.impressions > 0 ? ((ad.clicks || 0) / ad.impressions) * 100 : 0,
        cpc: ad.clicks > 0 ? (ad.spend || 0) / ad.clicks : 0,
        cpm: ad.impressions > 0 ? ((ad.spend || 0) / ad.impressions) * 1000 : 0,
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 12);

    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const periodLabel = `${format(start, "dd MMM yyyy", { locale: ptBR })} ate ${format(end, "dd MMM yyyy", { locale: ptBR })}`;

    return {
      generatedAt: format(new Date(), "dd/MM/yyyy 'as' HH:mm"),
      client: {
        name: clientRaw.name || clientName,
        adAccountLabel: clientRaw.meta_ad_account_id ? `CA - ${clientRaw.meta_ad_account_id}` : "Conta Meta conectada",
      },
      period: { start: startDate, end: endDate, label: periodLabel },
      summary,
      topCampaigns,
      topAds,
      recommendations: recommendations || "Nenhuma recomendacao registrada para este periodo.",
      branding: { primaryColor, agencyName },
    };
  }

  async function handleGenerate(download: boolean) {
    setLoading(true);
    try {
      const data = await buildReportData();

      const { data: session } = await supabase.auth.getSession();
      const tenantId = session.session?.user.id;
      if (!tenantId) throw new Error("Nao autenticado");

      const periodLabel = data.period.label;
      const reportName = `${clientName} - ${periodLabel}`;

      let fileUrl: string | null = null;

      if (download) {
        const blob = await pdf(<ReportPdfTemplate data={data} />).toBlob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `relatorio-${clientName.toLowerCase().replace(/\s+/g, "-")}-${startDate}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      }

      const shareToken = crypto.randomUUID();

      const { error } = await supabase.from("reports").insert({
        tenant_id: tenantId,
        client_id: clientId,
        name: reportName,
        period: { start: startDate, end: endDate, label: periodLabel },
        data,
        status: "ready",
        file_url: fileUrl,
        share_token: shareToken,
      });

      if (error) throw error;

      toast.success("Relatorio gerado com sucesso!");
      onReportCreated?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao gerar relatorio");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Gerar Relatorio - {clientName}
          </DialogTitle>
          <DialogDescription>Configure o periodo e personalize o relatorio</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Periodo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={preset} onValueChange={applyPreset}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Selecione o periodo" />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_PRESETS.map((item) => (
                    <SelectItem key={item.days} value={String(item.days)}>
                      {item.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Inicio</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(event) => {
                      setStartDate(event.target.value);
                      setPreset("custom");
                    }}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fim</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(event) => {
                      setEndDate(event.target.value);
                      setPreset("custom");
                    }}
                    className="text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Branding</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Nome da agencia</Label>
                <Input
                  value={agencyName}
                  onChange={(event) => setAgencyName(event.target.value)}
                  placeholder="MarketProAds"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cor principal</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(event) => setPrimaryColor(event.target.value)}
                    className="h-9 w-14 cursor-pointer rounded border"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(event) => setPrimaryColor(event.target.value)}
                    placeholder="#2563eb"
                    className="text-sm font-mono"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-1">
            <Label className="text-xs">Analise e recomendacoes</Label>
            <Textarea
              value={recommendations}
              onChange={(event) => setRecommendations(event.target.value)}
              placeholder="Descreva a leitura do periodo, destaques e proximos passos..."
              className="text-sm min-h-[100px]"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={() => handleGenerate(false)} disabled={loading} className="flex-1" variant="outline">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
            <Button onClick={() => handleGenerate(true)} disabled={loading} className="flex-1">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Salvar e baixar PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
