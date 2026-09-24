-- Reportei Connect: cada cliente daqui vira um "customer" no Connect, e cada
-- customer tem um `api_token` proprio que autentica as chamadas de escopo dele.
--
-- O token fica numa tabela separada, e nao numa coluna de `clients`, por um
-- motivo concreto: ClientHub faz `select("*")` em clients, entao qualquer
-- coluna nova ali viaja para o browser de todo usuario que enxerga o cliente.
-- O identificador publico (customer_uuid) pode morar em clients; o segredo nao.

alter table public.clients
  add column if not exists connect_customer_uuid uuid,
  add column if not exists connect_connected_at  timestamptz;

comment on column public.clients.connect_customer_uuid is
  'UUID do customer correspondente no Reportei Connect. Identificador, nao segredo.';

create unique index if not exists clients_connect_customer_uuid_idx
  on public.clients (connect_customer_uuid)
  where connect_customer_uuid is not null;

-- O `api_token` do customer e devolvido UMA unica vez, na criacao, e e
-- irrecuperavel. Perde-lo obriga a recriar o cliente no Connect e refazer
-- todas as conexoes dele.
create table if not exists public.connect_customer_tokens (
  client_id     uuid        primary key references public.clients(id) on delete cascade,
  customer_uuid uuid        not null,
  api_token     text        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.connect_customer_tokens is
  'Tokens de customer do Reportei Connect. Sem policies de propósito: so a service_role (Edge Functions) le isto. Nunca expor ao browser.';

-- RLS ligada e nenhuma policy criada: nega tudo para anon e authenticated.
-- A service_role ignora RLS, entao a Edge Function continua lendo normalmente.
alter table public.connect_customer_tokens enable row level security;

revoke all on public.connect_customer_tokens from anon, authenticated;

-- O `api_token` e irrecuperavel, entao gravar o token e marcar o cliente
-- precisam acontecer juntos: se o segundo write falhasse sozinho, o token
-- ficaria orfao e o cliente teria de ser recriado no Connect. Uma funcao
-- resolve os dois na mesma transacao.
create or replace function public.connect_persist_customer(
  _client_id     uuid,
  _customer_uuid uuid,
  _api_token     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.connect_customer_tokens (client_id, customer_uuid, api_token)
  values (_client_id, _customer_uuid, _api_token)
  on conflict (client_id) do update
    set customer_uuid = excluded.customer_uuid,
        api_token     = excluded.api_token,
        updated_at    = now();

  update public.clients
     set connect_customer_uuid = _customer_uuid,
         connect_connected_at  = now()
   where id = _client_id;
end;
$$;

-- Funcao no Postgres nasce com EXECUTE concedido a PUBLIC, e anon/authenticated
-- herdam por ali: revogar so desses dois papeis nao tira nada. Tem de revogar
-- de PUBLIC. Sem isso a anon key, que e publica, chama esta SECURITY DEFINER e
-- sobrescreve o api_token de qualquer cliente — o valor que nao da para
-- recuperar depois.
revoke execute on function public.connect_persist_customer(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.connect_persist_customer(uuid, uuid, text)
  to service_role;
