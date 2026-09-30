-- Passo 1 de 3: estrutura de empresas.
--
-- Esta migration NAO muda nenhuma policy — depois dela todo mundo continua
-- vendo exatamente o que via antes. A virada de acesso so acontece no passo 3,
-- e o passo 2 (backfill) precisa rodar antes dela.

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.companies enable row level security;

create table if not exists public.user_companies (
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, company_id)
);
alter table public.user_companies enable row level security;

create index if not exists user_companies_company_idx on public.user_companies (company_id);

-- on delete restrict: apagar uma empresa com cliente dentro deixaria o cliente
-- invisivel para todo mundo que nao e owner.
alter table public.clients
  add column if not exists company_id uuid references public.companies(id) on delete restrict;

create index if not exists clients_company_id_idx on public.clients (company_id);

-- SECURITY DEFINER para as policies poderem ler user_companies sem cair na
-- RLS da propria tabela (recursao).
create or replace function public.my_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.user_companies where user_id = auth.uid()
$$;

grant execute on function public.my_company_ids() to authenticated;

-- Quem nao e owner so enxerga as empresas em que foi colocado — assim o seletor
-- de empresa no cadastro de cliente ja vem limitado sozinho.
drop policy if exists "Members view own companies" on public.companies;
create policy "Members view own companies" on public.companies
  for select to authenticated
  using (public.has_role(auth.uid(), 'owner') or id in (select public.my_company_ids()));

drop policy if exists "Owner manages companies" on public.companies;
create policy "Owner manages companies" on public.companies
  for all to authenticated
  using (public.has_role(auth.uid(), 'owner'))
  with check (public.has_role(auth.uid(), 'owner'));

-- Vinculo usuario/empresa e a fronteira de seguranca: so o owner mexe.
drop policy if exists "Members view own links" on public.user_companies;
create policy "Members view own links" on public.user_companies
  for select to authenticated
  using (public.has_role(auth.uid(), 'owner') or user_id = auth.uid());

drop policy if exists "Owner manages links" on public.user_companies;
create policy "Owner manages links" on public.user_companies
  for all to authenticated
  using (public.has_role(auth.uid(), 'owner'))
  with check (public.has_role(auth.uid(), 'owner'));

grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.user_companies to authenticated;
grant select on public.companies to service_role;
grant select on public.user_companies to service_role;
