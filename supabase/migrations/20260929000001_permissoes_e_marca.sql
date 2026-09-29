-- Permissoes por funcao e marca por empresa.
--
-- 1. Carteira por pessoa: admin/owner veem todos os clientes da empresa; os
--    demais papeis (gestor, designer, editor...) so os que foram atribuidos a
--    eles em client_assignments. Como campanhas, metricas, auditoria, producao
--    e financeiro filtram por `client_id in (select id from clients)`, a regra
--    nova em clients vale para todas essas tabelas sem tocar nelas.
-- 2. Modulos por pessoa: user_companies.modulos. Null = o padrao do papel,
--    definido no front (src/lib/permissoes.ts).
-- 3. Marca: nome de exibicao, logo e cor da empresa, editaveis pelo admin dela.

-- ── Responsaveis por cliente ─────────────────────────────────────────────────

create table if not exists public.client_assignments (
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, user_id)
);

create index if not exists client_assignments_user_idx on public.client_assignments (user_id);

-- A empresa vem sempre do cliente, nunca do frontend.
drop trigger if exists trg_client_assignments_company on public.client_assignments;
create trigger trg_client_assignments_company
  before insert or update of client_id on public.client_assignments
  for each row execute function public.company_from_client();

alter table public.client_assignments enable row level security;

-- Sem subconsulta em clients: a policy de clients consulta esta tabela, e o
-- caminho inverso viraria recursao.
drop policy if exists "Ve as proprias atribuicoes ou as da empresa" on public.client_assignments;
create policy "Ve as proprias atribuicoes ou as da empresa" on public.client_assignments
  for select to authenticated
  using (user_id = auth.uid()
         or (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id)));

drop policy if exists "Admin atribui clientes da empresa" on public.client_assignments;
create policy "Admin atribui clientes da empresa" on public.client_assignments
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id)
              and public.shares_company(user_id));

grant select, insert, update, delete on public.client_assignments to authenticated;
grant select, insert, update, delete on public.client_assignments to service_role;

create or replace function public.atribuido_a_mim(_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_assignments
    where client_id = _client_id and user_id = auth.uid()
  )
$$;
revoke execute on function public.atribuido_a_mim(uuid) from public, anon;
grant execute on function public.atribuido_a_mim(uuid) to authenticated;

drop policy if exists "Members view company clients" on public.clients;
drop policy if exists "Carteira de quem enxerga o cliente" on public.clients;
create policy "Carteira de quem enxerga o cliente" on public.clients
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'owner'::app_role)
    or (company_id in (select public.my_company_ids())
        and (public.is_admin_or_owner(auth.uid()) or public.atribuido_a_mim(id)))
  );

-- Mesma regra para as Edge Functions (service_role, sem auth.uid()).
create or replace function public.user_can_access_client(_user_id uuid, _client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = _client_id
      and (
        public.has_role(_user_id, 'owner'::app_role)
        or (
          exists (select 1 from public.user_companies uc
                  where uc.company_id = c.company_id and uc.user_id = _user_id)
          and (
            public.is_admin_or_owner(_user_id)
            or exists (select 1 from public.client_assignments a
                       where a.client_id = c.id and a.user_id = _user_id)
          )
        )
      )
  )
$$;
revoke execute on function public.user_can_access_client(uuid, uuid) from public, anon, authenticated;
grant execute on function public.user_can_access_client(uuid, uuid) to service_role;

-- ── Modulos por pessoa ───────────────────────────────────────────────────────

alter table public.user_companies add column if not exists modulos text[];

-- ── Papel mais forte primeiro ────────────────────────────────────────────────

create or replace function public.get_my_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.user_roles
  where user_id = auth.uid()
  order by case role
    when 'owner'         then 1
    when 'admin'         then 2
    when 'analyst'       then 3
    when 'closer'        then 4
    when 'sdr'           then 5
    when 'social_seller' then 6
    when 'editor'        then 7
    when 'designer'      then 8
    when 'viewer'        then 9
    else 10
  end
  limit 1
$$;

-- ── Marca da empresa ─────────────────────────────────────────────────────────

alter table public.companies add column if not exists nome_exibicao text;
alter table public.companies add column if not exists logo_url text;
alter table public.companies add column if not exists cor_primaria text;
alter table public.companies add column if not exists dominio text;

alter table public.companies drop constraint if exists companies_cor_primaria_hex;
alter table public.companies add constraint companies_cor_primaria_hex
  check (cor_primaria is null or cor_primaria ~ '^#[0-9a-fA-F]{6}$');

drop policy if exists "Admin edita a propria empresa" on public.companies;
create policy "Admin edita a propria empresa" on public.companies
  for update to authenticated
  using (public.is_admin_or_owner(auth.uid()) and id in (select public.my_company_ids()))
  with check (public.is_admin_or_owner(auth.uid()) and id in (select public.my_company_ids()));

-- O admin da empresa mexe na marca, nao no is_active (que e decisao da
-- plataforma).
revoke update on public.companies from authenticated;
grant update (name, nome_exibicao, logo_url, cor_primaria, dominio) on public.companies to authenticated;

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists "Leitura publica da marca" on storage.objects;
create policy "Leitura publica da marca" on storage.objects
  for select using (bucket_id = 'branding');

-- Cada empresa grava so na pasta com o proprio id.
drop policy if exists "Admin grava a marca da empresa" on storage.objects;
create policy "Admin grava a marca da empresa" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding'
              and public.is_admin_or_owner(auth.uid())
              and (storage.foldername(name))[1] in (select public.my_company_ids()::text));

drop policy if exists "Admin troca a marca da empresa" on storage.objects;
create policy "Admin troca a marca da empresa" on storage.objects
  for update to authenticated
  using (bucket_id = 'branding'
         and public.is_admin_or_owner(auth.uid())
         and (storage.foldername(name))[1] in (select public.my_company_ids()::text));

drop policy if exists "Admin apaga a marca da empresa" on storage.objects;
create policy "Admin apaga a marca da empresa" on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding'
         and public.is_admin_or_owner(auth.uid())
         and (storage.foldername(name))[1] in (select public.my_company_ids()::text));

notify pgrst, 'reload schema';
