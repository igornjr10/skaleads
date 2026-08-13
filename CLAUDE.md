# Ad Campaign Hub - Guia de desenvolvimento

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
    meta-api.ts      - sync de dados Meta -> Supabase
    audit/           - engine de auditoria de conta Meta
      types.ts       - interfaces AuditCheck, AuditResult, AuditReport
      checks.ts      - todos os checks (25+)
      runner.ts      - execucao paralela + scoring
  pages/             - uma pagina por rota
  components/ui/     - shadcn (nao editar diretamente)
supabase/
  functions/         - Edge Functions (deploy manual no dashboard)
  migrations/        - SQL migrations (rodar manualmente no SQL Editor)
```

## Convencoes
- Sem comentarios exceto quando o WHY e nao-obvio
- Supabase e o unico backend - sem Express/Next.js
- Meta API calls passam pela Edge Function `meta-proxy`: o token vive em `client_secrets` (sem grant para `authenticated`) e nunca chega no browser. No front use `metaGet`/`metaGetAll` de `@/lib/meta-client`; `clients.meta_token_configured` diz se a conta esta conectada
- Imports: usar `@/` como alias para `src/`
- Toasts: usar `sonner` (`import { toast } from "sonner"`)

## Banco de dados (Supabase: npfcxgijwrxrssinpkdw)
Tabelas principais: `clients`, `campaigns`, `ad_sets`, `ads`, `campaign_daily_metrics`, `audit_runs`
RLS habilitado em todas. Funcoes SECURITY DEFINER: `get_my_role()`, `has_role()`, `is_admin_or_owner()`

## Deploy
**Nao existe branch `main`.** O repo (renomeado de `marketpro-manager` para
`skaleads`) tem como default a branch `fix/whatsapp-connection-ui` — push nela
dispara o CI e o deploy do projeto `scale-ads` no Vercel.

Edge Functions saem pela CLI, sem precisar de Docker:
```
supabase functions deploy <nome> --project-ref npfcxgijwrxrssinpkdw
```
O deploy sobe junto os arquivos de `_shared/` que a function importa.

Migrations rodam uma a uma — `supabase db push` tentaria reaplicar todo o
historico, que foi aplicado a mao:
```
supabase db query "<sql>" --linked
```

## Skill: Navegacao e UX de Clientes

Use esta skill sempre que alterar sidebar, topbar, tipografia global ou a experiencia da pagina `Clientes`.

### Objetivo visual
- Manter aparencia premium escura com destaque verde (emerald)
- Priorizar legibilidade, hover claro e feedback visual de estado
- Evitar regressao para menu lateral simples ou cards sem contexto operacional

### Arquivos-chave
- `src/index.css` - fonte global `Plus Jakarta Sans`
- `src/components/ui/sidebar.tsx` - largura, animacao e comportamento estrutural do sidebar
- `src/components/AppSidebar.tsx` - visual do menu, hover expand, header/footer e destaque do item ativo
- `src/components/AppLayout.tsx` - topbar e footer com efeito glass
- `src/pages/Clients.tsx` - filtros, ordenacao, indicadores de conexao/sync e acoes de gestao

### Padroes da sidebar
- Sidebar inicia recolhido com `defaultOpen={false}`
- No desktop, expandir ao passar o mouse e recolher ao sair
- Usar variante `floating` com blur, sombra forte e cantos grandes
- Icones e nomes das abas devem ser maiores que o padrao do shadcn
- Item ativo deve ter destaque mais forte que os demais: gradiente leve, glow/sombra sutil e indicador lateral

### Padroes da tela de clientes
- Sempre manter os dois modos: `Cards` e `Tabela`
- Cards precisam exibir acoes de integracao e gestao, nao apenas resumo visual
- A listagem deve oferecer:
  - busca textual
  - filtro por status
  - filtro por conexao Meta
  - ordenacao por nome, criacao, relatorios ou ultima sync
- Mostrar claramente:
  - cliente ativo/inativo
  - Meta conectada ou pendente
  - andamento de sincronizacao
  - ultima sync e quantidade de relatorios

### Regras de implementacao
- Reaproveitar `renderClientActions()` para nao duplicar comportamento entre card e tabela
- Quando houver sync em andamento, refletir esse estado diretamente na listagem
- Qualquer melhoria visual deve preservar usabilidade em desktop e mobile
- Validar com `npm run build` apos alteracoes nessa area
