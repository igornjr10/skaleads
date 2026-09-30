-- Fila de producao criativa: as demandas de video e design da equipe.
--
-- Nao confundir com /clients/:id/creatives, que analisa fadiga dos anuncios ja
-- publicados na Meta. Aqui e o trabalho antes de existir anuncio: o que o editor
-- e o designer tem para entregar, para qual cliente e ate quando.

create table if not exists public.producao_tarefas (
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

create index if not exists idx_producao_tarefas_client on public.producao_tarefas(client_id);
create index if not exists idx_producao_tarefas_status on public.producao_tarefas(status, posicao);
create index if not exists idx_producao_tarefas_responsavel on public.producao_tarefas(responsavel_id)
  where status <> 'publicado';

alter table public.producao_tarefas enable row level security;

-- Mesma regra do resto: quem enxerga o cliente enxerga as demandas dele.
drop policy if exists "producao_tarefas_team" on public.producao_tarefas;
create policy "producao_tarefas_team" on public.producao_tarefas
  for all to authenticated
  using (public.can_access_client(client_id))
  with check (public.can_access_client(client_id));

grant select, insert, update, delete on public.producao_tarefas to authenticated;

-- Autoria e data de mudanca sem depender do frontend mandar certo.
create or replace function public.touch_producao_tarefa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_producao_tarefas_touch on public.producao_tarefas;
create trigger trg_producao_tarefas_touch
  before insert or update on public.producao_tarefas
  for each row execute function public.touch_producao_tarefa();

-- A tela precisa mostrar quem e o responsavel pelo nome, e profiles so deixa
-- ver o proprio ou o do time. Como editor e designer sao do mesmo time, a
-- consulta direta a profiles ja resolve — nao e preciso view nem funcao extra.
