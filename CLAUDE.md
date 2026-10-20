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
- Tokens da Meta (conta e Pagina) vivem em `client_secrets` (sem grant para `authenticated`) e nunca chegam no browser. No front passe `access_token: credencialDoCliente(id)` (ou `credencialDaPagina`) para `metaGet`/`metaGetAll` de `@/lib/meta-fetch`: a chamada sai pela Edge Function `meta-proxy`. Token novo so se grava por `guardarTokensMeta()` (`meta-store-token`). `clients.meta_token_configured` diz se a conta esta conectada; no servidor, leia o token com `_shared/meta-token.ts`
- Token cru no browser so no fluxo de conexao, logo apos o login do Facebook (ele e do proprio usuario)
- Imports: usar `@/` como alias para `src/`
- Toasts: usar `sonner` (`import { toast } from "sonner"`)

## Banco de dados (Supabase: ntlcyabztsdddsuobhhi)
Tabelas principais: `clients`, `campaigns`, `ad_sets`, `ads`, `campaign_daily_metrics`, `audit_runs`
RLS habilitado em todas. Funcoes SECURITY DEFINER: `get_my_role()`, `has_role()`, `is_admin_or_owner()`

## Permissoes
- Isolamento por empresa (`companies` + `user_companies`); `owner` e o dono da plataforma e ve tudo
- Carteira: `admin` ve todos os clientes da empresa; os outros papeis so os de `client_assignments`. A regra vive na policy de `clients` e em `user_can_access_client` — tabela nova pendurada em cliente herda filtrando por `client_id in (select id from clients)`
- Modulos: catalogo e padrao por papel em `src/lib/permissoes.ts`; `user_companies.modulos` null = padrao. Rota nova precisa entrar em `MODULOS` para ser guardada
- Equipe (convite, papel, modulos, clientes) passa pela Edge Function `company-members`

## Metas e Cerebro (IA)
- Meta do cliente: `clients.alvo_resultados_mes` / `alvo_custo_resultado` (prefixo `alvo_` porque `meta_*` e a conta Meta). Gestor grava por `definir_metas_cliente()`; a regra de ritmo vive em `src/lib/metas.ts` e na gemea `_shared/metas.ts`
- Resultado = mensagens + ligacoes + rotas + leads, em todo lugar
- `chat-assistant` le o contexto com o JWT de quem pergunta (RLS decide), nunca com service role

## Demandas
- `tasks` e a fila unica (substituiu Tarefas, Producao, Esteira e Time). Status: a_fazer, fazendo, revisao, aprovado, concluida
- ADM ve tudo da empresa; os demais veem o que esta com eles ou o que pediram. Quem pediu edita tudo; o responsavel so status e checklist (`guard_task_update`)
- Historico (`task_events`) e escrito so por trigger; anexos em `task_anexos` + bucket privado `demandas` (empresa/demanda/arquivo)
- Nome de cliente fora da carteira (designer recebendo arte) vem de `clientes_das_minhas_demandas()`, nao de `clients`

## Comercial (CRM)
- `crm_funis` sem `client_id` = prospeccao da agencia (criado por `garantir_funil_prospeccao()` na 1a visita); com `client_id` = funil de vendas do cliente
- `crm_leads`: empresa e cliente vem do funil (trigger `preparar_lead`); etapa `ganho`/`perdido` carimba `ganho_em`/`perdido_em`
- Visibilidade: ADM tudo; sdr/closer/social_seller os seus + os sem dono (fila) da prospeccao; gestor os funis dos clientes da carteira
- `crm_atividades` tipo `etapa` e `convertido` so o banco escreve. Lead vira cliente por `converter_lead_em_cliente()` (so ADM)

## WhatsApp (uazapi, um numero por usuario)
- Cada usuario conecta o proprio numero: `wa_instancias` (uma linha por `user_id`, token so para service role; o browser le as demais colunas por grant de coluna). O 1o "Gerar QR Code" em Configuracoes cria a instancia com `UAZAPI_ADMIN_TOKEN` e ja liga o webhook. `wa_instancia` (singular) e legado, nao usar. Doc: https://docs.uazapi.com/llms-full.txt
- Toda chamada da uazapi recebe a instancia: `remetente({ userId, companyId })` em `_shared/whatsapp.ts`. Com pessoa (quem clicou, ou o `created_by` do alerta/rotina/agendamento/relatorio, `updated_by` da automacao, `criado_por` da fila) sai do numero dela e falha se ela nao conectou. Sem pessoa (cobranca, deposito, linha antiga) sai do numero `padrao` da empresa, escolhido pelo ADM (`definir_numero_padrao_wa`)
- Visibilidade: `wa_mensagens.instancia_id`; o dono ve as conversas do proprio numero, o ADM ve todas. Conversa = (instancia, chave). So o dono marca como lida e responde (resposta sai sempre do numero de quem escreve)
- Entrada: uazapi -> `wa-webhook` (sem JWT; acha a instancia pelo `token` do corpo, e dela tira empresa e dono). Aviso de mensagem nova vai para o dono do numero
- Mensagem casa com lead pela chave de telefone (pais + DDD + 8 ultimos digitos): `public.wa_chave`, `_shared/wa-crm.ts` e `src/lib/whatsapp.ts` precisam andar juntas
- Resposta manual: `wa-enviar`. Disparo e sequencia so enfileiram em `wa_fila`; quem envia e o cron `wa-processar-fila` (1/min), um numero por vez em paralelo, com teto diario e intervalo de `wa_config` valendo por numero
- Lead que responde encerra as sequencias com `parar_se_responder`

## Deploy
**Nao existe branch `main`.** O repo (renomeado de `marketpro-manager` para
`skaleads`) tem como default a branch `fix/whatsapp-connection-ui` — push nela
dispara o CI e o deploy do projeto `scale-ads` no Vercel.

Edge Functions saem pela CLI, sem precisar de Docker:
```
supabase functions deploy <nome> --project-ref ntlcyabztsdddsuobhhi
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
