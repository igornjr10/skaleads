export type CheckSeverity = 'critical' | 'warning' | 'info';
export type CheckStatus   = 'pass' | 'warn' | 'fail' | 'skip';
export type AuditCategory = 'pixel' | 'structure' | 'creatives' | 'budget' | 'account' | 'local';

import type { MetaSource } from '@/lib/meta-client';

export interface AuditContext {
  clientId:    string;
  adAccountId: string; // sem prefixo act_
  source:      MetaSource; // token resolvido no servidor pelo meta-proxy
}

export interface AuditResult {
  status:          CheckStatus;
  message:         string;
  details?:        string;
  recommendation?: string;
}

export interface AuditCheck {
  id:       string;
  name:     string;
  category: AuditCategory;
  severity: CheckSeverity;
  run(ctx: AuditContext): Promise<AuditResult>;
}

export interface AuditCheckResult extends AuditResult {
  id:         string;
  name:       string;
  category:   AuditCategory;
  severity:   CheckSeverity;
  dismissed?: boolean;
}

export interface CategoryScore {
  score: number;
  pass:  number;
  warn:  number;
  fail:  number;
  skip:  number;
}

export interface AuditReport {
  id?:            string;
  score:          number;
  categoryScores: Record<AuditCategory, CategoryScore>;
  results:        AuditCheckResult[];
  runAt:          string;
}
