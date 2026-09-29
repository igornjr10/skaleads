-- Central de demandas: `tasks` passa a ser a fila unica da equipe (substitui
-- Tarefas, Producao, Esteira e as demandas do Time, todas vazias neste banco).
--
-- Visibilidade: o ADM ve tudo da empresa; os demais veem o que esta com eles
-- ou o que eles pediram. Qualquer um da equipe pode abrir demanda — e assim
-- que o gestor pede a arte ao designer.

-- ── Colunas novas ────────────────────────────────────────────────────────────

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('a_fazer', 'fazendo', 'revisao', 'aprovado', 'concluida'));

alter table public.tasks add column if not exists categoria text not null default 'outro';
alter table public.tasks drop constraint if exists tasks_categoria_check;
alter table public.tasks add constraint tasks_categoria_check
  check (categoria in ('trafego', 'criativo', 'video', 'copy', 'relatorio', 'reuniao', 'atendimento', 'outro'));

-- [{ "id": "...", "texto": "...", "feito": false }]
alter table public.tasks add column if not exists checklist jsonb not null default '[]'::jsonb;
alter table public.tasks drop constraint if exists tasks_checklist_array;
alter table public.tasks add constraint tasks_checklist_array check (jsonb_typeof(checklist) = 'array');

create index if not exists tasks_assigned_idx on public.tasks (assigned_to) where status <> 'concluida';
create index if not exists tasks_prazo_idx on public.tasks (company_id, prazo);

-- ── Quem ve e quem mexe ──────────────────────────────────────────────────────

drop policy if exists "Company view tasks" on public.tasks;
drop policy if exists "Company admins manage tasks" on public.tasks;
drop policy if exists "Responsavel atualiza propria tarefa" on public.tasks;
drop policy if exists "Ve demandas da empresa, suas ou pedidas por voce" on public.tasks;
drop policy if exists "Admin gerencia demandas da empresa" on public.tasks;
drop policy if exists "Equipe abre demanda" on public.tasks;
drop policy if exists "Responsavel ou quem pediu atualiza" on public.tasks;
drop policy if exists "Quem pediu apaga" on public.tasks;

create policy "Ve demandas da empresa, suas ou pedidas por voce" on public.tasks
  for select to authenticated
  using (public.is_my_company(company_id)
         and (public.is_admin_or_owner(auth.uid()) or assigned_to = auth.uid() or created_by = auth.uid()));

create policy "Admin gerencia demandas da empresa" on public.tasks
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id)
              and (assigned_to is null or assigned_to = auth.uid() or public.shares_company(assigned_to)));

-- Cliente precisa estar na carteira de quem abre; responsavel, na mesma empresa.
create policy "Equipe abre demanda" on public.tasks
  for insert to authenticated
  with check (public.is_my_company(company_id)
              and created_by = auth.uid()
              and (client_id is null or client_id in (select id from public.clients))
              and (assigned_to is null or assigned_to = auth.uid() or public.shares_company(assigned_to)));

-- O que cada um pode mudar dentro da linha fica em guard_task_update. A
-- carteira nao entra aqui: o designer anda com a demanda de um cliente que
-- nao e dele; quem troca o cliente e checado no trigger.
create policy "Responsavel ou quem pediu atualiza" on public.tasks
  for update to authenticated
  using (public.is_my_company(company_id) and (assigned_to = auth.uid() or created_by = auth.uid()))
  with check (public.is_my_company(company_id)
              and (assigned_to is null or assigned_to = auth.uid() or public.shares_company(assigned_to)));

create policy "Quem pediu apaga" on public.tasks
  for delete to authenticated
  using (public.is_my_company(company_id) and created_by = auth.uid());

-- Quem pediu edita tudo da propria demanda; o responsavel so anda com ela
-- (status e checklist). Admin e service_role passam direto.
create or replace function public.guard_task_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();

  if new.status = 'concluida' and old.status <> 'concluida' then
    new.concluida_at := now();
  elsif new.status <> 'concluida' and old.status = 'concluida' then
    new.concluida_at := null;
  end if;

  if auth.uid() is null or public.is_admin_or_owner(auth.uid()) then
    return new;
  end if;

  if new.created_by is distinct from old.created_by or new.company_id is distinct from old.company_id then
    raise exception 'Autoria e empresa da demanda nao mudam';
  end if;

  if old.created_by = auth.uid() then
    if new.client_id is distinct from old.client_id and new.client_id is not null
       and not public.user_can_access_client(auth.uid(), new.client_id) then
      raise exception 'Esse cliente nao esta na sua carteira';
    end if;
    return new;
  end if;

  if new.titulo is distinct from old.titulo
     or new.descricao is distinct from old.descricao
     or new.client_id is distinct from old.client_id
     or new.prioridade is distinct from old.prioridade
     or new.prazo is distinct from old.prazo
     or new.assigned_to is distinct from old.assigned_to
     or new.categoria is distinct from old.categoria then
    raise exception 'Voce pode alterar apenas o status e o checklist desta demanda';
  end if;

  return new;
end;
$$;

-- Comentario so em demanda que a pessoa enxerga (antes bastava saber o id).
drop policy if exists "Authenticated comenta tarefa como si" on public.task_comments;
drop policy if exists "Comenta demanda que enxerga" on public.task_comments;
create policy "Comenta demanda que enxerga" on public.task_comments
  for insert to authenticated
  with check (autor_id = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id));

-- ── Historico ────────────────────────────────────────────────────────────────

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null,
  tipo text not null check (tipo in ('criada', 'status', 'responsavel', 'prazo', 'prioridade')),
  de text,
  para text,
  created_at timestamptz not null default now()
);

create index if not exists task_events_task_idx on public.task_events (task_id, created_at);

alter table public.task_events enable row level security;

drop policy if exists "Historico de demanda que enxerga" on public.task_events;
create policy "Historico de demanda que enxerga" on public.task_events
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

-- Escrita so pelo trigger: historico editavel nao e historico.
revoke insert, update, delete on public.task_events from authenticated;
grant select on public.task_events to authenticated;
grant select on public.task_events to service_role;

create or replace function public.registrar_evento_demanda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (task_id, autor_id, tipo, para)
    values (new.id, coalesce(auth.uid(), new.created_by), 'criada', new.status);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.task_events (task_id, autor_id, tipo, de, para)
    values (new.id, auth.uid(), 'status', old.status, new.status);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.task_events (task_id, autor_id, tipo, de, para)
    values (new.id, auth.uid(), 'responsavel', old.assigned_to::text, new.assigned_to::text);
  end if;
  if new.prazo is distinct from old.prazo then
    insert into public.task_events (task_id, autor_id, tipo, de, para)
    values (new.id, auth.uid(), 'prazo', old.prazo::text, new.prazo::text);
  end if;
  if new.prioridade is distinct from old.prioridade then
    insert into public.task_events (task_id, autor_id, tipo, de, para)
    values (new.id, auth.uid(), 'prioridade', old.prioridade, new.prioridade);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tasks_eventos on public.tasks;
create trigger trg_tasks_eventos
  after insert or update on public.tasks
  for each row execute function public.registrar_evento_demanda();

-- ── Aviso de revisao e aprovacao ─────────────────────────────────────────────

create or replace function public.notify_task_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Entregou para revisar: avisa quem pediu.
  if new.status = 'revisao' and new.created_by is not null and new.created_by is distinct from auth.uid() then
    insert into public.notifications (user_id, type, title, body)
    values (new.created_by, 'tarefa', 'Demanda para revisar', new.titulo);
  end if;

  -- Aprovado ou devolvido: avisa quem esta fazendo.
  if new.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
    if new.status = 'aprovado' then
      insert into public.notifications (user_id, type, title, body)
      values (new.assigned_to, 'tarefa', 'Demanda aprovada', new.titulo);
    elsif old.status = 'revisao' and new.status = 'fazendo' then
      insert into public.notifications (user_id, type, title, body)
      values (new.assigned_to, 'tarefa', 'Demanda voltou para ajuste', new.titulo);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tasks_notify_status on public.tasks;
create trigger trg_tasks_notify_status
  after update of status on public.tasks
  for each row execute function public.notify_task_status();

-- ── Anexos ───────────────────────────────────────────────────────────────────
-- Arquivo no bucket privado `demandas` (caminho empresa/demanda/arquivo) ou
-- link externo (Drive, Figma, Canva), que e como a equipe costuma mandar.

create table if not exists public.task_anexos (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  nome text not null,
  caminho text,
  url text,
  tamanho bigint,
  tipo text,
  autor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((caminho is null) <> (url is null))
);

create index if not exists task_anexos_task_idx on public.task_anexos (task_id);

alter table public.task_anexos enable row level security;

drop policy if exists "Anexos de demanda que enxerga" on public.task_anexos;
create policy "Anexos de demanda que enxerga" on public.task_anexos
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

drop policy if exists "Anexa em demanda que enxerga" on public.task_anexos;
create policy "Anexa em demanda que enxerga" on public.task_anexos
  for insert to authenticated
  with check (autor_id = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id));

drop policy if exists "Autor ou admin tira anexo" on public.task_anexos;
create policy "Autor ou admin tira anexo" on public.task_anexos
  for delete to authenticated
  using ((autor_id = auth.uid() or public.is_admin_or_owner(auth.uid()))
         and exists (select 1 from public.tasks t where t.id = task_id));

grant select, insert, delete on public.task_anexos to authenticated;
grant select on public.task_anexos to service_role;

insert into storage.buckets (id, name, public)
values ('demandas', 'demandas', false)
on conflict (id) do nothing;

-- A subconsulta em tasks passa pela RLS de tasks: so mexe no arquivo quem
-- enxerga a demanda da pasta.
drop policy if exists "Le arquivo de demanda que enxerga" on storage.objects;
create policy "Le arquivo de demanda que enxerga" on storage.objects
  for select to authenticated
  using (bucket_id = 'demandas'
         and exists (select 1 from public.tasks t
                     where t.company_id::text = (storage.foldername(name))[1]
                       and t.id::text = (storage.foldername(name))[2]));

drop policy if exists "Sobe arquivo em demanda que enxerga" on storage.objects;
create policy "Sobe arquivo em demanda que enxerga" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'demandas'
              and exists (select 1 from public.tasks t
                          where t.company_id::text = (storage.foldername(name))[1]
                            and t.id::text = (storage.foldername(name))[2]));

drop policy if exists "Apaga arquivo de demanda que enxerga" on storage.objects;
create policy "Apaga arquivo de demanda que enxerga" on storage.objects
  for delete to authenticated
  using (bucket_id = 'demandas'
         and exists (select 1 from public.tasks t
                     where t.company_id::text = (storage.foldername(name))[1]
                       and t.id::text = (storage.foldername(name))[2]));

-- Nome e logo dos clientes das demandas que a pessoa enxerga. O designer
-- recebe arte de cliente que nao esta na carteira dele: precisa saber de quem
-- e, sem ganhar acesso a campanhas e metricas do cliente.
create or replace function public.clientes_das_minhas_demandas()
returns table (id uuid, name text, logo_url text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.logo_url
  from public.clients c
  where c.id in (
    select t.client_id from public.tasks t
    where t.client_id is not null
      and public.is_my_company(t.company_id)
      and (public.is_admin_or_owner(auth.uid()) or t.assigned_to = auth.uid() or t.created_by = auth.uid())
  )
$$;
revoke execute on function public.clientes_das_minhas_demandas() from public, anon;
grant execute on function public.clientes_das_minhas_demandas() to authenticated;

notify pgrst, 'reload schema';
