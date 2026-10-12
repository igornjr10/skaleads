-- Biblioteca de ideias: referencias e criativos que a equipe junta para
-- campanhas e conteudo. Link (Instagram, TikTok, YouTube, Drive...) ou
-- arquivo enviado para o bucket privado `biblioteca` (empresa/ideia/arquivo).
--
-- Toda a equipe da empresa consulta e adiciona. Ideia presa a um cliente so
-- aparece para quem tem o cliente na carteira; sem cliente, e de todos.
-- Quem adicionou (ou o ADM) edita e apaga.

create table if not exists public.ideias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.default_company_id() references public.companies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  titulo text not null check (length(trim(titulo)) > 0),
  descricao text,
  url text check (url is null or url ~* '^https?://'),
  plataforma text not null default 'outro'
    check (plataforma in ('instagram', 'tiktok', 'youtube', 'facebook', 'drive', 'pinterest', 'site', 'arquivo', 'outro')),
  tipo_criativo text not null default 'outro'
    check (tipo_criativo in ('video', 'reels', 'imagem', 'carrossel', 'story', 'texto', 'outro')),
  categoria text not null default 'anuncio'
    check (categoria in ('anuncio', 'video', 'storytelling', 'oferta', 'organico', 'outro')),
  tags text[] not null default '{}',
  arquivo_caminho text,
  arquivo_nome text,
  arquivo_tipo text,
  arquivo_tamanho bigint,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (url is not null or arquivo_caminho is not null)
);

create index if not exists ideias_company_idx on public.ideias (company_id, created_at desc);
create index if not exists ideias_client_idx on public.ideias (client_id);
create index if not exists ideias_tags_idx on public.ideias using gin (tags);

create or replace function public.carimbar_ideia()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ideias_carimbo on public.ideias;
create trigger trg_ideias_carimbo
  before update on public.ideias
  for each row execute function public.carimbar_ideia();

alter table public.ideias enable row level security;

drop policy if exists "Equipe ve ideias da empresa" on public.ideias;
create policy "Equipe ve ideias da empresa" on public.ideias
  for select to authenticated
  using (public.is_my_company(company_id)
         and (client_id is null or client_id in (select id from public.clients)));

drop policy if exists "Equipe adiciona ideia" on public.ideias;
create policy "Equipe adiciona ideia" on public.ideias
  for insert to authenticated
  with check (public.is_my_company(company_id)
              and created_by = auth.uid()
              and (client_id is null or client_id in (select id from public.clients)));

drop policy if exists "Autor ou ADM edita ideia" on public.ideias;
create policy "Autor ou ADM edita ideia" on public.ideias
  for update to authenticated
  using (public.is_my_company(company_id) and (created_by = auth.uid() or public.is_admin_or_owner(auth.uid())))
  with check (public.is_my_company(company_id)
              and (client_id is null or client_id in (select id from public.clients)));

drop policy if exists "Autor ou ADM apaga ideia" on public.ideias;
create policy "Autor ou ADM apaga ideia" on public.ideias
  for delete to authenticated
  using (public.is_my_company(company_id) and (created_by = auth.uid() or public.is_admin_or_owner(auth.uid())));

grant select, insert, update, delete on public.ideias to authenticated;
grant select on public.ideias to service_role;

-- ── Favoritas: de cada pessoa ────────────────────────────────────────────────

create table if not exists public.ideia_favoritas (
  ideia_id uuid not null references public.ideias(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ideia_id, user_id)
);

alter table public.ideia_favoritas enable row level security;

drop policy if exists "Cada um marca as proprias favoritas" on public.ideia_favoritas;
create policy "Cada um marca as proprias favoritas" on public.ideia_favoritas
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.ideias i where i.id = ideia_id));

grant select, insert, delete on public.ideia_favoritas to authenticated;

-- ── Arquivos ─────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('biblioteca', 'biblioteca', false)
on conflict (id) do nothing;

-- Pasta = empresa/ideia. Le quem enxerga a ideia (RLS de ideias na subconsulta).
drop policy if exists "Le arquivo de ideia que enxerga" on storage.objects;
create policy "Le arquivo de ideia que enxerga" on storage.objects
  for select to authenticated
  using (bucket_id = 'biblioteca'
         and exists (select 1 from public.ideias i
                     where i.company_id::text = (storage.foldername(name))[1]
                       and i.id::text = (storage.foldername(name))[2]));

-- O arquivo sobe antes da linha existir (o id da ideia nasce no front):
-- basta ser da empresa da pasta.
drop policy if exists "Sobe arquivo na biblioteca da empresa" on storage.objects;
create policy "Sobe arquivo na biblioteca da empresa" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'biblioteca'
              and public.is_my_company(((storage.foldername(name))[1])::uuid));

drop policy if exists "Apaga arquivo de ideia que pode editar" on storage.objects;
create policy "Apaga arquivo de ideia que pode editar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'biblioteca'
         and (owner = auth.uid()
              or exists (select 1 from public.ideias i
                         where i.company_id::text = (storage.foldername(name))[1]
                           and i.id::text = (storage.foldername(name))[2]
                           and public.is_admin_or_owner(auth.uid()))));

notify pgrst, 'reload schema';
