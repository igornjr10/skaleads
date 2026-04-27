# MarketProAds — Plataforma SaaS de Gestão Meta Ads

Plataforma para gerenciar campanhas do Facebook + Instagram Ads, com dashboard de métricas, alertas inteligentes e integração real com a Meta Marketing API.

## Identidade visual

- **Tema:** Dark mode com paleta laranja/preto moderna
- **Cores:** Fundo preto profundo (#0a0a0a / #111111), superfícies #1a1a1a, laranja vibrante #f97316 como primária, laranja claro #fb923c em hovers/accents
- **Tipografia:** Inter, títulos com tracking apertado, dados em tabular-nums
- **Layout:** Sidebar fixa à esquerda (colapsável em mobile), header com seletor de cliente, cards com bordas sutis, gráficos com gradiente laranja translúcido
- Status badges: ACTIVE (verde-esmeralda), PAUSED (âmbar), DELETED (vermelho)

## Estrutura de telas

### 1. Autenticação (`/auth`)
- Tela única com tabs Login / Cadastro
- Email + senha via Supabase Auth (auto-confirmação ativada para testes rápidos)
- Logo "MarketProAds" + tagline, lateral com gradiente laranja
- Roles: Owner, Admin, Analyst, Viewer (armazenados em tabela `user_roles` separada — primeiro usuário cadastrado vira Owner automaticamente)
- Rotas protegidas: redireciona para `/auth` se não logado

### 2. Layout autenticado
- **Sidebar:** Logo, navegação (Dashboard, Clientes, Campanhas, Alertas, Configurações), avatar/logout no rodapé
- **Header:** Seletor de cliente ativo (dropdown), sino de notificações com contagem de alertas disparados
- Tenant único global nesta versão

### 3. Dashboard (`/`)
- Filtros: cliente (dropdown), período (7d / 14d / 30d / personalizado com date range picker)
- 6 KPI cards: Gasto total, Impressões, Cliques, CPM, CPC, CTR (com variação % vs período anterior)
- Gráfico de linha duplo (Recharts): Gasto + Cliques nos últimos 30 dias, gradiente laranja
- Tabela de campanhas: Nome, Status, Gasto, Impressões, Cliques, CTR, CPC — ordenável

### 4. Clientes (`/clients`)
- Lista em cards/tabela com nome, status (ativo/inativo), data de conexão, botão "Conectar Meta Ads"
- Modal "Novo cliente" (nome + status)
- Botão **Conectar Meta Ads** → inicia OAuth real da Meta, salva access token e ad_account_id no banco
- Toggle ativo/inativo, edição inline

### 5. Campanhas (`/campaigns`)
- Filtro por cliente/conta de anúncios
- Tabela de campanhas → clicar abre **drill-down** com:
  - Lista de conjuntos de anúncios (ad sets)
  - Anúncios individuais dentro de cada conjunto
- Status colorido em todos os níveis
- Botão "Sincronizar" puxa dados frescos da Meta API

### 6. Alertas (`/alerts`)
- **Aba Regras:** lista de regras + botão "Nova regra"
  - Form: nome, métrica (CPC, CPM, CTR, Gasto, Conversões), operador (>, <, =), threshold, cliente (ou todos), toggle ativo
- **Aba Histórico de eventos:** tabela de disparos (alerta, valor da métrica, data, status lido/não lido)
- Notificações **apenas in-app**: sino no header mostra novos eventos não lidos
- Avaliação periódica via edge function agendada (cron)

### 7. Configurações (`/settings`)
- Perfil do usuário (nome, email)
- Membros do tenant + role de cada um (Owner pode alterar)
- Conta Meta conectada (revogar acesso)

## Backend (Lovable Cloud / Supabase)

**Tabelas:**
- `clients` (id, name, status, meta_ad_account_id, meta_access_token, created_at)
- `campaigns` (id, client_id, meta_campaign_id, name, status, objective, spend, impressions, clicks, ctr, cpc, cpm, updated_at)
- `ad_sets` (id, campaign_id, meta_adset_id, name, status, spend, impressions, clicks)
- `ads` (id, ad_set_id, meta_ad_id, name, status, spend, impressions, clicks)
- `alerts` (id, name, client_id, metric, operator, threshold, is_active, created_at)
- `alert_events` (id, alert_id, triggered_at, metric_value, status, read)
- `user_roles` (id, user_id, role) — enum app_role: owner/admin/analyst/viewer
- `notifications` (id, user_id, type, title, body, read, created_at)

**RLS:** todas as tabelas com policies baseadas em autenticação + role via `has_role()` security definer (evita recursão).

**Edge functions:**
- `meta-oauth-callback` — recebe callback OAuth, troca code por access token de longa duração
- `meta-sync-campaigns` — sincroniza campanhas/adsets/ads de um cliente (chamada manual e via cron)
- `evaluate-alerts` — roda via cron a cada 15min, avalia regras ativas, insere `alert_events` e `notifications` quando dispara

## Integração Meta Ads (OAuth real)

Antes da implementação você precisará:
1. Criar um app no [Facebook Developers](https://developers.facebook.com/) (tipo Business)
2. Adicionar produto "Marketing API"
3. Configurar URL de redirect: `https://<seu-dominio>/auth/meta/callback`
4. Fornecer **App ID** e **App Secret** quando solicitado (serão salvos como secrets seguros no backend)

Escopos solicitados: `ads_read`, `ads_management`, `business_management`, `read_insights`

## Ordem de implementação

1. Tela de login/cadastro + auth + roles + layout com sidebar
2. Dashboard com dados mockados (KPIs, gráfico, tabela)
3. CRUD de Clientes
4. Schema Supabase + migração para todas as tabelas com RLS
5. Página de Campanhas com drill-down (mockado)
6. Página de Alertas (regras + histórico) com sino de notificações
7. Configurações
8. **Integração real Meta OAuth** + edge functions de sync e avaliação de alertas (após você criar o app na Meta)

Os passos 1–7 entregam um SaaS funcional navegável; o passo 8 conecta com dados reais da Meta.
