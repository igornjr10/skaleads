-- Multi-tenant: cada usuario passa a ter a propria carteira de clientes.
--
-- Antes, clients tinha policy de SELECT "USING (true)" e nenhuma coluna de
-- dono: quem logasse via a carteira inteira, e as 27 contas vindas do seed
-- (20260428000006_clients_gallery_seed) apareciam para qualquer usuario novo.
--
-- Agora clients.owner_id manda em tudo. As tabelas filhas (campanhas, ads,
-- metricas, auditorias, alertas) herdam a posse pelo caminho do client_id.

-- ── 1. Limpa o seed ───────────────────────────────────────────────────────────
-- As FKs sao on delete cascade: campanhas, metricas e relatorios ligados a esses
-- clientes vao junto, que e o que se quer aqui.
delete from public.clients
where name in (
    'ESPETO DO XANDY'
  , 'JJ VEICULOS'
  , 'GIRO VEICULOS'
  , 'BRASEIRO BOM SABOR'
  , 'ATACAREJO ITZ'
  , 'KS BOUTIQUE'
  , 'RANCHO DO OLEIRO'
  , 'CDN MAGAZINE'
  , 'PRATOS PIZZARIA'
  , 'DR LUDMYLA'
  , 'LUCENA MENSWEAR'
  , 'GERSON CHEVROLET'
  , 'MOTO GARAGEM'
  , 'GR PHONE'
  , 'FABIO VEICULOS'
  , 'VIP CAR'
  , 'DIVAS FASHION'
  , 'BRANDAO VEICULOS'
  , 'MB FASHION'
  , 'CM CLOSET'
  , 'DONNAS COXINHA'
  , 'WALLYSON MOTOCA'
  , 'PILARES DO DIREITO'
  , 'REALIZE MOTORS'
  , 'STYLUS VITTA'
  , 'LEANDRO DESPACHANTE'
  , 'JH IMPORTS'
);

-- ── 2. Dono ───────────────────────────────────────────────────────────────────
alter table public.clients
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- Cliente cadastrado antes desta migration fica com o owner da plataforma (o
-- primeiro usuario); sem isso ficaria invisivel para todo mundo.
update public.clients
set owner_id = (
  select user_id from public.user_roles where role = 'owner' order by created_at limit 1
)
where owner_id is null;

create index if not exists idx_clients_owner on public.clients(owner_id);

-- ── 3. Helpers de posse ───────────────────────────────────────────────────────
-- SECURITY DEFINER para a policy de campaigns poder consultar clients sem
-- disparar a RLS de clients de novo (recursao).

create or replace function public.owns_client(_client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clients c
    where c.id = _client_id and c.owner_id = auth.uid()
  )
$$;

create or replace function public.owns_campaign(_campaign_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.campaigns cp
    join public.clients c on c.id = cp.client_id
    where cp.id = _campaign_id and c.owner_id = auth.uid()
  )
$$;

create or replace function public.owns_ad_set(_ad_set_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ad_sets s
    join public.campaigns cp on cp.id = s.campaign_id
    join public.clients c on c.id = cp.client_id
    where s.id = _ad_set_id and c.owner_id = auth.uid()
  )
$$;

create or replace function public.owns_ad(_ad_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ads a
    join public.ad_sets s on s.id = a.ad_set_id
    join public.campaigns cp on cp.id = s.campaign_id
    join public.clients c on c.id = cp.client_id
    where a.id = _ad_id and c.owner_id = auth.uid()
  )
$$;

create or replace function public.owns_alert(_alert_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.alerts al
    where al.id = _alert_id
      and (public.owns_client(al.client_id) or al.tenant_id = auth.uid())
  )
$$;

-- ── 4. Policies ───────────────────────────────────────────────────────────────

-- clients
drop policy if exists "Authenticated can view clients" on public.clients;
drop policy if exists "Admins manage clients" on public.clients;

create policy "clients_select_own" on public.clients
  for select to authenticated using (owner_id = auth.uid());
create policy "clients_insert_own" on public.clients
  for insert to authenticated with check (owner_id = auth.uid());
create policy "clients_update_own" on public.clients
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "clients_delete_own" on public.clients
  for delete to authenticated using (owner_id = auth.uid());

grant select, insert, update, delete on public.clients to authenticated;

-- campaigns
drop policy if exists "Authenticated view campaigns" on public.campaigns;
drop policy if exists "Admins manage campaigns" on public.campaigns;
create policy "campaigns_own" on public.campaigns
  for all to authenticated
  using (public.owns_client(client_id))
  with check (public.owns_client(client_id));

-- ad_sets
drop policy if exists "Authenticated view adsets" on public.ad_sets;
drop policy if exists "Admins manage adsets" on public.ad_sets;
create policy "ad_sets_own" on public.ad_sets
  for all to authenticated
  using (public.owns_campaign(campaign_id))
  with check (public.owns_campaign(campaign_id));

-- ads
drop policy if exists "Authenticated view ads" on public.ads;
drop policy if exists "Admins manage ads" on public.ads;
create policy "ads_own" on public.ads
  for all to authenticated
  using (public.owns_ad_set(ad_set_id))
  with check (public.owns_ad_set(ad_set_id));

-- campaign_daily_metrics
drop policy if exists "Authenticated view metrics" on public.campaign_daily_metrics;
drop policy if exists "Admins manage metrics" on public.campaign_daily_metrics;
create policy "campaign_daily_metrics_own" on public.campaign_daily_metrics
  for all to authenticated
  using (public.owns_client(client_id))
  with check (public.owns_client(client_id));

-- ad_daily_metrics
drop policy if exists "Authenticated view ad metrics" on public.ad_daily_metrics;
drop policy if exists "Admins manage ad metrics" on public.ad_daily_metrics;
create policy "ad_daily_metrics_own" on public.ad_daily_metrics
  for all to authenticated
  using (public.owns_ad(ad_id))
  with check (public.owns_ad(ad_id));

-- ad_breakdowns
drop policy if exists "Authenticated view breakdowns" on public.ad_breakdowns;
drop policy if exists "Admins manage breakdowns" on public.ad_breakdowns;
create policy "ad_breakdowns_own" on public.ad_breakdowns
  for all to authenticated
  using (public.owns_client(client_id))
  with check (public.owns_client(client_id));

-- audit_runs
drop policy if exists "Authenticated view audit runs" on public.audit_runs;
drop policy if exists "Admins manage audit runs" on public.audit_runs;
create policy "audit_runs_own" on public.audit_runs
  for all to authenticated
  using (public.owns_client(client_id))
  with check (public.owns_client(client_id));

-- copy_generations
drop policy if exists "Authenticated view copy_generations" on public.copy_generations;
create policy "copy_generations_own" on public.copy_generations
  for select to authenticated using (public.owns_client(client_id));

-- alerts
drop policy if exists "Authenticated view alerts" on public.alerts;
drop policy if exists "Admins manage alerts" on public.alerts;
create policy "alerts_own" on public.alerts
  for all to authenticated
  using (public.owns_client(client_id) or tenant_id = auth.uid())
  with check (public.owns_client(client_id) or tenant_id = auth.uid());

-- alert_events
drop policy if exists "Authenticated view alert events" on public.alert_events;
drop policy if exists "Admins manage alert events" on public.alert_events;
create policy "alert_events_own" on public.alert_events
  for all to authenticated
  using (public.owns_alert(alert_id))
  with check (public.owns_alert(alert_id));

-- managers: ganham dono (sao contatos da agencia, nao da plataforma)
alter table public.managers
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;
update public.managers
set owner_id = (
  select user_id from public.user_roles where role = 'owner' order by created_at limit 1
)
where owner_id is null;

drop policy if exists "Admins manage managers" on public.managers;
create policy "managers_own" on public.managers
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- whatsapp_scheduled_messages: ja tinha created_by
drop policy if exists "Admins manage whatsapp scheduled messages" on public.whatsapp_scheduled_messages;
create policy "whatsapp_scheduled_messages_own" on public.whatsapp_scheduled_messages
  for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- automation_runs: log do cron, e o summary traz nome de cliente. So o dono da
-- plataforma enxerga.
drop policy if exists "Authenticated view automation runs" on public.automation_runs;
create policy "automation_runs_platform_owner" on public.automation_runs
  for select to authenticated using (public.has_role(auth.uid(), 'owner'));

-- profiles e user_roles: antes todo mundo via o email e o papel de todo mundo.
-- Cada um ve o proprio; o dono da plataforma ve todos porque a tela de
-- Configuracoes gerencia a equipe.
drop policy if exists "Profiles viewable by authenticated" on public.profiles;
create policy "profiles_self_or_platform_owner" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'owner'));

drop policy if exists "Users can view all roles" on public.user_roles;
create policy "user_roles_self_or_platform_owner" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'owner'));

-- ── 5. Usuario novo nasce dono do proprio espaco ──────────────────────────────
-- Antes virava 'viewer' e caia numa UI so de leitura. Como a carteira agora e
-- isolada por owner_id, 'admin' aqui significa "gerencia o que e meu" — nao da
-- acesso a nada de outro usuario.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  user_count int;
begin
  select count(*) into user_count from auth.users;
  if user_count <= 1 then
    insert into public.user_roles (user_id, role) values (new.id, 'owner');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end;
$$;
