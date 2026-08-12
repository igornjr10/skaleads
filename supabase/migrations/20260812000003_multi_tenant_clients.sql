-- Isolamento por time.
--
-- O que existe hoje em producao: 58 clientes, 47 com conta Meta conectada, e
-- uma equipe de 5 pessoas trabalhando em cima deles (uma delas com 371
-- relatorios gerados). A policy de clients e "USING (true)", entao qualquer
-- cadastro novo cai dentro dessa carteira.
--
-- O modelo aqui NAO e um dono por cliente: e um time por carteira. Todo mundo
-- que ja usa o sistema continua enxergando os 58 clientes e os que criar dali
-- pra frente; quem se cadastrar de agora em diante nasce num time proprio, com
-- a tela vazia, e cadastra a BM dele sem ver nada dos outros.
--
-- Nada e apagado por esta migration.

-- ── 1. Time ──────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists team_id uuid;

alter table public.clients
  add column if not exists team_id uuid;

do $$
declare
  time_da_casa uuid;
begin
  select user_id into time_da_casa
  from public.user_roles where role = 'owner' order by created_at limit 1;

  if time_da_casa is null then
    raise exception 'Nenhum usuario com role owner: sem isso nao da para definir o time da casa';
  end if;

  -- Quem ja usava o sistema entra no time da casa. O corte e a data em que a
  -- separacao passou a existir: cadastro feito a partir daqui nasce isolado.
  update public.profiles p
  set team_id = time_da_casa
  where p.team_id is null
    and p.created_at < timestamptz '2026-08-12 00:00:00+00';

  -- Cadastro recente (inclusive o de teste feito hoje) vira o proprio time.
  update public.profiles
  set team_id = id
  where team_id is null;

  -- Os 58 clientes que ja existem sao da casa.
  update public.clients
  set team_id = time_da_casa
  where team_id is null;
end $$;

create index if not exists idx_clients_team on public.clients(team_id);
create index if not exists idx_profiles_team on public.profiles(team_id);

-- ── 2. Helpers ───────────────────────────────────────────────────────────────
-- SECURITY DEFINER para a policy de clients poder ler profiles sem recair na
-- RLS de profiles (recursao).

create or replace function public.my_team_id()
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from public.profiles where id = auth.uid()
$$;

create or replace function public.can_access_client(_client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clients c
    where c.id = _client_id
      and c.team_id is not null
      and c.team_id = public.my_team_id()
  )
$$;

-- Versao para as Edge Functions, que rodam com service_role (sem auth.uid()).
create or replace function public.user_can_access_client(_user_id uuid, _client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.clients c
    join public.profiles p on p.id = _user_id
    where c.id = _client_id
      and c.team_id is not null
      and c.team_id = p.team_id
  )
$$;

grant execute on function public.user_can_access_client(uuid, uuid) to service_role;

create or replace function public.can_access_campaign(_campaign_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.campaigns cp
    where cp.id = _campaign_id and public.can_access_client(cp.client_id)
  )
$$;

create or replace function public.can_access_ad_set(_ad_set_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ad_sets s
    where s.id = _ad_set_id and public.can_access_campaign(s.campaign_id)
  )
$$;

create or replace function public.can_access_ad(_ad_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ads a
    where a.id = _ad_id and public.can_access_ad_set(a.ad_set_id)
  )
$$;

create or replace function public.can_access_alert(_alert_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.alerts al
    where al.id = _alert_id
      and (public.can_access_client(al.client_id) or al.tenant_id = auth.uid())
  )
$$;

-- Cliente novo nasce no time de quem criou, sem o frontend precisar mandar nada.
create or replace function public.set_client_team()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.team_id is null then
    new.team_id := public.my_team_id();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_set_team on public.clients;
create trigger trg_clients_set_team
  before insert on public.clients
  for each row execute function public.set_client_team();

-- ── 3. Policies ──────────────────────────────────────────────────────────────

-- clients
drop policy if exists "Authenticated can view clients" on public.clients;
drop policy if exists "Admins manage clients" on public.clients;

create policy "clients_select_team" on public.clients
  for select to authenticated using (team_id = public.my_team_id());
create policy "clients_insert_team" on public.clients
  for insert to authenticated with check (team_id is null or team_id = public.my_team_id());
create policy "clients_update_team" on public.clients
  for update to authenticated
  using (team_id = public.my_team_id()) with check (team_id = public.my_team_id());
create policy "clients_delete_team" on public.clients
  for delete to authenticated using (team_id = public.my_team_id());

grant select, insert, update, delete on public.clients to authenticated;

-- campaigns
drop policy if exists "Authenticated view campaigns" on public.campaigns;
drop policy if exists "Admins manage campaigns" on public.campaigns;
create policy "campaigns_team" on public.campaigns
  for all to authenticated
  using (public.can_access_client(client_id))
  with check (public.can_access_client(client_id));

-- ad_sets
drop policy if exists "Authenticated view adsets" on public.ad_sets;
drop policy if exists "Admins manage adsets" on public.ad_sets;
create policy "ad_sets_team" on public.ad_sets
  for all to authenticated
  using (public.can_access_campaign(campaign_id))
  with check (public.can_access_campaign(campaign_id));

-- ads
drop policy if exists "Authenticated view ads" on public.ads;
drop policy if exists "Admins manage ads" on public.ads;
create policy "ads_team" on public.ads
  for all to authenticated
  using (public.can_access_ad_set(ad_set_id))
  with check (public.can_access_ad_set(ad_set_id));

-- campaign_daily_metrics
drop policy if exists "Authenticated view metrics" on public.campaign_daily_metrics;
drop policy if exists "Admins manage metrics" on public.campaign_daily_metrics;
create policy "campaign_daily_metrics_team" on public.campaign_daily_metrics
  for all to authenticated
  using (public.can_access_client(client_id))
  with check (public.can_access_client(client_id));

-- ad_daily_metrics
drop policy if exists "Authenticated view ad metrics" on public.ad_daily_metrics;
drop policy if exists "Admins manage ad metrics" on public.ad_daily_metrics;
create policy "ad_daily_metrics_team" on public.ad_daily_metrics
  for all to authenticated
  using (public.can_access_ad(ad_id))
  with check (public.can_access_ad(ad_id));

-- ad_breakdowns
drop policy if exists "Authenticated view breakdowns" on public.ad_breakdowns;
drop policy if exists "Admins manage breakdowns" on public.ad_breakdowns;
create policy "ad_breakdowns_team" on public.ad_breakdowns
  for all to authenticated
  using (public.can_access_client(client_id))
  with check (public.can_access_client(client_id));

-- audit_runs
drop policy if exists "Authenticated view audit runs" on public.audit_runs;
drop policy if exists "Admins manage audit runs" on public.audit_runs;
create policy "audit_runs_team" on public.audit_runs
  for all to authenticated
  using (public.can_access_client(client_id))
  with check (public.can_access_client(client_id));

-- copy_generations: a migration 20260428000001_ai_tables nunca chegou a rodar
-- em producao (a tabela nao existe la), entao o bloco e condicional.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'copy_generations'
  ) then
    drop policy if exists "Authenticated view copy_generations" on public.copy_generations;
    create policy "copy_generations_team" on public.copy_generations
      for select to authenticated using (public.can_access_client(client_id));
  end if;
end $$;

-- alerts
drop policy if exists "Authenticated view alerts" on public.alerts;
drop policy if exists "Admins manage alerts" on public.alerts;
create policy "alerts_team" on public.alerts
  for all to authenticated
  using (public.can_access_client(client_id) or tenant_id = auth.uid())
  with check (public.can_access_client(client_id) or tenant_id = auth.uid());

-- alert_events
drop policy if exists "Authenticated view alert events" on public.alert_events;
drop policy if exists "Admins manage alert events" on public.alert_events;
create policy "alert_events_team" on public.alert_events
  for all to authenticated
  using (public.can_access_alert(alert_id))
  with check (public.can_access_alert(alert_id));

-- managers: contatos da agencia, seguem o time
alter table public.managers
  add column if not exists team_id uuid;
update public.managers
set team_id = (select user_id from public.user_roles where role = 'owner' order by created_at limit 1)
where team_id is null;

drop policy if exists "Admins manage managers" on public.managers;
create policy "managers_team" on public.managers
  for all to authenticated
  using (team_id = public.my_team_id())
  with check (team_id is null or team_id = public.my_team_id());

-- whatsapp_scheduled_messages: instancia unica da agencia, fica no time da casa
drop policy if exists "Admins manage whatsapp scheduled messages" on public.whatsapp_scheduled_messages;
create policy "whatsapp_scheduled_messages_team" on public.whatsapp_scheduled_messages
  for all to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = created_by and p.team_id = public.my_team_id()
    )
  )
  with check (created_by = auth.uid());

-- automation_runs: log do cron, com nome de cliente no summary. So o dono da
-- plataforma enxerga.
drop policy if exists "Authenticated view automation runs" on public.automation_runs;
create policy "automation_runs_platform_owner" on public.automation_runs
  for select to authenticated using (public.has_role(auth.uid(), 'owner'));

-- profiles e user_roles: antes todo mundo via o email e o papel de todo mundo,
-- inclusive de outros times. Agora e o proprio, o time e o dono da plataforma
-- (que gerencia a equipe na tela de Configuracoes).
drop policy if exists "Profiles viewable by authenticated" on public.profiles;
create policy "profiles_team_or_platform_owner" on public.profiles
  for select to authenticated
  using (id = auth.uid() or team_id = public.my_team_id() or public.has_role(auth.uid(), 'owner'));

drop policy if exists "Users can view all roles" on public.user_roles;
create policy "user_roles_self_or_platform_owner" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'owner'));

-- ── 4. Cadastro novo nasce no proprio time ───────────────────────────────────
create or replace function public.handle_new_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- team_id = id: o usuario e o time dele mesmo ate alguem move-lo para outro.
  insert into public.profiles (id, email, full_name, team_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.id
  );
  return new;
end;
$$;

-- Antes virava 'viewer', que cai numa UI so de leitura e nao consegue cadastrar
-- a propria BM. Como a carteira agora e isolada por time, 'admin' aqui significa
-- "gerencia o que e do meu time" e nao da acesso a nada dos outros.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
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
