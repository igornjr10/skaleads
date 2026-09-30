-- Producao: fila de demandas de video e arte por cliente.
--
-- ATENCAO ao rodar: as duas primeiras linhas ampliam o enum app_role. O
-- Postgres proibe USAR um valor de enum recem-criado na mesma transacao, entao
-- nada aqui compara com 'editor'::app_role — as checagens usam role::text, que
-- nao toca no enum. Se ainda assim o SQL Editor reclamar de "unsafe use of new
-- value", rode as duas linhas do alter type sozinhas e depois o resto.

alter type public.app_role add value if not exists 'editor';
alter type public.app_role add value if not exists 'designer';


-- ── Quem e do time de producao ───────────────────────────────────────────────
create or replace function public.is_production_member(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role::text in ('editor', 'designer')
  )
$$;


-- ── Demandas ─────────────────────────────────────────────────────────────────
create table if not exists public.creative_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  tipo text not null default 'arte' check (tipo in ('video', 'arte')),
  titulo text not null,
  briefing text,
  formato text,
  status text not null default 'a_fazer'
    check (status in ('a_fazer', 'producao', 'revisao', 'aprovada', 'publicada')),
  prazo date,
  arquivo_url text,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_creative_tasks_client on public.creative_tasks(client_id, status);
create index if not exists idx_creative_tasks_assigned on public.creative_tasks(assigned_to) where status <> 'publicada';
create index if not exists idx_creative_tasks_prazo on public.creative_tasks(prazo) where status <> 'publicada';

alter table public.creative_tasks enable row level security;

-- Leitura liberada para autenticado, como no resto do sistema: o time precisa
-- enxergar a carga dos outros para dividir trabalho.
drop policy if exists "Authenticated can view creative_tasks" on public.creative_tasks;
create policy "Authenticated can view creative_tasks" on public.creative_tasks
  for select to authenticated using (true);

drop policy if exists "Admins manage creative_tasks" on public.creative_tasks;
create policy "Admins manage creative_tasks" on public.creative_tasks
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()))
  with check (public.is_admin_or_owner(auth.uid()));

-- Editor e designer mexem apenas no que esta atribuido a eles. Quais COLUNAS
-- eles podem mexer nao cabe em policy — isso e o trigger abaixo.
drop policy if exists "Producao atualiza proprias demandas" on public.creative_tasks;
create policy "Producao atualiza proprias demandas" on public.creative_tasks
  for update to authenticated
  using (assigned_to = auth.uid() and public.is_production_member(auth.uid()))
  with check (assigned_to = auth.uid() and public.is_production_member(auth.uid()));

grant select, insert, update, delete on public.creative_tasks to authenticated;
grant select, insert, update, delete on public.creative_tasks to service_role;


-- ── O que a producao pode alterar ────────────────────────────────────────────
-- A policy de update deixa o responsavel gravar a linha inteira, o que
-- permitiria repassar a demanda para outro ou trocar o cliente. Aqui o
-- escopo real e fechado: status, arquivo_url e updated_at.
create or replace function public.guard_creative_task_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();

  if public.is_admin_or_owner(auth.uid()) or auth.uid() is null then
    return new;
  end if;

  if new.client_id is distinct from old.client_id
     or new.tipo is distinct from old.tipo
     or new.titulo is distinct from old.titulo
     or new.briefing is distinct from old.briefing
     or new.formato is distinct from old.formato
     or new.prazo is distinct from old.prazo
     or new.assigned_to is distinct from old.assigned_to
     or new.created_by is distinct from old.created_by then
    raise exception 'Voce pode alterar apenas status e arquivo desta demanda';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_creative_tasks_guard on public.creative_tasks;
create trigger trg_creative_tasks_guard
  before update on public.creative_tasks
  for each row execute function public.guard_creative_task_update();


-- ── Comentarios de revisao ───────────────────────────────────────────────────
create table if not exists public.creative_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.creative_tasks(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null,
  texto text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_creative_comments_task on public.creative_task_comments(task_id, created_at);

alter table public.creative_task_comments enable row level security;

drop policy if exists "Authenticated can view creative_comments" on public.creative_task_comments;
create policy "Authenticated can view creative_comments" on public.creative_task_comments
  for select to authenticated using (true);

-- Comentar e livre para quem esta logado; assinar como outra pessoa nao e.
drop policy if exists "Authenticated comenta como si" on public.creative_task_comments;
create policy "Authenticated comenta como si" on public.creative_task_comments
  for insert to authenticated with check (autor_id = auth.uid());

drop policy if exists "Autor edita proprio comentario" on public.creative_task_comments;
create policy "Autor edita proprio comentario" on public.creative_task_comments
  for update to authenticated
  using (autor_id = auth.uid()) with check (autor_id = auth.uid());

drop policy if exists "Autor ou admin apaga comentario" on public.creative_task_comments;
create policy "Autor ou admin apaga comentario" on public.creative_task_comments
  for delete to authenticated
  using (autor_id = auth.uid() or public.is_admin_or_owner(auth.uid()));

grant select, insert, update, delete on public.creative_task_comments to authenticated;
grant select, insert, update, delete on public.creative_task_comments to service_role;

notify pgrst, 'reload schema';
