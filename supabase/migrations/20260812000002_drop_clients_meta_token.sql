-- ATENCAO: rode esta migration SO DEPOIS de:
--   1. deployar as Edge Functions meta-proxy, meta-store-token e a versao nova
--      de sync-meta-cron;
--   2. o frontend novo estar publicado no Vercel.
-- Ate aqui o token continua duplicado (clients + client_secrets) e nada quebra
-- se precisar reverter. Este drop e o passo que fecha de fato o vazamento.

do $$
declare
  sem_cofre int;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'meta_access_token'
  ) then
    raise notice 'Coluna ja removida, nada a fazer';
    return;
  end if;

  -- Ninguem pode ficar com token so na tabela antiga.
  select count(*) into sem_cofre
  from public.clients c
  where c.meta_access_token is not null
    and btrim(c.meta_access_token) <> ''
    and not exists (
      select 1 from public.client_secrets s
      where s.client_id = c.id
        and s.meta_access_token is not null
        and btrim(s.meta_access_token) <> ''
    );

  if sem_cofre > 0 then
    raise exception '% cliente(s) com token fora do cofre — rode a migration 20260812000001 antes', sem_cofre;
  end if;

  alter table public.clients drop column meta_access_token;
end $$;
