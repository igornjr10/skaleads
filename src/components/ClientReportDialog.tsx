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
import { blobToBase64, buildReportPdfBlob } from "@/lib/report-pdf";
import { montarReportDataDoBanco, type PeriodoRapido } from "@/lib/report-quick";
import type { ReportData } from "@/lib/report-types";
import { loadLatestAudit } from "@/lib/audit/runner";
import type { AuditReport } from "@/lib/audit/types";
import { toast } from "sonner";

type Period = "1d" | "7d" | "14d" | "30d";
type MetricKey =
  | "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "cpm" | "cpa" | "roas" | "conversions"
  | "messages" | "calls" | "directions" | "leads" | "profileVisits";

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
  // O que o cliente de negocio local chama de resultado. Vem da Meta no mesmo
  // sync das outras, e ate 21/09/2026 nao aparecia em relatorio nenhum.
  { key: "messages", label: "Conversas iniciadas" },
  { key: "calls", label: "Ligações" },
  { key: "directions", label: "Rotas traçadas" },
  { key: "leads", label: "Cadastros" },
  { key: "profileVisits", label: "Visitas ao perfil (anúncios)" },
];



// Emoji por metrica: a mensagem de WhatsApp ganha leitura rapida com ele, e o
// PDF nao — por isso o rotulo com emoji mora aqui e nao no `ALL_METRICS`.
const EMOJI: Record<MetricKey, string> = {
  spend: "💰", impressions: "👁️", clicks: "🖱️", ctr: "📈", cpc: "💵", cpm: "📊",
  cpa: "🎯", roas: "📉", conversions: "✅",
  messages: "💬", calls: "📞", directions: "📍", leads: "📝", profileVisits: "👤",
};

const EMOJI_IG: Partial<Record<string, string>> = {
  followers: "👥", followersGained: "➕", followersNet: "📈", profileViews: "👤",
  reach: "📡", engagement: "❤️", contentViews: "🎬",
};

// Liga a metrica escolhida na tela ao campo do relatorio. `cpa` e `conversions`
// ficam de fora: dependem de pixel de compra e sairiam sempre zerados.
const CAMPO_NO_RESUMO: Partial<Record<MetricKey, keyof ReportData["summary"]>> = {
  spend: "spend", impressions: "impressions", clicks: "clicks", ctr: "ctr",
  cpc: "cpc", cpm: "cpm", roas: "roas",
  messages: "messagesStarted", calls: "phoneCalls", directions: "directions", leads: "leads",
  profileVisits: "instagramProfileVisits",
};

const MOEDA: MetricKey[] = ["spend", "cpc", "cpm", "cpa"];
const PERCENTUAL: MetricKey[] = ["ctr"];

function formatarMetrica(key: MetricKey, valor: number): string {
  if (MOEDA.includes(key)) return `R$ ${valor.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
  if (PERCENTUAL.includes(key)) return `${valor.toFixed(2).replace(".", ",")}%`;
  if (key === "roas") return `${valor.toFixed(2).replace(".", ",")}x`;
  return valor.toLocaleString("pt-BR");
}

/** O gerador rico trabalha em janelas de 7, 14 ou 30 dias; "hoje" vira 7 dias
 *  porque o sync grava por dia e um unico dia costuma vir vazio ou pela metade. */
function periodoRapido(period: Period): PeriodoRapido {
  return period === "1d" ? "7d" : period;
}

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

  const [previewLoading, setPreviewLoading] = useState(false);
  // Os dados que geraram o preview ficam guardados para o envio usar os MESMOS
  // numeros que apareceram na tela — e para o PDF sair do mesmo lugar.
  const [dadosPreview, setDadosPreview] = useState<ReportData | null>(null);
  const [auditPreview, setAuditPreview] = useState<AuditReport | null>(null);
  const [editado, setEditado] = useState(false);
  // Opcao mudou depois de o texto ter sido editado a mao: o que esta na caixa
  // nao corresponde mais as opcoes, e refazer apagaria a edicao. Em vez de
  // escolher sozinho, a tela para e pergunta.
  const [previewStale, setPreviewStale] = useState(false);

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
      setDadosPreview(null);
      setAuditPreview(null);
      setEditado(false);
      setPreviewStale(false);
    }
  }, [open, client]);

  function toggleMetric(key: MetricKey) {
    setMetrics(prev =>
      prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]
    );
  }

  function buildTemplate(): Partial<ReportTemplate> {
    return { period, metrics, include_campaigns: includeCampaigns, include_audit: includeAudit, intro };
  }

  // A escolha de metricas da tela vale para os dois: texto e PDF. Sem isto o
  // cliente recebe um resumo e um anexo falando de coisas diferentes.
  function aplicarPreferencias(dados: ReportData) {
    const preferidas = metrics
      .map((key) => CAMPO_NO_RESUMO[key])
      .filter((campo): campo is keyof ReportData["summary"] => Boolean(campo));
    if (preferidas.length > 0) {
      dados.metricPreferences = preferidas as NonNullable<ReportData["metricPreferences"]>;
    }
  }

  function montarMensagem(dados: ReportData, auditoria: AuditReport | null): string {
    const linhas = [
      `📊 *Relatório de Performance*`,
      `👤 *${client.name}*`,
      `📅 _Período: ${dados.period.label}_`,
    ];

    if (intro.trim()) linhas.push("", intro.trim());

    linhas.push("", "*📈 Resumo do período:*");
    for (const key of metrics) {
      const campo = CAMPO_NO_RESUMO[key];
      if (!campo) continue;
      const rotulo = ALL_METRICS.find((m) => m.key === key)?.label ?? key;
      linhas.push(`${EMOJI[key]} ${rotulo}: *${formatarMetrica(key, Number(dados.summary[campo] ?? 0))}*`);
    }

    if (includeCampaigns && dados.topCampaigns.length > 0) {
      linhas.push("", "*🏃 Campanhas ativas (top 5):*");
      for (const c of dados.topCampaigns) {
        linhas.push(`• ${c.name} — ${formatarMetrica("spend", c.spend)} | CTR ${formatarMetrica("ctr", c.ctr ?? 0)}`);
      }
    }

    // O Instagram nao e metrica de campanha: nao esta em `summary` e nao entra
    // na lista de escolha. Vem junto quando a Meta respondeu.
    const perfil = dados.socialPresence?.metrics ?? [];
    if (perfil.length > 0) {
      linhas.push("", "*📸 Instagram:*");
      for (const m of perfil) {
        if (typeof m.value !== "number") continue;
        const sinal = m.key === "followersNet" && m.value > 0 ? "+" : "";
        linhas.push(`${EMOJI_IG[m.key] ?? "•"} ${m.label}: *${sinal}${m.value.toLocaleString("pt-BR")}*`);
      }
    }

    // O botao existia desde sempre e nunca chegou na mensagem: com o preview
    // real mostrando o texto inteiro, a falta ficaria na cara.
    if (includeAudit && auditoria) {
      const cor = auditoria.score >= 80 ? "🟢" : auditoria.score >= 60 ? "🟡" : "🔴";
      linhas.push("", `*🔍 Auditoria da conta:* ${cor} ${auditoria.score}/100`);
    }

    linhas.push("", "_Enviado por Scale Ads_");
    return linhas.join("\n");
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
      // O PDF sai do mesmo template do painel de relatorios — com logo, fonte
      // do design system e criativos. Ate 21/09/2026 este botao chamava a
      // `send-client-report`, que montava um segundo PDF, so texto, na Edge
      // Function: dois relatorios diferentes saindo para o mesmo cliente.
      //
      // Se o preview ja foi aberto, o envio reaproveita AQUELES dados e AQUELE
      // texto: o que o gestor leu e revisou e exatamente o que sai. Buscar de
      // novo aqui abriria a porta para o numero mudar entre ler e enviar.
      let dados = dadosPreview;
      let texto = preview;
      if (!dados || !texto) {
        dados = await montarReportDataDoBanco(client.id, periodoRapido(period));
        aplicarPreferencias(dados);
        const auditoria = includeAudit ? await loadLatestAudit(client.id) : null;
        texto = montarMensagem(dados, auditoria);
      }

      const blob = await buildReportPdfBlob(dados);
      const media_base64 = await blobToBase64(blob);

      const { data, error } = await supabase.functions.invoke("send-report-whatsapp", {
        body: {
          client_id: client.id,
          file_name: `relatorio-${client.name.replace(/[^\w-]+/g, "-")}.pdf`,
          media_base64,
          // O resumo vai em mensagem propria, antes do anexo: no WhatsApp a
          // legenda de documento fica escondida atras do nome do arquivo.
          text: texto,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      if (saveTemplate) {
        await supabase.from("clients").update({ report_template: buildTemplate() }).eq("id", client.id);
        toast.info("Template salvo para este cliente");
      }

      toast.success("Relatório enviado com sucesso!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar relatório");
    } finally {
      setSending(false);
    }
  }

  // Ate 21/09/2026 este botao so avisava "clique em Enviar para ver o preview
  // com dados reais" — ou seja, a unica forma de ver a mensagem era ela ja ter
  // ido para o grupo do cliente. Agora busca de verdade, mostra e deixa editar.
  async function carregarPreview() {
    if (metrics.length === 0) {
      toast.error("Selecione ao menos uma métrica");
      return;
    }

    setPreviewLoading(true);
    try {
      const dados = await montarReportDataDoBanco(client.id, periodoRapido(period));
      aplicarPreferencias(dados);
      // Busca a auditoria mesmo com o botao desligado: e uma consulta so, e
      // permite ligar e desligar o trecho sem ir ao banco de novo.
      const auditoria = await loadLatestAudit(client.id);

      setDadosPreview(dados);
      setAuditPreview(auditoria);
      setPreview(montarMensagem(dados, auditoria));
      setEditado(false);
      setPreviewStale(false);
      setShowPreview(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui montar o preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  function handlePreview() {
    if (showPreview) { setShowPreview(false); return; }
    if (preview && !previewStale) { setShowPreview(true); return; }
    carregarPreview();
  }

  // Mexer nas opcoes com o preview aberto: se o texto ainda e o gerado, refaz
  // na hora, sem ir ao banco. Se foi editado a mao, nao apaga o que a pessoa
  // escreveu — marca como desatualizado e deixa ela decidir.
  useEffect(() => {
    if (!showPreview || !dadosPreview) return;
    if (editado) { setPreviewStale(true); return; }
    setPreview(montarMensagem(dadosPreview, auditPreview));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics, intro, includeCampaigns, includeAudit]);

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
            <Select value={period} onValueChange={v => { setPeriod(v as Period); setDadosPreview(null); setPreview(null); setPreviewStale(false); setShowPreview(false); }}>
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
              <Switch checked={includeCampaigns} onCheckedChange={setIncludeCampaigns} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Nota de auditoria</p>
                <p className="text-xs text-muted-foreground">Inclui score da última auditoria</p>
              </div>
              <Switch checked={includeAudit} onCheckedChange={setIncludeAudit} />
            </div>
          </div>

          <Separator />

          {/* Intro personalizada */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Mensagem de abertura <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Textarea
              value={intro}
              onChange={e => setIntro(e.target.value)}
              placeholder="Ex: Olá! Segue o resumo das suas campanhas desta semana."
              className="text-sm min-h-[72px] resize-none"
            />
          </div>

          {/* Preview editavel: o que esta nesta caixa e exatamente o que sai */}
          {showPreview && preview !== null && (
            <div className="space-y-2 rounded-lg border border-green-500/20 bg-green-950/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-green-600">
                  Mensagem que vai para o WhatsApp {editado && "· editada"}
                </p>
                {editado && !previewStale && (
                  <button
                    type="button"
                    onClick={() => { if (!dadosPreview) return; setPreview(montarMensagem(dadosPreview, auditPreview)); setEditado(false); }}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Desfazer edição
                  </button>
                )}
              </div>

              {previewStale && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                  <span>As opções mudaram. Refazer o texto descarta a sua edição.</span>
                  <button
                    type="button"
                    onClick={() => { if (!dadosPreview) return; setPreview(montarMensagem(dadosPreview, auditPreview)); setEditado(false); setPreviewStale(false); }}
                    className="font-medium underline"
                  >
                    Refazer
                  </button>
                </div>
              )}

              <Textarea
                value={preview}
                onChange={e => { setPreview(e.target.value); setEditado(true); }}
                className="min-h-[220px] resize-y bg-background font-sans text-xs leading-relaxed"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                Dá para editar aqui. O PDF em anexo não muda — ele sai dos mesmos números.
              </p>
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
            <Button
              variant="outline"
              className="flex-1"
              onClick={handlePreview}
              disabled={previewLoading || metrics.length === 0}
            >
              {previewLoading
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : showPreview ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {previewLoading ? "Montando..." : showPreview ? "Fechar preview" : "Preview"}
            </Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              onClick={handleSend}
              // Travado enquanto o texto na tela nao corresponde as opcoes: o
              // que o gestor esta lendo tem que ser o que o cliente recebe.
              disabled={sending || !hasNumber || metrics.length === 0 || previewStale}
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
