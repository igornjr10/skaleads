import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as ReTooltip, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { runAudit, loadLatestAudit, loadAuditHistory } from "@/lib/audit/runner";
import { prioritizeAuditActions } from "@/lib/ai-service";
import type { AuditCategory, AuditCheckResult, AuditReport } from "@/lib/audit/types";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle, CheckCircle, XCircle, SkipForward, RefreshCw, FileText,
  ArrowLeft, ShieldCheck, Zap, LayoutGrid, PaintBucket, DollarSign, Building2,
  ChevronDown, ChevronUp, Info, Brain, Loader2, Copy,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClientInfo {
  id: string;
  name: string;
  meta_ad_account_id: string | null;
  meta_access_token: string | null;
}

// ── Score gauge ───────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const r = 70;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  const label = score >= 80 ? 'Saudável' : score >= 60 ? 'Atenção' : 'Crítico';

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle cx="90" cy="90" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
        <circle
          cx="90" cy="90" r={r} fill="none"
          stroke={color} strokeWidth="12"
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 90 90)"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
        <text x="90" y="84" textAnchor="middle" fontSize="34" fontWeight="bold" fill={color}>{score}</text>
        <text x="90" y="106" textAnchor="middle" fontSize="13" fill="hsl(var(--muted-foreground))">de 100</text>
      </svg>
      <Badge style={{ backgroundColor: color, color: '#fff' }} className="text-sm px-3 py-1">{label}</Badge>
    </div>
  );
}

// ── Category card ─────────────────────────────────────────────────────────────

const CATEGORY_META: Record<AuditCategory, { label: string; icon: React.ElementType }> = {
  pixel:     { label: 'Pixel & Tracking', icon: Zap },
  structure: { label: 'Estrutura',        icon: LayoutGrid },
  creatives: { label: 'Criativos',        icon: PaintBucket },
  budget:    { label: 'Orçamento',        icon: DollarSign },
  account:   { label: 'Conta',           icon: Building2 },
};

function CategoryCard({ category, score, fail, warn: warnCount }: { category: AuditCategory; score: number; fail: number; warn: number }) {
  const { label, icon: Icon } = CATEGORY_META[category];
  const color = score >= 80 ? 'text-green-500' : score >= 60 ? 'text-yellow-500' : 'text-red-500';
  return (
    <Card className="shadow-card">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{label}</span>
          </div>
          <span className={`text-2xl font-bold ${color}`}>{score}</span>
        </div>
        <Progress value={score} className="h-2 mb-2" />
        <div className="flex gap-3 text-xs text-muted-foreground">
          {fail > 0 && <span className="text-red-500">{fail} crítico(s)</span>}
          {warnCount > 0 && <span className="text-yellow-500">{warnCount} alerta(s)</span>}
          {fail === 0 && warnCount === 0 && <span className="text-green-500">Tudo OK</span>}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Issue row ─────────────────────────────────────────────────────────────────

const SEVERITY_LABELS: Record<string, string> = { critical: 'Crítico', warning: 'Alerta', info: 'Info' };
const STATUS_ICON: Record<string, React.ElementType> = { pass: CheckCircle, warn: AlertTriangle, fail: XCircle, skip: SkipForward };
const STATUS_COLOR: Record<string, string> = { pass: 'text-green-500', warn: 'text-yellow-500', fail: 'text-red-500', skip: 'text-muted-foreground' };

function IssueRow({ result, dismissed, onDismiss }: { result: AuditCheckResult; dismissed: boolean; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = STATUS_ICON[result.status];
  const colorClass = STATUS_COLOR[result.status];
  const { label: catLabel } = CATEGORY_META[result.category];

  return (
    <div className={`border-b last:border-0 transition-opacity ${dismissed ? 'opacity-40' : ''}`}>
      <div
        className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/30"
        onClick={() => setExpanded(v => !v)}
      >
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${colorClass}`} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="text-sm font-medium">{result.name}</span>
            <Badge variant="outline" className="text-[10px] h-4">{catLabel}</Badge>
            {result.status !== 'pass' && result.status !== 'skip' && (
              <Badge
                variant="outline"
                className={`text-[10px] h-4 ${result.severity === 'critical' ? 'border-red-500 text-red-500' : result.severity === 'warning' ? 'border-yellow-500 text-yellow-500' : 'border-blue-500 text-blue-500'}`}
              >
                {SEVERITY_LABELS[result.severity]}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{result.message}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {result.status !== 'pass' && result.status !== 'skip' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm" variant="ghost"
                  className="h-6 px-2 text-[10px] text-muted-foreground"
                  onClick={e => { e.stopPropagation(); onDismiss(); }}
                >
                  {dismissed ? 'Restaurar' : 'Tratado'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Marcar como tratado (apenas visual)</TooltipContent>
            </Tooltip>
          )}
          {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </div>
      </div>
      {expanded && (result.details || result.recommendation) && (
        <div className="px-10 pb-3 space-y-2">
          {result.details && (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2">{result.details}</p>
          )}
          {result.recommendation && (
            <div className="flex gap-2 bg-primary/5 rounded p-2">
              <Info className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
              <p className="text-xs text-foreground">{result.recommendation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Print layout ──────────────────────────────────────────────────────────────

function printReport(report: AuditReport, clientName: string) {
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Auditoria Meta Ads — ${clientName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', sans-serif; color: #1a1a1a; padding: 32px; }
  h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 13px; margin-bottom: 32px; }
  .score-row { display: flex; gap: 24px; margin-bottom: 32px; }
  .score-box { text-align: center; background: #f5f5f5; border-radius: 12px; padding: 24px 32px; }
  .score-num { font-size: 48px; font-weight: 800; }
  .score-green { color: #16a34a; } .score-yellow { color: #ca8a04; } .score-red { color: #dc2626; }
  .score-label { font-size: 12px; color: #666; margin-top: 4px; }
  .cats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 32px; }
  .cat { background: #f9f9f9; border-radius: 8px; padding: 12px; border: 1px solid #eee; }
  .cat-name { font-size: 11px; color: #666; margin-bottom: 6px; }
  .cat-score { font-size: 22px; font-weight: 700; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 14px; font-weight: 700; padding: 8px 0; border-bottom: 2px solid #eee; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .issue { padding: 10px 12px; border-left: 3px solid #ddd; margin-bottom: 8px; background: #fafafa; border-radius: 0 6px 6px 0; }
  .issue.fail { border-color: #dc2626; background: #fff5f5; }
  .issue.warn { border-color: #ca8a04; background: #fffbf0; }
  .issue.pass { border-color: #16a34a; background: #f0fdf4; }
  .issue-name { font-size: 13px; font-weight: 600; margin-bottom: 3px; }
  .issue-msg { font-size: 12px; color: #444; margin-bottom: 4px; }
  .issue-rec { font-size: 11px; color: #666; font-style: italic; }
  .sev { display: inline-block; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px; margin-left: 6px; }
  .sev-critical { background: #fee2e2; color: #dc2626; }
  .sev-warning { background: #fef3c7; color: #b45309; }
  .sev-info { background: #dbeafe; color: #1d4ed8; }
  .footer { margin-top: 40px; font-size: 11px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 16px; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
<h1>Auditoria Meta Ads — ${clientName}</h1>
<p class="subtitle">Gerada em ${format(new Date(report.runAt), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })} • MarketProAds</p>

<div class="score-row">
  <div class="score-box">
    <div class="score-num ${report.score >= 80 ? 'score-green' : report.score >= 60 ? 'score-yellow' : 'score-red'}">${report.score}</div>
    <div class="score-label">Score de Saúde Global (0–100)</div>
  </div>
</div>

<div class="cats">
  ${Object.entries(report.categoryScores).map(([cat, s]) => `
    <div class="cat">
      <div class="cat-name">${CATEGORY_META[cat as AuditCategory]?.label ?? cat}</div>
      <div class="cat-score ${s.score >= 80 ? 'score-green' : s.score >= 60 ? 'score-yellow' : 'score-red'}">${s.score}</div>
    </div>
  `).join('')}
</div>

${['fail', 'warn', 'pass'].map(status => {
  const items = report.results.filter(r => r.status === status);
  if (!items.length) return '';
  const titles: Record<string, string> = { fail: '🔴 Problemas Críticos', warn: '🟡 Alertas', pass: '✅ Aprovados' };
  return `
<div class="section">
  <div class="section-title">${titles[status]} (${items.length})</div>
  ${items.map(r => `
    <div class="issue ${status}">
      <div class="issue-name">${r.name}<span class="sev sev-${r.severity}">${SEVERITY_LABELS[r.severity]}</span></div>
      <div class="issue-msg">${r.message}</div>
      ${r.recommendation ? `<div class="issue-rec">💡 ${r.recommendation}</div>` : ''}
    </div>
  `).join('')}
</div>`;
}).join('')}

<div class="footer">
  Auditoria gerada por MarketProAds — Score ${report.score}/100 — ${format(new Date(report.runAt), "dd/MM/yyyy HH:mm")}
</div>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) { toast.error('Popup bloqueado — libere popups e tente novamente'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 500);
}

// ── Main page ─────────────────────────────────────────────────────────────────

const FILTER_OPTIONS = [
  { value: 'all',  label: 'Todos' },
  { value: 'fail', label: 'Problemas' },
  { value: 'warn', label: 'Alertas' },
  { value: 'pass', label: 'OK' },
  { value: 'skip', label: 'Ignorados' },
] as const;

export default function ClientAudit() {
  const { id: clientId } = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [history, setHistory] = useState<{ id: string; score: number; runAt: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, name: '' });
  const [filter, setFilter] = useState<'all' | 'fail' | 'warn' | 'pass' | 'skip'>('all');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showPrioritization, setShowPrioritization] = useState(false);
  const [prioritization, setPrioritization] = useState<string | null>(null);
  const [prioritizationLoading, setPrioritizationLoading] = useState(false);
  const [prioritizationUsage, setPrioritizationUsage] = useState<{ tokens: { input: number; output: number }; cost: number; cached: boolean } | null>(null);

  useEffect(() => {
    if (!clientId) return;
    supabase.from('clients').select('id,name,meta_ad_account_id,meta_access_token').eq('id', clientId).single()
      .then(({ data }) => setClient(data as ClientInfo));
    loadLatestAudit(clientId).then(r => r && setReport(r));
    loadAuditHistory(clientId).then(setHistory);
  }, [clientId]);

  async function handleRunAudit() {
    if (!client?.meta_ad_account_id || !client?.meta_access_token) {
      toast.error('Configure a conta Meta Ads antes de auditar');
      return;
    }
    setRunning(true);
    setProgress({ done: 0, total: 0, name: 'Iniciando...' });
    try {
      const r = await runAudit(
        client.id,
        client.meta_ad_account_id,
        client.meta_access_token,
        (done, total, name) => setProgress({ done, total, name })
      );
      setReport(r);
      setDismissed(new Set());
      loadAuditHistory(client.id).then(setHistory);
      toast.success(`Auditoria concluída — Score: ${r.score}/100`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao executar auditoria');
    } finally {
      setRunning(false);
    }
  }

  async function handlePrioritizeAudit() {
    if (!report) return;

    setPrioritizationLoading(true);
    try {
      const auditData = report.results.map(r => ({
        id: r.id,
        name: r.name,
        status: r.status,
        severity: r.severity,
        details: r.details,
      }));

      const result = await prioritizeAuditActions({ auditResults: auditData });
      setPrioritization(result.prioritization);
      setPrioritizationUsage({
        tokens: result.tokens,
        cost: result.cost,
        cached: result.cached,
      });
      toast.success(`Priorização concluída ${result.cached ? "(em cache)" : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao priorizar ações");
    } finally {
      setPrioritizationLoading(false);
    }
  }

  function copyPrioritizationToClipboard() {
    if (prioritization) {
      navigator.clipboard.writeText(prioritization);
      toast.success("Priorização copiada para clipboard");
    }
  }

  const filtered = report?.results.filter(r => filter === 'all' || r.status === filter) ?? [];
  const issueCount = report?.results.filter(r => r.status === 'fail' || r.status === 'warn').length ?? 0;
  const failCount  = report?.results.filter(r => r.status === 'fail').length ?? 0;

  const trendData = history.map(h => ({
    date: format(new Date(h.runAt), 'dd/MM', { locale: ptBR }),
    score: h.score,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/clients"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Auditoria — {client?.name ?? '...'}</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              {report ? `Última auditoria: ${format(new Date(report.runAt), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}` : 'Nenhuma auditoria executada ainda'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {report && (
            <>
              <Button variant="outline" onClick={() => printReport(report, client?.name ?? '')}>
                <FileText className="mr-2 h-4 w-4" />Gerar PDF
              </Button>
              <Button variant="outline" onClick={() => { setPrioritization(null); setShowPrioritization(true); }}>
                <Brain className="mr-2 h-4 w-4" />Análise IA
              </Button>
            </>
          )}
          <Button onClick={handleRunAudit} disabled={running}>
            <RefreshCw className={`mr-2 h-4 w-4 ${running ? 'animate-spin' : ''}`} />
            {running ? `${progress.done}/${progress.total || '?'}` : 'Executar Auditoria'}
          </Button>
        </div>
      </div>

      {/* Running progress */}
      {running && (
        <Card className="shadow-card">
          <CardContent className="pt-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{progress.name}</span>
                <span className="font-medium">{progress.done}/{progress.total || '?'}</span>
              </div>
              <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* No meta connected warning */}
      {!client?.meta_ad_account_id && !running && (
        <Card className="shadow-card border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <p className="text-sm">Esta conta não tem Meta Ads conectado. <Link to="/clients" className="text-primary underline">Conecte em Clientes</Link> antes de auditar.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {report && (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="issues">
              Issues {issueCount > 0 && <Badge variant="destructive" className="ml-1 h-4 text-[10px]">{issueCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="trend">Histórico</TabsTrigger>
          </TabsList>

          {/* ── Overview ── */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* Score gauge */}
              <Card className="shadow-card md:col-span-1 flex items-center justify-center py-6">
                <div className="flex flex-col items-center gap-3">
                  <ScoreGauge score={report.score} />
                  <div className="flex gap-4 text-center text-xs text-muted-foreground">
                    <div><span className="block text-lg font-bold text-red-500">{failCount}</span>Crítico(s)</div>
                    <div><span className="block text-lg font-bold text-yellow-500">{issueCount - failCount}</span>Alerta(s)</div>
                    <div><span className="block text-lg font-bold text-green-500">{report.results.filter(r => r.status === 'pass').length}</span>Aprovado(s)</div>
                  </div>
                </div>
              </Card>

              {/* Category scores */}
              <div className="md:col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(Object.entries(report.categoryScores) as [AuditCategory, { score: number; fail: number; warn: number }][]).map(([cat, s]) => (
                  <CategoryCard key={cat} category={cat} score={s.score} fail={s.fail} warn={s.warn} />
                ))}
              </div>
            </div>

            {/* Critical issues preview */}
            {failCount > 0 && (
              <Card className="shadow-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    Problemas críticos ({failCount})
                  </CardTitle>
                  <CardDescription>Ação imediata recomendada</CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  {report.results
                    .filter(r => r.status === 'fail')
                    .map(r => (
                      <IssueRow key={r.id} result={r} dismissed={dismissed.has(r.id)} onDismiss={() => setDismissed(prev => { const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} />
                    ))
                  }
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Issues list ── */}
          <TabsContent value="issues" className="space-y-4 mt-4">
            {/* Filter */}
            <div className="flex gap-2 flex-wrap">
              {FILTER_OPTIONS.map(opt => (
                <Button
                  key={opt.value}
                  variant={filter === opt.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter(opt.value)}
                >
                  {opt.label}
                  <Badge variant="secondary" className="ml-1 h-4 text-[10px]">
                    {report.results.filter(r => opt.value === 'all' || r.status === opt.value).length}
                  </Badge>
                </Button>
              ))}
            </div>

            <Card className="shadow-card">
              <CardContent className="px-0 pb-0">
                {filtered.length === 0
                  ? <p className="p-6 text-center text-sm text-muted-foreground">Nenhum item nessa categoria</p>
                  : filtered.map(r => (
                    <IssueRow
                      key={r.id}
                      result={r}
                      dismissed={dismissed.has(r.id)}
                      onDismiss={() => setDismissed(prev => { const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}
                    />
                  ))
                }
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Trend ── */}
          <TabsContent value="trend" className="space-y-4 mt-4">
            {trendData.length < 2 ? (
              <Card className="shadow-card">
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Execute pelo menos 2 auditorias para ver a evolução do score.
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Evolução do Score de Saúde</CardTitle>
                  <CardDescription>{trendData.length} auditorias registradas</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <ReTooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                        formatter={(v: number) => [`${v}/100`, 'Score']}
                      />
                      <Line
                        type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* History table */}
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-base">Histórico de Auditorias</CardTitle></CardHeader>
              <CardContent className="px-0 pb-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-4 py-2 text-left font-medium">Data</th>
                      <th className="px-4 py-2 text-left font-medium">Score</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map(h => (
                      <tr key={h.id} className="border-b last:border-0">
                        <td className="px-4 py-2 text-muted-foreground">{format(new Date(h.runAt), "d MMM yyyy, HH:mm", { locale: ptBR })}</td>
                        <td className="px-4 py-2 font-bold">{h.score}/100</td>
                        <td className="px-4 py-2">
                          <Badge className={h.score >= 80 ? 'bg-green-500' : h.score >= 60 ? 'bg-yellow-500' : 'bg-red-500'} style={{ color: '#fff' }}>
                            {h.score >= 80 ? 'Saudável' : h.score >= 60 ? 'Atenção' : 'Crítico'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* AI Prioritization Dialog */}
      <Dialog open={showPrioritization} onOpenChange={setShowPrioritization}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-500" />
              Priorização Inteligente de Ações — {client?.name}
            </DialogTitle>
            <DialogDescription>
              IA analisa esforço vs impacto para sugerir ordem de priorização
            </DialogDescription>
          </DialogHeader>

          {prioritization ? (
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="prose prose-sm max-w-none dark:prose-invert text-sm">
                    <ReactMarkdown>{prioritization}</ReactMarkdown>
                  </div>

                  {prioritizationUsage && (
                    <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Tokens: {prioritizationUsage.tokens.input} in / {prioritizationUsage.tokens.output} out</span>
                        <span>Custo: ${prioritizationUsage.cost.toFixed(6)}</span>
                        {prioritizationUsage.cached && <span>📦 Em cache</span>}
                      </div>
                    </div>
                  )}

                  <Button
                    size="sm"
                    onClick={copyPrioritizationToClipboard}
                    className="w-full mt-4"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copiar priorização
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="bg-muted/30">
              <CardContent className="py-8 text-center">
                {prioritizationLoading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <p className="text-xs text-muted-foreground">Analisando com IA...</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Clique em "Priorizar com IA" para gerar análise</p>
                )}
              </CardContent>
            </Card>
          )}

          <Button
            onClick={handlePrioritizeAudit}
            disabled={prioritizationLoading || !report}
            className="w-full"
          >
            {prioritizationLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <Brain className="mr-2 h-4 w-4" />
                Priorizar com IA
              </>
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

