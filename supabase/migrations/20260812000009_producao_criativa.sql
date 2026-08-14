-- Fila de producao criativa: as demandas de video e design da equipe.
--
-- Nao confundir com /clients/:id/creatives, que analisa fadiga dos anuncios ja
-- publicados na Meta. Aqui e o trabalho antes de existir anuncio: o que o editor
-- e o designer tem para entregar, para qual cliente e ate quando.

create table if not exists public.creative_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  tipo text not null default 'video' check (tipo in ('video', 'design', 'copy')),
  titulo text not null,
  briefing text,
  status text not null default 'backlog'
    check (status in ('backlog', 'producao', 'revisao', 'aprovado', 'publicado')),
  prioridade text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta')),
  responsavel_id uuid references auth.users(id) on delete set null,
  prazo date,
  link_arquivo text,
  link_referencia text,
  posicao int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_creative_tasks_client on public.creative_tasks(client_id);
create index if not exists idx_creative_tasks_status on public.creative_tasks(status, posicao);
create index if not exists idx_creative_tasks_responsavel on public.creative_tasks(responsavel_id)
  where status <> 'publicado';

alter table public.creative_tasks enable row level security;

-- Mesma regra do resto: quem enxerga o cliente enxerga as demandas dele.
drop policy if exists "creative_tasks_team" on public.creative_tasks;
create policy "creative_tasks_team" on public.creative_tasks
  for all to authenticated
  using (public.can_access_client(client_id))
  with check (public.can_access_client(client_id));

grant select, insert, update, delete on public.creative_tasks to authenticated;

-- Autoria e data de mudanca sem depender do frontend mandar certo.
create or replace function public.touch_creative_task()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_creative_tasks_touch on public.creative_tasks;
create trigger trg_creative_tasks_touch
  before insert or update on public.creative_tasks
  for each row execute function public.touch_creative_task();

-- A tela precisa mostrar quem e o responsavel pelo nome, e profiles so deixa
-- ver o proprio ou o do time. Como editor e designer sao do mesmo time, a
-- consulta direta a profiles ja resolve — nao e preciso view nem funcao extra.
