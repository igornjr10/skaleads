-- ATENCAO: rode SO DEPOIS de:
--   1. deployar meta-proxy, meta-store-token, sync-meta-cron e sync-client-logo;
--   2. o frontend novo estar publicado no Vercel.
-- Ate aqui o token continua duplicado (clients + client_secrets) e o frontend
-- antigo segue funcionando. Este drop e o passo que fecha o vazamento.

do $$
declare
  fora int;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'meta_access_token'
  ) then
    raise notice 'Colunas ja removidas, nada a fazer';
    return;
  end if;

  -- Ninguem pode ficar com token so na tabela antiga.
  select count(*) into fora
  from public.clients c
  left join public.client_secrets s on s.client_id = c.id
  where (nullif(btrim(c.meta_access_token), '') is not null and s.meta_access_token is null)
     or (nullif(btrim(c.meta_page_access_token), '') is not null and s.meta_page_access_token is null);

  if fora > 0 then
    raise exception '% cliente(s) com token fora do cofre: rode 20261005000000 antes', fora;
  end if;

  alter table public.clients drop column meta_access_token;
  alter table public.clients drop column if exists meta_page_access_token;
end $$;
