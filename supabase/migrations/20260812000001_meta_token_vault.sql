-- Tira o token da Meta do alcance do browser.
--
-- Antes: clients.meta_access_token era legivel por qualquer usuario logado
-- (a policy de SELECT em clients e "USING (true)"), e o app mandava esse token
-- para a Graph API direto do browser. Qualquer conta autenticada — inclusive um
-- viewer recem-cadastrado — conseguia extrair o token de todos os clientes e
-- gastar verba na conta de anuncio deles.
--
-- Agora: o token vive em client_secrets, que nao tem grant nenhum para anon nem
-- para authenticated. So o service_role (Edge Functions meta-proxy,
-- meta-store-token e sync-meta-cron) enxerga a tabela.

create table if not exists public.client_secrets (
  client_id uuid primary key references public.clients(id) on delete cascade,
  meta_access_token text,
  updated_at timestamptz not null default now()
);

alter table public.client_secrets enable row level security;

-- RLS ligado e sem policy nenhuma: nega tudo por padrao. O service_role passa
-- por cima de RLS, entao as Edge Functions continuam funcionando.
revoke all on public.client_secrets from anon, authenticated;
grant all on public.client_secrets to service_role;

-- Flag que o frontend usa no lugar do token para saber se a conta esta conectada.
alter table public.clients
  add column if not exists meta_token_configured boolean not null default false;

-- Esta migration so COPIA. O drop da coluna antiga fica na migration seguinte,
-- que so pode rodar depois das Edge Functions e do frontend novo estarem no ar
-- — senao a versao antiga em producao quebra ao seleciona-la.
do $$
declare
  origem int;
  copiados int;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'meta_access_token'
  ) then
    select count(*) into origem
    from public.clients
    where meta_access_token is not null and btrim(meta_access_token) <> '';

    insert into public.client_secrets (client_id, meta_access_token)
    select id, btrim(meta_access_token)
    from public.clients
    where meta_access_token is not null and btrim(meta_access_token) <> ''
    on conflict (client_id) do update
      set meta_access_token = excluded.meta_access_token,
          updated_at = now();

    select count(*) into copiados
    from public.client_secrets
    where meta_access_token is not null and btrim(meta_access_token) <> '';

    if copiados < origem then
      raise exception 'Copia incompleta do token: % clientes na origem, % no cofre', origem, copiados;
    end if;
  end if;
end $$;

update public.clients c
set meta_token_configured = true
where exists (
  select 1 from public.client_secrets s
  where s.client_id = c.id
    and s.meta_access_token is not null
    and btrim(s.meta_access_token) <> ''
);
