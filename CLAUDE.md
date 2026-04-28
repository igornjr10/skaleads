# Ad Campaign Hub — Guia de desenvolvimento

## Stack
- **Frontend**: React + TypeScript + Vite, implantado no Vercel
- **Backend**: Supabase (PostgreSQL + RLS + Edge Functions)
- **UI**: shadcn/ui + Tailwind CSS
- **Charts**: Recharts
- **Meta API**: Graph API v21.0 chamada diretamente do browser

## Estrutura
```
src/
  lib/
    meta-api.ts      — sync de dados Meta → Supabase
    audit/           — engine de auditoria de conta Meta
      types.ts       — interfaces AuditCheck, AuditResult, AuditReport
      checks.ts      — todos os checks (25+)
      runner.ts      — execução paralela + scoring
  pages/             — uma página por rota
  components/ui/     — shadcn (não editar diretamente)
supabase/
  functions/         — Edge Functions (deploy manual no dashboard)
  migrations/        — SQL migrations (rodar manualmente no SQL Editor)
```

## Convenções
- Sem comentários exceto quando o WHY é não-óbvio
- Supabase é o único backend — sem Express/Next.js
- Meta API calls são client-side (token armazenado em `clients.meta_access_token`)
- Imports: usar `@/` como alias para `src/`
- Toasts: usar `sonner` (`import { toast } from "sonner"`)

## Banco de dados (Supabase: npfcxgijwrxrssinpkdw)
Tabelas principais: `clients`, `campaigns`, `ad_sets`, `ads`, `campaign_daily_metrics`, `audit_runs`
RLS habilitado em todas. Funções SECURITY DEFINER: `get_my_role()`, `has_role()`, `is_admin_or_owner()`

## Deploy
Push para `main` → Vercel auto-deploya. Edge Functions precisam de deploy manual no dashboard do Supabase.
