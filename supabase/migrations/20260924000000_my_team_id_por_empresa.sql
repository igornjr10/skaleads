-- As telas Financeiro e Time vieram do Scale Ads, onde o isolamento e por time
-- (profiles.team_id). Aqui o isolamento e por empresa (user_companies), entao o
-- "time" dessas telas passa a ser a empresa do usuario.
create or replace function public.my_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select uc.company_id
  from public.user_companies uc
  join public.companies c on c.id = uc.company_id
  where uc.user_id = auth.uid()
  order by c.created_at
  limit 1
$$;

revoke execute on function public.my_team_id() from public, anon;
grant execute on function public.my_team_id() to authenticated, service_role;
