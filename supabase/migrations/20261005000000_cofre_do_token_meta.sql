-- Tira os tokens da Meta do alcance do browser (de novo).
--
-- O cofre nasceu em 20260812000001, mas a instancia Midsam (ec50b75) trouxe o
-- codigo da ad-campaign-hub, que voltou a ler clients.meta_access_token no
-- browser e chamar a Graph API de la: qualquer membro com o cliente na carteira
-- extraia o token e controlava a conta de anuncio fora do sistema.
--
-- Agora os dois tokens (conta e Pagina) vivem em client_secrets, sem grant para
-- anon nem authenticated. O browser chama a Meta pela Edge Function meta-proxy
-- e grava token novo por meta-store-token.
--
-- Esta migration so COPIA. O drop das colunas antigas fica em 20261005000001,
-- que so pode rodar depois do frontend novo no ar.

create table if not exists public.client_secrets (
  client_id uuid primary key references public.clients(id) on delete cascade,
  meta_access_token text,
  updated_at timestamptz not null default now()
);

alter table public.client_secrets add column if not exists meta_page_access_token text;

alter table public.client_secrets enable row level security;
revoke all on public.client_secrets from anon, authenticated;
grant all on public.client_secrets to service_role;

alter table public.clients
  add column if not exists meta_token_configured boolean not null default false;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'meta_access_token'
  ) then
    insert into public.client_secrets (client_id, meta_access_token, meta_page_access_token)
    select id, nullif(btrim(meta_access_token), ''), nullif(btrim(meta_page_access_token), '')
    from public.clients
    where nullif(btrim(meta_access_token), '') is not null
       or nullif(btrim(meta_page_access_token), '') is not null
    on conflict (client_id) do update
      set meta_access_token = coalesce(excluded.meta_access_token, client_secrets.meta_access_token),
          meta_page_access_token = coalesce(excluded.meta_page_access_token, client_secrets.meta_page_access_token),
          updated_at = now();
  end if;
end $$;

update public.clients c
set meta_token_configured = exists (
  select 1 from public.client_secrets s
  where s.client_id = c.id and nullif(btrim(s.meta_access_token), '') is not null
);

-- Unica funcao do banco que lia o token de clients.
create or replace function public.clientes_instagram_pendentes(_limite integer default 12)
returns table(id uuid, name text, meta_instagram_account_id text, token text)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.meta_instagram_account_id,
    coalesce(s.meta_page_access_token, s.meta_access_token)
  from public.clients c
  join public.client_secrets s on s.client_id = c.id
  left join public.client_instagram_daily d
    on d.client_id = c.id
   and d.date = current_date
  where c.status = 'active'
    and c.meta_instagram_account_id is not null
    and coalesce(s.meta_page_access_token, s.meta_access_token) is not null
    and (
      d.client_id is null
      or (d.followers_total is null and d.captured_at < now() - interval '3 hours')
    )
  order by d.captured_at nulls first, c.name
  limit _limite;
$$;

revoke all on function public.clientes_instagram_pendentes(integer) from public, anon, authenticated;
grant execute on function public.clientes_instagram_pendentes(integer) to service_role;
