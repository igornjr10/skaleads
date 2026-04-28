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
  { label: "Últimos 7 dias", days: 7 },
  { label: "Últimos 30 dias", days: 30 },
  { label: "Últimos 90 dias", days: 90 },
  { label: "Este mês", days: 0 },
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
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
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
    const { data: metricsRaw } = await supabase
      .from("campaign_daily_metrics")
      .select("spend, revenue, impressions, clicks, conversions, campaigns(name, status, client_id)")
      .gte("date", startDate)
      .lte("date", endDate);

    const metrics = (metricsRaw || []).filter(
      (m: any) => m.campaigns?.client_id === clientId
    );

    const summary = metrics.reduce(
      (acc: any, m: any) => ({
        spend: acc.spend + (m.spend || 0),
        revenue: acc.revenue + (m.revenue || 0),
        impressions: acc.impressions + (m.impressions || 0),
        clicks: acc.clicks + (m.clicks || 0),
        conversions: acc.conversions + (m.conversions || 0),
      }),
      { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 }
    );

    summary.roas = summary.spend > 0 ? summary.revenue / summary.spend : 0;
    summary.ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions) * 100 : 0;

    // Aggregate per campaign
    const campaignMap = new Map<string, any>();
    for (const m of metrics as any[]) {
      const name = m.campaigns?.name || "Desconhecida";
      const status = m.campaigns?.status || "—";
      if (!campaignMap.has(name)) {
        campaignMap.set(name, { name, status, spend: 0, revenue: 0, conversions: 0 });
      }
      const c = campaignMap.get(name)!;
      c.spend += m.spend || 0;
      c.revenue += m.revenue || 0;
      c.conversions += m.conversions || 0;
    }
    const topCampaigns = Array.from(campaignMap.values())
      .map(c => ({ ...c, roas: c.spend > 0 ? c.revenue / c.spend : 0 }))
      .sort((a, b) => b.roas - a.roas)
      .slice(0, 10);

    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const periodLabel = `${format(start, "dd MMM yyyy", { locale: ptBR })} – ${format(end, "dd MMM yyyy", { locale: ptBR })}`;

    return {
      generatedAt: format(new Date(), "dd/MM/yyyy 'às' HH:mm"),
      client: { name: clientName },
      period: { start: startDate, end: endDate, label: periodLabel },
      summary,
      topCampaigns,
      recommendations: recommendations || "Nenhuma recomendação registrada para este período.",
      branding: { primaryColor, agencyName },
    };
  }

  async function handleGenerate(download: boolean) {
    setLoading(true);
    try {
      const data = await buildReportData();

      const { data: session } = await supabase.auth.getSession();
      const tenantId = session.session?.user.id;
      if (!tenantId) throw new Error("Não autenticado");

      const periodLabel = data.period.label;
      const reportName = `${clientName} — ${periodLabel}`;

      let fileUrl: string | null = null;

      if (download) {
        const blob = await pdf(<ReportPdfTemplate data={data} />).toBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `relatorio-${clientName.toLowerCase().replace(/\s+/g, "-")}-${startDate}.pdf`;
        a.click();
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

      toast.success("Relatório gerado com sucesso!");
      onReportCreated?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar relatório");
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
            Gerar Relatório — {clientName}
          </DialogTitle>
          <DialogDescription>Configure o período e personalize o relatório</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Period */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Período</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={preset} onValueChange={applyPreset}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Selecione o período" />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_PRESETS.map(p => (
                    <SelectItem key={p.days} value={String(p.days)}>
                      {p.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Início</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={e => { setStartDate(e.target.value); setPreset("custom"); }}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fim</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={e => { setEndDate(e.target.value); setPreset("custom"); }}
                    className="text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Branding */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Branding</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Nome da agência</Label>
                <Input
                  value={agencyName}
                  onChange={e => setAgencyName(e.target.value)}
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
                    onChange={e => setPrimaryColor(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded border"
                  />
                  <Input
                    value={primaryColor}
                    onChange={e => setPrimaryColor(e.target.value)}
                    placeholder="#6366f1"
                    className="text-sm font-mono"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          <div className="space-y-1">
            <Label className="text-xs">Recomendações para o cliente</Label>
            <Textarea
              value={recommendations}
              onChange={e => setRecommendations(e.target.value)}
              placeholder="Descreva as principais recomendações e próximos passos para o cliente..."
              className="text-sm min-h-[100px]"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={() => handleGenerate(false)}
              disabled={loading}
              className="flex-1"
              variant="outline"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
            <Button
              onClick={() => handleGenerate(true)}
              disabled={loading}
              className="flex-1"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Salvar & Baixar PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
