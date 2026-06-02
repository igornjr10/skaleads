import { supabase } from '@/integrations/supabase/client';
import { ALL_CHECKS } from './checks';
import type { AuditCategory, AuditCheckResult, AuditContext, AuditReport, CategoryScore } from './types';

const SEVERITY_POINTS = { critical: 3, warning: 2, info: 1 } as const;
const CATEGORIES: AuditCategory[] = ['pixel', 'structure', 'creatives', 'budget', 'account', 'local'];

function computeScore(results: AuditCheckResult[]): { score: number; categoryScores: Record<AuditCategory, CategoryScore> } {
  const cat = Object.fromEntries(
    CATEGORIES.map(c => [c, { score: 0, pass: 0, warn: 0, fail: 0, skip: 0 } as CategoryScore])
  ) as Record<AuditCategory, CategoryScore>;

  for (const r of results) {
    cat[r.category][r.status]++;
  }

  for (const c of CATEGORIES) {
    const relevant = results.filter(r => r.category === c && r.status !== 'skip');
    const total = relevant.reduce((sum, r) => sum + SEVERITY_POINTS[r.severity], 0);
    if (!total) { cat[c].score = 100; continue; }
    const earned = relevant.reduce((sum, r) => {
      if (r.status === 'pass') return sum + SEVERITY_POINTS[r.severity];
      if (r.status === 'warn') return sum + SEVERITY_POINTS[r.severity] * 0.5;
      return sum; // fail = 0
    }, 0);
    cat[c].score = Math.round((earned / total) * 100);
  }

  // Global score: weighted average by category check count
  const relevant = results.filter(r => r.status !== 'skip');
  const total = relevant.reduce((sum, r) => sum + SEVERITY_POINTS[r.severity], 0);
  if (!total) return { score: 100, categoryScores: cat };
  const earned = relevant.reduce((sum, r) => {
    if (r.status === 'pass') return sum + SEVERITY_POINTS[r.severity];
    if (r.status === 'warn') return sum + SEVERITY_POINTS[r.severity] * 0.5;
    return sum;
  }, 0);
  const score = Math.round((earned / total) * 100);

  return { score, categoryScores: cat };
}

export async function runAudit(
  clientId: string,
  adAccountId: string,
  accessToken: string,
  onProgress?: (done: number, total: number, name: string) => void
): Promise<AuditReport> {
  const ctx: AuditContext = {
    clientId,
    adAccountId: adAccountId.replace(/^act_/, ''),
    accessToken: accessToken.trim(),
  };

  const total = ALL_CHECKS.length;
  let done = 0;

  const settled = await Promise.allSettled(
    ALL_CHECKS.map(check =>
      check.run(ctx)
        .catch(err => ({ status: 'skip' as const, message: `Erro: ${err instanceof Error ? err.message : 'desconhecido'}` }))
        .then(result => {
          done++;
          onProgress?.(done, total, check.name);
          return { check, result };
        })
    )
  );

  const results: AuditCheckResult[] = settled.map(s => {
    const { check, result } = (s as PromiseFulfilledResult<{ check: typeof ALL_CHECKS[0]; result: Awaited<ReturnType<typeof ALL_CHECKS[0]['run']>> }>).value;
    return { id: check.id, name: check.name, category: check.category, severity: check.severity, ...result };
  });

  const { score, categoryScores } = computeScore(results);
  const runAt = new Date().toISOString();

  const { data: saved } = await supabase.from('audit_runs').insert({
    client_id: clientId,
    score,
    category_scores: categoryScores as unknown as Record<string, unknown>,
    results: results as unknown as Record<string, unknown>[],
  }).select('id').single();

  return { id: saved?.id, score, categoryScores, results, runAt };
}

export async function loadLatestAudit(clientId: string): Promise<AuditReport | null> {
  const { data } = await supabase
    .from('audit_runs')
    .select('id, score, category_scores, results, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    score: data.score,
    categoryScores: data.category_scores as unknown as Record<AuditCategory, CategoryScore>,
    results: data.results as unknown as AuditCheckResult[],
    runAt: data.created_at,
  };
}

export async function loadAuditHistory(clientId: string): Promise<{ id: string; score: number; runAt: string }[]> {
  const { data } = await supabase
    .from('audit_runs')
    .select('id, score, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
    .limit(30);

  return (data ?? []).map(d => ({ id: d.id, score: d.score, runAt: d.created_at }));
}
