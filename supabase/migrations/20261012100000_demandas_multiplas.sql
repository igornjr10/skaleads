-- Demanda com varios clientes e varios responsaveis.
--
-- `tasks.assigned_to` continua sendo o responsavel PRINCIPAL: aviso, historico,
-- onboarding e a regra do guard_task_update seguem iguais. Os demais entram em
-- `task_corresponsaveis` e enxergam/andam com a demanda como o principal.
--
-- Cliente: demanda de um cliente so continua em `tasks.client_id`. Demanda de
-- varios clientes ("otimizar campanhas de todos os ativos") deixa client_id
-- nulo e lista os clientes em `task_clientes`, cada um com o proprio "feito" —
-- e o progresso por cliente.
--
-- Recorrencia: uma demanda modelo (semanal, quinzenal, mensal) que, ao ser
-- concluida, abre a proxima com os mesmos clientes e responsaveis, zerada.
--
-- Roda DEPOIS de 20261012000000_central_operacional (prazo_hora e
-- aguardando_cliente): o guard_task_update daqui e o de la mais recorrencia.

-- ── Quem mexe ────────────────────────────────────────────────────────────────
-- SECURITY DEFINER: as policies de tasks e das tabelas filhas se consultam;
-- lendo por funcao nao ha recursao de RLS.

create table if not exists public.task_corresponsaveis (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index if not exists task_corresponsaveis_user_idx on public.task_corresponsaveis (user_id);

create or replace function public.e_corresponsavel(_task_id uuid, _user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.task_corresponsaveis where task_id = _task_id and user_id = _user_id)
$$;
revoke execute on function public.e_corresponsavel(uuid, uuid) from public, anon;
grant execute on function public.e_corresponsavel(uuid, uuid) to authenticated;

-- Edita a demanda inteira: quem pediu ou o ADM da empresa.
create or replace function public.pode_editar_demanda(_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = _task_id
      and public.is_my_company(t.company_id)
      and (t.created_by = auth.uid() or public.is_admin_or_owner(auth.uid()))
  )
$$;
revoke execute on function public.pode_editar_demanda(uuid) from public, anon;
grant execute on function public.pode_editar_demanda(uuid) to authenticated;

-- Anda com a demanda (status, checklist, feito por cliente): quem edita mais
-- o principal e os corresponsaveis.
create or replace function public.pode_mexer_na_demanda(_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = _task_id
      and public.is_my_company(t.company_id)
      and (t.created_by = auth.uid()
           or t.assigned_to = auth.uid()
           or public.is_admin_or_owner(auth.uid())
           or public.e_corresponsavel(t.id))
  )
$$;
revoke execute on function public.pode_mexer_na_demanda(uuid) from public, anon;
grant execute on function public.pode_mexer_na_demanda(uuid) to authenticated;

-- ── tasks: corresponsavel enxerga e anda ─────────────────────────────────────

drop policy if exists "Ve demandas da empresa, suas ou pedidas por voce" on public.tasks;
create policy "Ve demandas da empresa, suas ou pedidas por voce" on public.tasks
  for select to authenticated
  using (public.is_my_company(company_id)
         and (public.is_admin_or_owner(auth.uid()) or assigned_to = auth.uid() or created_by = auth.uid()
              or public.e_corresponsavel(id)));

-- O que o corresponsavel pode mudar e o mesmo do principal (status e
-- checklist): guard_task_update ja barra o resto para quem nao pediu.
drop policy if exists "Responsavel ou quem pediu atualiza" on public.tasks;
create policy "Responsavel ou quem pediu atualiza" on public.tasks
  for update to authenticated
  using (public.is_my_company(company_id)
         and (assigned_to = auth.uid() or created_by = auth.uid() or public.e_corresponsavel(id)))
  with check (public.is_my_company(company_id)
              and (assigned_to is null or assigned_to = auth.uid() or public.shares_company(assigned_to)));

alter table public.task_corresponsaveis enable row level security;

drop policy if exists "Ve corresponsaveis de demanda que enxerga" on public.task_corresponsaveis;
create policy "Ve corresponsaveis de demanda que enxerga" on public.task_corresponsaveis
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

drop policy if exists "Quem pediu define corresponsaveis" on public.task_corresponsaveis;
create policy "Quem pediu define corresponsaveis" on public.task_corresponsaveis
  for insert to authenticated
  with check (public.pode_editar_demanda(task_id) and (user_id = auth.uid() or public.shares_company(user_id)));

drop policy if exists "Quem pediu tira corresponsaveis" on public.task_corresponsaveis;
create policy "Quem pediu tira corresponsaveis" on public.task_corresponsaveis
  for delete to authenticated
  using (public.pode_editar_demanda(task_id));

grant select, insert, delete on public.task_corresponsaveis to authenticated;
grant select, insert, update, delete on public.task_corresponsaveis to service_role;

-- ── Clientes da demanda ──────────────────────────────────────────────────────

create table if not exists public.task_clientes (
  task_id uuid not null references public.tasks(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  feito boolean not null default false,
  feito_em timestamptz,
  feito_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, client_id)
);
create index if not exists task_clientes_client_idx on public.task_clientes (client_id);

alter table public.task_clientes enable row level security;

drop policy if exists "Ve clientes de demanda que enxerga" on public.task_clientes;
create policy "Ve clientes de demanda que enxerga" on public.task_clientes
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

-- Cliente novo precisa estar na carteira de quem pede (mesma regra de tasks).
drop policy if exists "Quem pediu inclui cliente" on public.task_clientes;
create policy "Quem pediu inclui cliente" on public.task_clientes
  for insert to authenticated
  with check (public.pode_editar_demanda(task_id) and client_id in (select id from public.clients));

drop policy if exists "Quem pediu tira cliente" on public.task_clientes;
create policy "Quem pediu tira cliente" on public.task_clientes
  for delete to authenticated
  using (public.pode_editar_demanda(task_id));

drop policy if exists "Quem anda com a demanda marca cliente" on public.task_clientes;
create policy "Quem anda com a demanda marca cliente" on public.task_clientes
  for update to authenticated
  using (public.pode_mexer_na_demanda(task_id))
  with check (public.pode_mexer_na_demanda(task_id));

-- Pela tela so se marca "feito"; trocar o cliente e tirar e incluir.
grant select, insert, delete on public.task_clientes to authenticated;
grant update (feito) on public.task_clientes to authenticated;
grant select, insert, update, delete on public.task_clientes to service_role;

create or replace function public.carimbar_cliente_da_demanda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.feito and not coalesce(old.feito, false) then
    new.feito_em := now();
    new.feito_por := auth.uid();
  elsif not new.feito then
    new.feito_em := null;
    new.feito_por := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_task_clientes_carimbo on public.task_clientes;
create trigger trg_task_clientes_carimbo
  before update of feito on public.task_clientes
  for each row execute function public.carimbar_cliente_da_demanda();

-- ── Avisos ───────────────────────────────────────────────────────────────────

create or replace function public.notify_corresponsavel()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_titulo text;
  v_prazo date;
begin
  if new.user_id = auth.uid() then
    return new;
  end if;
  select titulo, prazo into v_titulo, v_prazo from public.tasks where id = new.task_id;
  insert into public.notifications (user_id, type, title, body, link)
  values (new.user_id, 'tarefa', 'Você entrou numa demanda',
          coalesce(v_titulo, 'Demanda') || coalesce(' - prazo ' || to_char(v_prazo, 'DD/MM'), ''),
          '/demandas?demanda=' || new.task_id);
  return new;
end;
$$;

drop trigger if exists trg_task_corresponsaveis_notify on public.task_corresponsaveis;
create trigger trg_task_corresponsaveis_notify
  after insert on public.task_corresponsaveis
  for each row execute function public.notify_corresponsavel();

-- Comentario avisa tambem os corresponsaveis.
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

  for destino in
    select distinct d from (
      select unnest(array[tarefa.assigned_to, tarefa.created_by]) as d
      union
      select user_id from public.task_corresponsaveis where task_id = tarefa.id
    ) pessoas
    where d is not null and d is distinct from new.autor_id
  loop
    insert into public.notifications (user_id, type, title, body)
    values (destino, 'tarefa', 'Nova observacao em: ' || tarefa.titulo, left(new.texto, 200));
  end loop;

  return new;
end;
$$;

-- ── Recorrencia ──────────────────────────────────────────────────────────────

alter table public.tasks add column if not exists recorrencia text;
alter table public.tasks drop constraint if exists tasks_recorrencia_check;
alter table public.tasks add constraint tasks_recorrencia_check
  check (recorrencia is null or recorrencia in ('semanal', 'quinzenal', 'mensal'));
alter table public.tasks add column if not exists recorrencia_origem uuid references public.tasks(id) on delete set null;
create unique index if not exists tasks_recorrencia_unica on public.tasks (recorrencia_origem) where recorrencia_origem is not null;

-- Concluiu a demanda recorrente: nasce a proxima, uma vez so (indice unico em
-- recorrencia_origem), com o prazo empurrado a partir do prazo anterior —
-- concluir atrasado nao desloca o calendario.
create or replace function public.abrir_proxima_recorrencia()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_passo interval;
  v_base date;
  v_prazo date;
  v_nova uuid;
begin
  if new.recorrencia is null or new.status <> 'concluida' or old.status = 'concluida' then
    return new;
  end if;
  if exists (select 1 from public.tasks where recorrencia_origem = new.id) then
    return new;
  end if;

  v_passo := case new.recorrencia when 'semanal' then interval '7 days'
                                  when 'quinzenal' then interval '14 days'
                                  else interval '1 month' end;
  v_base := coalesce(new.prazo, current_date);
  v_prazo := (v_base + v_passo)::date;
  -- Se o prazo antigo ficou muito para tras, pula ciclos ate cair no futuro.
  while v_prazo < current_date loop
    v_prazo := (v_prazo + v_passo)::date;
  end loop;

  insert into public.tasks (
    titulo, descricao, client_id, status, prioridade, categoria, checklist, prazo, prazo_hora,
    assigned_to, created_by, company_id, recorrencia, recorrencia_origem
  ) values (
    new.titulo, new.descricao, new.client_id, 'a_fazer', new.prioridade, new.categoria,
    coalesce((select jsonb_agg(jsonb_set(item, '{feito}', 'false'::jsonb)) from jsonb_array_elements(new.checklist) item), '[]'::jsonb),
    v_prazo, new.prazo_hora, new.assigned_to, new.created_by, new.company_id, new.recorrencia, new.id
  ) returning id into v_nova;

  insert into public.task_corresponsaveis (task_id, user_id)
  select v_nova, user_id from public.task_corresponsaveis where task_id = new.id;

  insert into public.task_clientes (task_id, client_id)
  select v_nova, client_id from public.task_clientes where task_id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_tasks_recorrencia on public.tasks;
create trigger trg_tasks_recorrencia
  after update of status on public.tasks
  for each row execute function public.abrir_proxima_recorrencia();

-- Quem pediu edita a recorrencia; o responsavel nao. Resto igual ao de
-- 20261012000000_central_operacional.
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
    new.aguardando_cliente := false;
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
     or new.prazo_hora is distinct from old.prazo_hora
     or new.assigned_to is distinct from old.assigned_to
     or new.categoria is distinct from old.categoria
     or new.recorrencia is distinct from old.recorrencia then
    raise exception 'Voce pode alterar apenas o status e o checklist desta demanda';
  end if;

  return new;
end;
$$;

-- ── Nome dos clientes das demandas ───────────────────────────────────────────

create or replace function public.clientes_das_minhas_demandas()
returns table (id uuid, name text, logo_url text)
language sql
stable
security definer
set search_path = public
as $$
  with minhas as (
    select t.id, t.client_id from public.tasks t
    where public.is_my_company(t.company_id)
      and (public.is_admin_or_owner(auth.uid()) or t.assigned_to = auth.uid() or t.created_by = auth.uid()
           or public.e_corresponsavel(t.id))
  )
  select c.id, c.name, c.logo_url
  from public.clients c
  where c.id in (select client_id from minhas where client_id is not null)
     or c.id in (select tc.client_id from public.task_clientes tc where tc.task_id in (select id from minhas))
$$;
revoke execute on function public.clientes_das_minhas_demandas() from public, anon;
grant execute on function public.clientes_das_minhas_demandas() to authenticated;

-- O quadro de Demandas se atualiza sozinho tambem quando muda cliente ou
-- corresponsavel.
do $$
declare
  t text;
begin
  foreach t in array array['task_clientes', 'task_corresponsaveis'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
