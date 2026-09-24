-- Tarefas: quadro geral da equipe, no modelo ClickUp.
--
-- Diferente de client_tasks (checklist fixo de onboarding) e de creative_tasks
-- (fila de video/arte da producao): aqui cabe qualquer tarefa, com ou sem
-- cliente vinculado, com responsavel, prazo, prioridade e thread de observacoes.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  client_id uuid references public.clients(id) on delete set null,
  status text not null default 'a_fazer'
    check (status in ('a_fazer', 'fazendo', 'revisao', 'concluida')),
  prioridade text not null default 'media'
    check (prioridade in ('baixa', 'media', 'alta', 'urgente')),
  prazo date,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  concluida_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_assigned on public.tasks(assigned_to) where status <> 'concluida';
create index if not exists idx_tasks_client on public.tasks(client_id, status);
create index if not exists idx_tasks_prazo on public.tasks(prazo) where status <> 'concluida';

alter table public.tasks enable row level security;

-- Leitura liberada para autenticado, como em creative_tasks: a equipe precisa
-- enxergar a carga dos outros para dividir trabalho.
drop policy if exists "Authenticated can view tasks" on public.tasks;
create policy "Authenticated can view tasks" on public.tasks
  for select to authenticated using (true);

drop policy if exists "Admins manage tasks" on public.tasks;
create policy "Admins manage tasks" on public.tasks
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()))
  with check (public.is_admin_or_owner(auth.uid()));

-- Quem recebeu a tarefa mexe nela. QUAIS colunas nao cabe em policy: isso e o
-- trigger guard_task_update logo abaixo.
drop policy if exists "Responsavel atualiza propria tarefa" on public.tasks;
create policy "Responsavel atualiza propria tarefa" on public.tasks
  for update to authenticated
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.tasks to service_role;


-- ── O que o responsavel pode alterar ────────────────────────────────────────
-- A policy de update deixaria o responsavel gravar a linha inteira, o que
-- permitiria repassar a tarefa para outro, esticar o prazo ou trocar o escopo.
-- Aqui o limite real e fechado: status, e o carimbo de conclusao que ele gera.
create or replace function public.guard_task_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();

  if new.status = 'concluida' and old.status <> 'concluida' then
    new.concluida_at := now();
  elsif new.status <> 'concluida' and old.status = 'concluida' then
    new.concluida_at := null;
  end if;

  -- auth.uid() nulo = chamada via service_role (cron, Edge Function), que nao
  -- passa pela RLS e nao deve esbarrar nesta trava.
  if auth.uid() is null or public.is_admin_or_owner(auth.uid()) then
    return new;
  end if;

  if new.titulo is distinct from old.titulo
     or new.descricao is distinct from old.descricao
     or new.client_id is distinct from old.client_id
     or new.prioridade is distinct from old.prioridade
     or new.prazo is distinct from old.prazo
     or new.assigned_to is distinct from old.assigned_to
     or new.created_by is distinct from old.created_by then
    raise exception 'Voce pode alterar apenas o status desta tarefa';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tasks_guard on public.tasks;
create trigger trg_tasks_guard
  before update on public.tasks
  for each row execute function public.guard_task_update();


-- ── Observacoes ─────────────────────────────────────────────────────────────
create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null,
  texto text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_comments_task on public.task_comments(task_id, created_at);

alter table public.task_comments enable row level security;

drop policy if exists "Authenticated can view task_comments" on public.task_comments;
create policy "Authenticated can view task_comments" on public.task_comments
  for select to authenticated using (true);

-- Comentar e livre para quem esta logado; assinar como outra pessoa nao e.
drop policy if exists "Authenticated comenta tarefa como si" on public.task_comments;
create policy "Authenticated comenta tarefa como si" on public.task_comments
  for insert to authenticated with check (autor_id = auth.uid());

drop policy if exists "Autor edita propria observacao" on public.task_comments;
create policy "Autor edita propria observacao" on public.task_comments
  for update to authenticated
  using (autor_id = auth.uid()) with check (autor_id = auth.uid());

drop policy if exists "Autor ou admin apaga observacao" on public.task_comments;
create policy "Autor ou admin apaga observacao" on public.task_comments
  for delete to authenticated
  using (autor_id = auth.uid() or public.is_admin_or_owner(auth.uid()));

grant select, insert, update, delete on public.task_comments to authenticated;
grant select, insert, update, delete on public.task_comments to service_role;


-- ── Aviso no sino ───────────────────────────────────────────────────────────
-- SECURITY DEFINER porque escreve notificacao para OUTRA pessoa, e a policy de
-- notifications so deixa cada um enxergar a propria linha.
create or replace function public.notify_task_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is null or new.assigned_to = auth.uid() then
    return new;
  end if;

  -- O if e aninhado de proposito: o AND do SQL nao garante curto-circuito, e
  -- ler OLD durante um INSERT aborta com "record old is not assigned yet".
  if tg_op = 'UPDATE' then
    if new.assigned_to is not distinct from old.assigned_to then
      return new;
    end if;
  end if;

  insert into public.notifications (user_id, type, title, body)
  values (
    new.assigned_to,
    'tarefa',
    'Nova tarefa para voce',
    new.titulo || coalesce(' - prazo ' || to_char(new.prazo, 'DD/MM'), '')
  );

  return new;
end;
$$;

drop trigger if exists trg_tasks_notify on public.tasks;
create trigger trg_tasks_notify
  after insert or update of assigned_to on public.tasks
  for each row execute function public.notify_task_assigned();


create or replace function public.notify_task_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tarefa public.tasks%rowtype;
  destino uuid;
begin
  select * into tarefa from public.tasks where id = new.task_id;
  if not found then
    return new;
  end if;

  -- Avisa o responsavel e quem abriu a tarefa, pulando o proprio autor. O
  -- distinct evita dois avisos quando as duas pontas sao a mesma pessoa.
  for destino in
    select distinct d
    from unnest(array[tarefa.assigned_to, tarefa.created_by]) as d
    where d is not null and d is distinct from new.autor_id
  loop
    insert into public.notifications (user_id, type, title, body)
    values (destino, 'tarefa', 'Nova observacao em: ' || tarefa.titulo, left(new.texto, 200));
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_task_comments_notify on public.task_comments;
create trigger trg_task_comments_notify
  after insert on public.task_comments
  for each row execute function public.notify_task_comment();

notify pgrst, 'reload schema';
