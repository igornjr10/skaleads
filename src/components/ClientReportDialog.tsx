import { useEffect, useState } from "react";
import { MessageSquare, Send, Eye, EyeOff, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Period = "1d" | "7d" | "14d" | "30d";
type MetricKey = "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "cpm" | "cpa" | "roas" | "conversions";

interface ReportTemplate {
  period: Period;
  metrics: MetricKey[];
  include_campaigns: boolean;
  include_audit: boolean;
  intro: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  client: {
    id: string;
    name: string;
    whatsapp_number?: string | null;
    whatsapp_group_jid?: string | null;
    report_template?: ReportTemplate | null;
  };
}

const ALL_METRICS: { key: MetricKey; label: string }[] = [
  { key: "spend", label: "Investimento" },
  { key: "impressions", label: "Impressões" },
  { key: "clicks", label: "Cliques" },
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC" },
  { key: "cpm", label: "CPM" },
  { key: "cpa", label: "CPA" },
  { key: "roas", label: "ROAS" },
  { key: "conversions", label: "Conversões" },
];

const DEFAULT_TEMPLATE: ReportTemplate = {
  period: "7d",
  metrics: ["spend", "impressions", "clicks", "ctr", "cpc"],
  include_campaigns: true,
  include_audit: false,
  intro: "",
};

const PERIOD_OPTIONS = [
  { value: "1d", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "14d", label: "Últimos 14 dias" },
  { value: "30d", label: "Últimos 30 dias" },
];

export default function ClientReportDialog({ open, onClose, client }: Props) {
  const saved = (client.report_template as ReportTemplate | null) ?? DEFAULT_TEMPLATE;

  const [period, setPeriod] = useState<Period>(saved.period);
  const [metrics, setMetrics] = useState<MetricKey[]>(saved.metrics);
  const [includeCampaigns, setIncludeCampaigns] = useState(saved.include_campaigns);
  const [includeAudit, setIncludeAudit] = useState(saved.include_audit);
  const [intro, setIntro] = useState(saved.intro ?? "");
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Reset ao abrir com dados do cliente
  useEffect(() => {
    if (open) {
      const t = (client.report_template as ReportTemplate | null) ?? DEFAULT_TEMPLATE;
      setPeriod(t.period);
      setMetrics(t.metrics);
      setIncludeCampaigns(t.include_campaigns);
      setIncludeAudit(t.include_audit);
      setIntro(t.intro ?? "");
      setSaveTemplate(false);
      setShowPreview(false);
      setPreview(null);
    }
  }, [open, client]);

  function toggleMetric(key: MetricKey) {
    setMetrics(prev =>
      prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]
    );
    setPreview(null);
  }

  function buildTemplate(): Partial<ReportTemplate> {
    return { period, metrics, include_campaigns: includeCampaigns, include_audit: includeAudit, intro };
  }

  async function handleSend() {
    if (!client.whatsapp_number && !client.whatsapp_group_jid) {
      toast.error("Cadastre o número ou o grupo de WhatsApp do cliente antes de enviar");
      return;
    }
    if (metrics.length === 0) {
      toast.error("Selecione ao menos uma métrica");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-client-report", {
        body: {
          client_id: client.id,
          template: buildTemplate(),
          save_template: saveTemplate,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setPreview(data.preview ?? null);
      setShowPreview(true);
      toast.success("Relatório enviado com sucesso!");
      if (data?.pdf_sent === false) toast.warning(data?.pdf_error || "Falha ao enviar o PDF do relatório");
      if (saveTemplate) toast.info("Template salvo para este cliente");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar relatório");
    } finally {
      setSending(false);
    }
  }

  async function handlePreview() {
    if (preview) { setShowPreview(p => !p); return; }
    if (!client.whatsapp_number && !client.whatsapp_group_jid) {
      // Gera preview local sem enviar
      const lines = [
        `📊 *Relatório de Performance*`,
        `👤 *${client.name}*`,
        `📅 _Período: ${PERIOD_OPTIONS.find(p => p.value === period)?.label}_`,
        intro ? `\n${intro}` : "",
        `\n*📈 Resumo do período:*`,
        ...metrics.map(m => `${ALL_METRICS.find(x => x.key === m)?.label ?? m}: *—*`),
        includeCampaigns ? `\n*🏃 Campanhas ativas (top 5):*\n• (dados reais ao enviar)` : "",
        includeAudit ? `\n*🔍 Auditoria da conta:* 🟡 —/100` : "",
        `\n_Enviado por MarketProAds_`,
      ].filter(Boolean).join("\n");
      setPreview(lines);
      setShowPreview(true);
      return;
    }
    toast.info("Clique em Enviar para ver o preview com dados reais");
  }

  const hasNumber = !!client.whatsapp_number || !!client.whatsapp_group_jid;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-600" />
            Enviar relatório — {client.name}
          </DialogTitle>
        </DialogHeader>

        {!hasNumber && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            ⚠️ Este cliente não tem número nem grupo de WhatsApp cadastrado. Edite o cliente para adicionar.
          </div>
        )}
        {hasNumber && client.whatsapp_group_jid && (
          <p className="text-xs text-muted-foreground">Enviando para o grupo do WhatsApp deste cliente</p>
        )}

        <div className="space-y-5">
          {/* Período */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Período</Label>
            <Select value={period} onValueChange={v => { setPeriod(v as Period); setPreview(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Métricas */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Métricas</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_METRICS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => toggleMetric(key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    metrics.includes(key)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Extras */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Top 5 campanhas ativas</p>
                <p className="text-xs text-muted-foreground">Mostra nome, investimento e CTR</p>
              </div>
              <Switch checked={includeCampaigns} onCheckedChange={v => { setIncludeCampaigns(v); setPreview(null); }} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Nota de auditoria</p>
                <p className="text-xs text-muted-foreground">Inclui score da última auditoria</p>
              </div>
              <Switch checked={includeAudit} onCheckedChange={v => { setIncludeAudit(v); setPreview(null); }} />
            </div>
          </div>

          <Separator />

          {/* Intro personalizada */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Mensagem de abertura <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Textarea
              value={intro}
              onChange={e => { setIntro(e.target.value); setPreview(null); }}
              placeholder="Ex: Olá! Segue o resumo das suas campanhas desta semana."
              className="text-sm min-h-[72px] resize-none"
            />
          </div>

          {/* Preview */}
          {showPreview && preview && (
            <div className="rounded-lg bg-green-950/10 border border-green-500/20 p-3">
              <p className="text-xs font-medium text-green-600 mb-2">Preview da mensagem:</p>
              <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed">{preview}</pre>
            </div>
          )}

          <Separator />

          {/* Salvar template */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Salvar como padrão deste cliente</p>
              <p className="text-xs text-muted-foreground">Próximo envio já vem pré-configurado</p>
            </div>
            <Switch checked={saveTemplate} onCheckedChange={setSaveTemplate} />
          </div>

          {/* Ações */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={handlePreview}>
              {showPreview ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {showPreview ? "Fechar preview" : "Preview"}
            </Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              onClick={handleSend}
              disabled={sending || !hasNumber || metrics.length === 0}
            >
              {sending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Send className="mr-2 h-4 w-4" />}
              {sending ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
