-- Token da Autentique por empresa, cadastrado pelo ADM na tela de Contratos.
--
-- Antes o espelho dependia dos secrets AUTENTIQUE_TOKEN e
-- AUTENTIQUE_WEBHOOK_SECRET da function, que nunca foram criados neste projeto:
-- o cron rodava a cada 6h e a tabela `contratos` seguia vazia. Aqui o ADM cola
-- o token e o segredo do webhook sem precisar de acesso ao dashboard do Supabase.
--
-- O token cria e assina documento em nome da empresa: so as Edge Functions
-- (service_role) leem. O browser grava por `configurar_autentique()` e so fica
-- sabendo se existe, por `autentique_situacao()`.
create table if not exists public.autentique_config (
  company_id uuid primary key references public.companies(id) on delete cascade,
  token text not null,
  webhook_secret text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

alter table public.autentique_config enable row level security;
revoke all on public.autentique_config from anon, authenticated;
grant select, insert, update, delete on public.autentique_config to service_role;

-- Campo vazio mantem o que ja estava: o ADM troca o segredo do webhook sem ter
-- que colar o token de novo (que ele nem consegue ver).
create or replace function public.configurar_autentique(_token text default null, _webhook_secret text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _empresa uuid default public.my_team_id();
begin
  if not public.is_admin_or_owner(auth.uid()) then
    raise exception 'So ADM configura a Autentique' using errcode = '42501';
  end if;
  if _empresa is null then
    raise exception 'Usuario sem empresa';
  end if;

  _token := nullif(btrim(_token), '');
  _webhook_secret := nullif(btrim(_webhook_secret), '');

  if _token is null and not exists (select 1 from public.autentique_config where company_id = _empresa) then
    raise exception 'Informe o token da Autentique';
  end if;

  insert into public.autentique_config as alvo (company_id, token, webhook_secret, atualizado_por)
  values (_empresa, _token, _webhook_secret, auth.uid())
  on conflict (company_id) do update set
    token          = coalesce(excluded.token, alvo.token),
    webhook_secret = coalesce(excluded.webhook_secret, alvo.webhook_secret),
    atualizado_em  = now(),
    atualizado_por = auth.uid();
end;
$$;

create or replace function public.autentique_situacao()
returns table (empresa uuid, token_configurado boolean, webhook_configurado boolean, atualizado_em timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.id, c.company_id is not null, coalesce(c.webhook_secret is not null, false), c.atualizado_em
  from (select public.my_team_id() as id) e
  left join public.autentique_config c on c.company_id = e.id
$$;

revoke all on function public.configurar_autentique(text, text) from public, anon;
revoke all on function public.autentique_situacao() from public, anon;
grant execute on function public.configurar_autentique(text, text) to authenticated;
grant execute on function public.autentique_situacao() to authenticated;

-- A empresa vem de quem sincroniza, nao de default_company_id(): pela service
-- role nao ha usuario, e com mais de uma empresa o contrato sem cliente ficaria
-- com company_id nulo, invisivel para todo mundo. Com cliente casado, o trigger
-- company_from_client ainda manda.
drop function if exists public.gravar_contratos(jsonb);

create or replace function public.gravar_contratos(_company_id uuid, _linhas jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _gravadas integer;
begin
  insert into public.contratos as alvo
    (autentique_id, company_id, client_id, nome, status, criado_em, assinado_em,
     arquivo_original, arquivo_assinado, signatarios, sincronizado_em)
  select
    linha->>'autentique_id',
    _company_id,
    nullif(linha->>'client_id', '')::uuid,
    coalesce(nullif(linha->>'nome', ''), '(sem nome)'),
    coalesce(nullif(linha->>'status', ''), 'pendente'),
    nullif(linha->>'criado_em', '')::timestamptz,
    nullif(linha->>'assinado_em', '')::timestamptz,
    nullif(linha->>'arquivo_original', ''),
    nullif(linha->>'arquivo_assinado', ''),
    coalesce(linha->'signatarios', '[]'::jsonb),
    now()
  from jsonb_array_elements(_linhas) as linha
  on conflict (autentique_id) do update set
    nome             = excluded.nome,
    status           = excluded.status,
    criado_em        = excluded.criado_em,
    assinado_em      = excluded.assinado_em,
    arquivo_original = excluded.arquivo_original,
    arquivo_assinado = excluded.arquivo_assinado,
    signatarios      = excluded.signatarios,
    sincronizado_em  = now(),
    company_id = coalesce(alvo.company_id, excluded.company_id),
    client_id = case
      when alvo.vinculo_manual then alvo.client_id
      else coalesce(excluded.client_id, alvo.client_id)
    end;

  get diagnostics _gravadas = row_count;
  return _gravadas;
end;
$$;

revoke all on function public.gravar_contratos(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.gravar_contratos(uuid, jsonb) to service_role;
