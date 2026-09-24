-- Quem ainda falta medir hoje.
--
-- A regra que importa esta no `or` do where. Sem ela, cliente que falha sempre
-- (conta sem papel na Pagina, token morto, ID de Instagram que nao existe mais)
-- nunca marca sucesso, volta em toda execucao e ocupa as vagas do lote para
-- sempre — os saudaveis do fim da fila nunca chegam a ser medidos. E o mesmo
-- problema do sync-meta-cron. Por isso a falha tambem grava a linha do dia: ela
-- fica com as metricas nulas e so volta a ser tentada 3 horas depois.
create or replace function public.clientes_instagram_pendentes(_limite integer default 12)
returns table (
  id uuid,
  name text,
  meta_instagram_account_id text,
  token text
)
language sql
security definer
set search_path to 'public'
as $$
  select
    c.id,
    c.name,
    c.meta_instagram_account_id,
    coalesce(c.meta_page_access_token, c.meta_access_token)
  from public.clients c
  left join public.client_instagram_daily d
    on d.client_id = c.id
   and d.date = current_date
  where c.status = 'active'
    and c.meta_instagram_account_id is not null
    and coalesce(c.meta_page_access_token, c.meta_access_token) is not null
    and (
      d.client_id is null
      or (d.followers_total is null and d.captured_at < now() - interval '3 hours')
    )
  order by d.captured_at nulls first, c.name
  limit _limite;
$$;

revoke all on function public.clientes_instagram_pendentes(integer) from public, anon, authenticated;
grant execute on function public.clientes_instagram_pendentes(integer) to service_role;
