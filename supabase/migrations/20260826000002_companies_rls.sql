-- Passo 3 de 3: virada do acesso por empresa.
--
-- NAO rode antes do backfill (20260826000001) — sem company_id preenchido os
-- clientes somem para todo mundo que nao e owner.
--
-- Regra: owner ve tudo; qualquer outro papel, inclusive admin, so ve os
-- clientes das empresas em que esta vinculado.
--
-- As tabelas filhas nao repetem a regra de empresa: elas se penduram em
-- `... in (select id from public.clients)`, e a RLS de clients tambem vale
-- dentro da subconsulta. Assim a regra mora num lugar so.
--
-- Para voltar atras, o estado anterior era, em todas as tabelas abaixo:
--   FOR SELECT TO authenticated USING (true)
--   FOR ALL    TO authenticated USING (public.is_admin_or_owner(auth.uid()))
--                               WITH CHECK (public.is_admin_or_owner(auth.uid()))

-- ── clients ──────────────────────────────────────────────────────────────────
drop policy if exists "Authenticated can view clients" on public.clients;
create policy "Members view company clients" on public.clients
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'owner')
    or company_id in (select public.my_company_ids())
  );

-- A policy antiga de gestao era FOR ALL sem filtro de empresa. Como as policies
-- se somam (OR), deixa-la de pe faria o admin continuar enxergando tudo.
drop policy if exists "Admins manage clients" on public.clients;
create policy "Admins manage company clients" on public.clients
  for all to authenticated
  using (
    public.is_admin_or_owner(auth.uid())
    and (public.has_role(auth.uid(), 'owner') or company_id in (select public.my_company_ids()))
  )
  with check (
    public.is_admin_or_owner(auth.uid())
    and (public.has_role(auth.uid(), 'owner') or company_id in (select public.my_company_ids()))
  );

-- ── tabelas filhas ───────────────────────────────────────────────────────────
do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('campaigns',              'Authenticated view campaigns',        'Admins manage campaigns',        'client_id in (select id from public.clients)'),
      ('ad_sets',                'Authenticated view adsets',           'Admins manage adsets',           'campaign_id in (select id from public.campaigns)'),
      ('ads',                    'Authenticated view ads',              'Admins manage ads',              'ad_set_id in (select id from public.ad_sets)'),
      ('ad_daily_metrics',       'Authenticated view ad metrics',       'Admins manage ad metrics',       'ad_id in (select id from public.ads)'),
      ('campaign_daily_metrics', 'Authenticated view metrics',          'Admins manage metrics',          'client_id in (select id from public.clients)'),
      ('alerts',                 'Authenticated view alerts',           'Admins manage alerts',           '(client_id is null or client_id in (select id from public.clients))'),
      ('alert_events',           'Authenticated view alert events',     'Admins manage alert events',     'alert_id in (select id from public.alerts)'),
      ('audit_runs',             'Authenticated view audit runs',       'Admins manage audit runs',       'client_id in (select id from public.clients)'),
      ('client_tasks',           'Authenticated can view client_tasks', 'Admins manage client_tasks',     'client_id in (select id from public.clients)'),
      ('creative_tasks',         'Authenticated can view creative_tasks','Admins manage creative_tasks',  'client_id in (select id from public.clients)'),
      ('creative_task_comments', 'Authenticated can view creative_comments', null,                        'task_id in (select id from public.creative_tasks)')
    ) as t(tabela, policy_select, policy_manage, escopo)
  loop
    if to_regclass('public.' || item.tabela) is null then
      continue;
    end if;

    execute format('drop policy if exists %I on public.%I', item.policy_select, item.tabela);
    execute format(
      'create policy %I on public.%I for select to authenticated using (%s)',
      item.policy_select, item.tabela, item.escopo
    );

    if item.policy_manage is not null then
      execute format('drop policy if exists %I on public.%I', item.policy_manage, item.tabela);
      execute format(
        'create policy %I on public.%I for all to authenticated using (%s) with check (%s)',
        item.policy_manage,
        item.tabela,
        'public.is_admin_or_owner(auth.uid()) and ' || item.escopo,
        'public.is_admin_or_owner(auth.uid()) and ' || item.escopo
      );
    end if;
  end loop;
end $$;

-- Conferencia: rode logado como um usuario nao-owner e confira que so vem os
-- clientes da empresa dele.
select c.name as cliente, e.name as empresa
from public.clients c
left join public.companies e on e.id = c.company_id
order by 2, 1;
