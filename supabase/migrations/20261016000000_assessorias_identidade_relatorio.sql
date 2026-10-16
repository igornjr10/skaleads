-- Assessorias (marcas) da empresa e identidade visual dos relatorios.
--
-- Uma empresa da plataforma pode atender por mais de uma marca: a Midsam tem a
-- Midsam Marketing (azul e branco) e a Midsam Log (vermelho e branco, delivery).
-- Cada cliente aponta para a sua; o relatorio usa cor e logo daqui. O nome e
-- os aliases servem para reconhecer a marca citada em texto.
--
-- O relatorio salvo guarda a identidade usada (dentro de relatorios_ia.dados),
-- entao mudar o cadastro depois nao repinta relatorio antigo.
--
-- Idempotente.

create table if not exists public.assessorias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.default_company_id() references public.companies(id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  aliases text[] not null default '{}',
  logo_url text,
  cor_primaria text not null default '#1f5fd1',
  cor_secundaria text not null default '#0a2a6e',
  cor_destaque text not null default '#6fa8ff',
  cor_fundo text not null default '#f3f7fd',
  cor_texto text not null default '#0f1b33',
  modelo text not null default 'padrao',
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessorias_cores_hex check (
    cor_primaria ~ '^#[0-9a-fA-F]{6}$' and cor_secundaria ~ '^#[0-9a-fA-F]{6}$'
    and cor_destaque ~ '^#[0-9a-fA-F]{6}$' and cor_fundo ~ '^#[0-9a-fA-F]{6}$'
    and cor_texto ~ '^#[0-9a-fA-F]{6}$'
  )
);

-- Mesmo nome duas vezes na empresa confundiria o reconhecimento por texto.
create unique index if not exists assessorias_nome_unico on public.assessorias (company_id, lower(btrim(nome)));
create index if not exists assessorias_company_idx on public.assessorias (company_id, ordem);

alter table public.assessorias enable row level security;

drop policy if exists "Empresa ve suas assessorias" on public.assessorias;
create policy "Empresa ve suas assessorias" on public.assessorias
  for select to authenticated using (public.is_my_company(company_id));

drop policy if exists "ADM gerencia assessorias" on public.assessorias;
create policy "ADM gerencia assessorias" on public.assessorias
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id));

grant select, insert, update, delete on public.assessorias to authenticated;
grant all on public.assessorias to service_role;

create or replace function public.touch_assessoria()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.aliases := coalesce(array(select distinct btrim(a) from unnest(new.aliases) a where btrim(a) <> ''), '{}');
  return new;
end;
$$;

drop trigger if exists trg_assessorias_touch on public.assessorias;
create trigger trg_assessorias_touch
  before insert or update on public.assessorias
  for each row execute function public.touch_assessoria();

-- ── Cliente: assessoria e nome usado no relatorio ──────────────────────────

alter table public.clients
  add column if not exists assessoria_id uuid references public.assessorias(id) on delete set null,
  add column if not exists nome_relatorio text;

create index if not exists clients_assessoria_idx on public.clients (assessoria_id) where assessoria_id is not null;

-- A assessoria tem que ser da mesma empresa do cliente.
create or replace function public.conferir_assessoria_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assessoria_id is not null and not exists (
    select 1 from public.assessorias a where a.id = new.assessoria_id and a.company_id = new.company_id
  ) then
    raise exception 'Assessoria de outra empresa' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- "z" para rodar depois do trigger que define company_id.
drop trigger if exists trg_clients_z_assessoria on public.clients;
create trigger trg_clients_z_assessoria
  before insert or update of assessoria_id, company_id on public.clients
  for each row execute function public.conferir_assessoria_cliente();

-- ── Cadastro inicial da Midsam ──────────────────────────────────────────────
-- So para a empresa Midsam; as demais cadastram as suas em Configuracoes.
-- A logo da Marketing parte da logo da empresa (se houver); a da Log fica para
-- cadastrar. Nenhum cliente e vinculado aqui: quem escolhe e o ADM.

insert into public.assessorias (company_id, nome, aliases, logo_url, cor_primaria, cor_secundaria, cor_destaque, cor_fundo, cor_texto, ordem)
select c.id, 'Midsam Marketing', array['Mid Marketing', 'Midsam Mkt', 'Mid Mkt'], c.logo_url,
       '#1f5fd1', '#0a2a6e', '#6fa8ff', '#f3f7fd', '#0f1b33', 1
from public.companies c
where lower(btrim(c.name)) = 'midsam'
on conflict do nothing;

insert into public.assessorias (company_id, nome, aliases, logo_url, cor_primaria, cor_secundaria, cor_destaque, cor_fundo, cor_texto, ordem)
select c.id, 'Midsam Log', array['Mid Log', 'MidLog', 'Midsam Delivery'], null,
       '#d7262e', '#7a0f14', '#ff8a8f', '#fdf4f4', '#1f1416', 2
from public.companies c
where lower(btrim(c.name)) = 'midsam'
on conflict do nothing;

notify pgrst, 'reload schema';
