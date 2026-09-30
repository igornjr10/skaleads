-- Isolamento por empresa em tudo que ainda vazava.
--
-- As tabelas de midia (campaigns, ads, metricas...) ja filtram por
-- `client_id in (select id from clients)`, e a leitura de clients e escopada
-- por empresa — entao elas herdam o isolamento. O que sobrava eram policies
-- `using (true)` e `is_admin_or_owner()` sozinho: o admin de uma empresa lia,
-- alterava e apagava tarefas, rotinas, contratos, gestores, cerebro etc. da
-- outra. Com uma segunda agencia no banco, isso e vazamento direto.
--
-- Regra daqui em diante: toda linha pertence a uma empresa, pelo cliente
-- (can_access_client) ou por company_id proprio quando pode existir sem
-- cliente (tarefa interna, gestor, nota do cerebro, contrato nao vinculado).

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Usada pelas Edge Functions (_shared/auth.ts ownsClient), que rodam com
-- service_role e por isso nao passam pela RLS de clients. Nao existia neste
-- banco: o chat com cliente selecionado e o Reportei respondiam sempre 404.
create or replace function public.user_can_access_client(_user_id uuid, _client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients c
    join public.user_companies uc on uc.company_id = c.company_id
    where c.id = _client_id and uc.user_id = _user_id
  )
$$;
revoke execute on function public.user_can_access_client(uuid, uuid) from public, anon, authenticated;
grant execute on function public.user_can_access_client(uuid, uuid) to service_role;

-- Empresa de quem esta gravando. Insert feito por Edge Function (service_role,
-- sem auth.uid) so cai numa empresa quando o banco tem uma so; com mais de uma
-- fica null e a linha nao aparece para ninguem, em vez de aparecer para todos.
create or replace function public.default_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.my_team_id(),
    (select id from public.companies where (select count(*) from public.companies) = 1)
  )
$$;
grant execute on function public.default_company_id() to authenticated, service_role;

create or replace function public.shares_company(_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_companies a
    join public.user_companies b on b.company_id = a.company_id
    where a.user_id = auth.uid() and b.user_id = _other
  )
$$;
revoke execute on function public.shares_company(uuid) from public, anon;
grant execute on function public.shares_company(uuid) to authenticated, service_role;

create or replace function public.is_my_company(_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _company_id is not null
     and _company_id in (select public.my_company_ids())
$$;
revoke execute on function public.is_my_company(uuid) from public, anon;
grant execute on function public.is_my_company(uuid) to authenticated, service_role;

-- ── company_id nas tabelas que existem sem cliente ───────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'rotinas', 'contratos', 'alerts', 'managers',
                           'cerebro_notas', 'whatsapp_scheduled_messages']
  loop
    execute format(
      'alter table public.%I add column if not exists company_id uuid references public.companies(id) on delete cascade',
      t);
    execute format('alter table public.%I alter column company_id set default public.default_company_id()', t);
    execute format('create index if not exists %I on public.%I (company_id)', t || '_company_idx', t);
  end loop;
end $$;

-- Backfill: primeiro pelo cliente, depois por quem criou, e por fim a empresa
-- unica quando so existe uma.
update public.tasks x set company_id = c.company_id
  from public.clients c where x.company_id is null and c.id = x.client_id;
update public.rotinas x set company_id = c.company_id
  from public.clients c where x.company_id is null and c.id = x.client_id;
update public.contratos x set company_id = c.company_id
  from public.clients c where x.company_id is null and c.id = x.client_id;
update public.alerts x set company_id = c.company_id
  from public.clients c where x.company_id is null and c.id = x.client_id;

update public.tasks x set company_id = uc.company_id
  from public.user_companies uc where x.company_id is null and uc.user_id = x.created_by;
update public.rotinas x set company_id = uc.company_id
  from public.user_companies uc where x.company_id is null and uc.user_id = x.created_by;
update public.alerts x set company_id = uc.company_id
  from public.user_companies uc where x.company_id is null and uc.user_id = x.created_by;
update public.whatsapp_scheduled_messages x set company_id = uc.company_id
  from public.user_companies uc where x.company_id is null and uc.user_id = x.created_by;

do $$
declare
  unica uuid;
  t text;
begin
  select id into unica from public.companies where (select count(*) from public.companies) = 1;
  if unica is null then return; end if;
  foreach t in array array['tasks', 'rotinas', 'contratos', 'alerts', 'managers',
                           'cerebro_notas', 'whatsapp_scheduled_messages']
  loop
    execute format('update public.%I set company_id = $1 where company_id is null', t) using unica;
  end loop;
end $$;

-- Quando a linha tem cliente, a empresa e a do cliente — nunca a que veio do
-- frontend. Impede gravar uma tarefa "da empresa B" apontando cliente da A.
create or replace function public.company_from_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_id is not null then
    select c.company_id into new.company_id from public.clients c where c.id = new.client_id;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'rotinas', 'contratos', 'alerts']
  loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_company', t);
    execute format(
      'create trigger %I before insert or update of client_id on public.%I for each row execute function public.company_from_client()',
      'trg_' || t || '_company', t);
  end loop;
end $$;

-- ── Policies ─────────────────────────────────────────────────────────────────

-- Tabelas penduradas em cliente: le quem enxerga o cliente, gerencia o admin
-- que enxerga o cliente.

drop policy if exists "Admin le arquivo de verba" on public._arquivo_monthly_budget;
create policy "Admin le arquivo de verba" on public._arquivo_monthly_budget
  for select to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.can_access_client(client_id));

drop policy if exists "Authenticated view breakdowns" on public.ad_breakdowns;
drop policy if exists "Admins manage breakdowns" on public.ad_breakdowns;
create policy "Company view breakdowns" on public.ad_breakdowns
  for select to authenticated using (public.can_access_client(client_id));
create policy "Company admins manage breakdowns" on public.ad_breakdowns
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.can_access_client(client_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.can_access_client(client_id));

drop policy if exists "Authenticated view ai_usage_logs" on public.ai_usage_logs;
create policy "Company view ai_usage_logs" on public.ai_usage_logs
  for select to authenticated using (client_id is not null and public.can_access_client(client_id));

drop policy if exists "Authenticated view copy_generations" on public.copy_generations;
create policy "Company view copy_generations" on public.copy_generations
  for select to authenticated using (public.can_access_client(client_id));

drop policy if exists "Authenticated can view client_compromissos" on public.client_compromissos;
drop policy if exists "Authenticated registra compromisso" on public.client_compromissos;
drop policy if exists "Authenticated corrige compromisso" on public.client_compromissos;
drop policy if exists "Admin apaga compromisso" on public.client_compromissos;
create policy "Company view client_compromissos" on public.client_compromissos
  for select to authenticated using (public.can_access_client(client_id));
create policy "Company registra compromisso" on public.client_compromissos
  for insert to authenticated with check (public.can_access_client(client_id));
create policy "Company corrige compromisso" on public.client_compromissos
  for update to authenticated
  using (public.can_access_client(client_id)) with check (public.can_access_client(client_id));
create policy "Company admin apaga compromisso" on public.client_compromissos
  for delete to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.can_access_client(client_id));

drop policy if exists "Authenticated read funding events" on public.client_funding_events;
drop policy if exists "Authenticated write funding events" on public.client_funding_events;
drop policy if exists "Admin apaga funding events" on public.client_funding_events;
create policy "Company read funding events" on public.client_funding_events
  for select to authenticated using (public.can_access_client(client_id));
create policy "Company write funding events" on public.client_funding_events
  for insert to authenticated with check (public.can_access_client(client_id));
create policy "Company admin apaga funding events" on public.client_funding_events
  for delete to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.can_access_client(client_id));

drop policy if exists "instagram_daily_admin" on public.client_instagram_daily;
create policy "instagram_daily_admin" on public.client_instagram_daily
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.can_access_client(client_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.can_access_client(client_id));

drop policy if exists "Authenticated le resumos de grupo" on public.grupo_resumos;
drop policy if exists "Admin apaga resumos de grupo" on public.grupo_resumos;
create policy "Company le resumos de grupo" on public.grupo_resumos
  for select to authenticated using (public.can_access_client(client_id));
create policy "Company admin apaga resumos de grupo" on public.grupo_resumos
  for delete to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.can_access_client(client_id));

-- Tabelas com company_id proprio.

drop policy if exists "Authenticated can view tasks" on public.tasks;
drop policy if exists "Admins manage tasks" on public.tasks;
drop policy if exists "Responsavel atualiza propria tarefa" on public.tasks;
create policy "Company view tasks" on public.tasks
  for select to authenticated using (public.is_my_company(company_id));
create policy "Company admins manage tasks" on public.tasks
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id));
create policy "Responsavel atualiza propria tarefa" on public.tasks
  for update to authenticated
  using (assigned_to = auth.uid() and public.is_my_company(company_id))
  with check (assigned_to = auth.uid() and public.is_my_company(company_id));

drop policy if exists "Authenticated can view rotinas" on public.rotinas;
drop policy if exists "Admins manage rotinas" on public.rotinas;
create policy "Company view rotinas" on public.rotinas
  for select to authenticated using (public.is_my_company(company_id));
create policy "Company admins manage rotinas" on public.rotinas
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id));

-- Baixa de rotina: o admin so baixa rotina da propria empresa.
create or replace function public.pode_executar_rotina(_rotina_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rotinas r
    where r.id = _rotina_id
      and r.company_id in (select public.my_company_ids())
      and (r.assigned_to = auth.uid() or public.is_admin_or_owner(auth.uid()))
  )
$$;

drop policy if exists "Authenticated can view rotina_execucoes" on public.rotina_execucoes;
drop policy if exists "Admin apaga baixa" on public.rotina_execucoes;
create policy "Company view rotina_execucoes" on public.rotina_execucoes
  for select to authenticated
  using (exists (select 1 from public.rotinas r where r.id = rotina_id));
create policy "Company admin apaga baixa" on public.rotina_execucoes
  for delete to authenticated
  using (public.is_admin_or_owner(auth.uid()) and exists (select 1 from public.rotinas r where r.id = rotina_id));

drop policy if exists "contratos_time_le" on public.contratos;
drop policy if exists "contratos_time_vincula" on public.contratos;
drop policy if exists "contratos_admin" on public.contratos;
create policy "contratos_empresa_le" on public.contratos
  for select to authenticated using (public.is_my_company(company_id));
create policy "contratos_empresa_vincula" on public.contratos
  for update to authenticated
  using (public.is_my_company(company_id))
  with check (public.is_my_company(company_id) and (client_id is null or public.can_access_client(client_id)));
create policy "contratos_empresa_admin" on public.contratos
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id));

drop policy if exists "Authenticated view alerts" on public.alerts;
drop policy if exists "Admins manage alerts" on public.alerts;
create policy "Company view alerts" on public.alerts
  for select to authenticated
  using (public.is_my_company(company_id) and (client_id is null or public.can_access_client(client_id)));
create policy "Company admins manage alerts" on public.alerts
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id)
              and (client_id is null or public.can_access_client(client_id)));

drop policy if exists "Authenticated read managers" on public.managers;
drop policy if exists "Authenticated view managers" on public.managers;
drop policy if exists "Admins manage managers" on public.managers;
create policy "Company view managers" on public.managers
  for select to authenticated using (public.is_my_company(company_id));
create policy "Company admins manage managers" on public.managers
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id));

drop policy if exists "Authenticated read cerebro" on public.cerebro_notas;
drop policy if exists "Admins write cerebro" on public.cerebro_notas;
create policy "Company read cerebro" on public.cerebro_notas
  for select to authenticated using (public.is_my_company(company_id));
create policy "Company admins write cerebro" on public.cerebro_notas
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id));

drop policy if exists "Admins manage whatsapp scheduled messages" on public.whatsapp_scheduled_messages;
create policy "Company admins manage whatsapp scheduled messages" on public.whatsapp_scheduled_messages
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id));

-- Comentarios seguem a tarefa: a subconsulta passa pela RLS da tarefa.

drop policy if exists "Authenticated can view task_comments" on public.task_comments;
drop policy if exists "Autor ou admin apaga observacao" on public.task_comments;
create policy "Company view task_comments" on public.task_comments
  for select to authenticated using (exists (select 1 from public.tasks t where t.id = task_id));
create policy "Autor ou admin apaga observacao" on public.task_comments
  for delete to authenticated
  using (autor_id = auth.uid()
         or (public.is_admin_or_owner(auth.uid()) and exists (select 1 from public.tasks t where t.id = task_id)));

drop policy if exists "Authenticated can view creative_comments" on public.creative_task_comments;
drop policy if exists "Autor ou admin apaga comentario" on public.creative_task_comments;
create policy "Company view creative_comments" on public.creative_task_comments
  for select to authenticated using (exists (select 1 from public.creative_tasks t where t.id = task_id));
create policy "Autor ou admin apaga comentario" on public.creative_task_comments
  for delete to authenticated
  using (autor_id = auth.uid()
         or (public.is_admin_or_owner(auth.uid()) and exists (select 1 from public.creative_tasks t where t.id = task_id)));

-- Pessoas: cada um ve a si mesmo e quem divide empresa com ele. O owner da
-- plataforma continua vendo todos (e quem administra empresas e vinculos).

drop policy if exists "Profiles viewable by authenticated" on public.profiles;
create policy "Profiles da mesma empresa" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_company(id) or public.has_role(auth.uid(), 'owner'));

drop policy if exists "Users can view all roles" on public.user_roles;
create policy "Roles da mesma empresa" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.shares_company(user_id) or public.has_role(auth.uid(), 'owner'));

-- Qualquer logado podia criar notificacao no sino de qualquer usuario.
drop policy if exists "System inserts notifications" on public.notifications;
create policy "Notifica a si ou a mesma empresa" on public.notifications
  for insert to authenticated
  with check (user_id = auth.uid() or public.shares_company(user_id));

-- Logs de sistema e cache de IA nao sao dado de empresa nenhuma.
drop policy if exists "Authenticated view automation runs" on public.automation_runs;
create policy "Owner view automation runs" on public.automation_runs
  for select to authenticated using (public.has_role(auth.uid(), 'owner'));

drop policy if exists "Authenticated view ai_cache" on public.ai_cache;
revoke select on public.ai_cache from authenticated;

-- Logo e gravado pela Edge Function sync-client-logo (service_role). Com a
-- policy de admin, qualquer admin sobrescrevia o logo de cliente de outra
-- empresa; a leitura publica continua.
drop policy if exists "Admins manage client logos" on storage.objects;

notify pgrst, 'reload schema';
