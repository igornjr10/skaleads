-- Responsavel por etapa do onboarding (Acessos, Rastreamento, Estrategia,
-- Operacao, Geral), escolhido entre a equipe — sem regra de cargo: qualquer
-- pessoa pode ficar com qualquer etapa e trocar a qualquer momento.
--
-- Cada etapa com responsavel vira UMA demanda em `tasks` (unica por cliente +
-- etapa), que entra na fila do time. Trocar o responsavel atualiza essa mesma
-- linha; o checklist da etapa e o checklist da demanda andam juntos nos dois
-- sentidos, e o status acompanha o progresso.

create table if not exists public.client_fase_responsaveis (
  client_id uuid not null references public.clients(id) on delete cascade,
  fase text not null check (fase in ('acessos', 'rastreamento', 'estrategia', 'operacao', 'geral')),
  responsavel_id uuid references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (client_id, fase)
);

alter table public.client_fase_responsaveis enable row level security;

drop policy if exists "Ve responsavel de etapa da carteira" on public.client_fase_responsaveis;
create policy "Ve responsavel de etapa da carteira" on public.client_fase_responsaveis
  for select to authenticated
  using (client_id in (select id from public.clients));

drop policy if exists "Admin define responsavel de etapa" on public.client_fase_responsaveis;
create policy "Admin define responsavel de etapa" on public.client_fase_responsaveis
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and client_id in (select id from public.clients))
  with check (public.is_admin_or_owner(auth.uid()) and client_id in (select id from public.clients)
              and (responsavel_id is null or responsavel_id = auth.uid() or public.shares_company(responsavel_id)));

grant select, insert, update, delete on public.client_fase_responsaveis to authenticated;
grant select on public.client_fase_responsaveis to service_role;

alter table public.tasks add column if not exists onboarding_fase text;
create unique index if not exists tasks_onboarding_unica
  on public.tasks (client_id, onboarding_fase) where onboarding_fase is not null;


-- Status que o progresso do checklist impoe. Fora desses casos a demanda fica
-- como o responsavel deixou (revisao, aprovado...).
create or replace function public.status_pelo_checklist(_atual text, _total int, _feitas int)
returns text language sql immutable as $$
  select case
    when _total > 0 and _feitas = _total then 'concluida'
    when _atual = 'concluida' then case when _feitas > 0 then 'fazendo' else 'a_fazer' end
    when _feitas > 0 and coalesce(_atual, 'a_fazer') = 'a_fazer' then 'fazendo'
    else coalesce(_atual, 'a_fazer')
  end
$$;


-- Cria ou atualiza a demanda da etapa. So nasce demanda quando a etapa tem
-- responsavel; tirar o responsavel deixa a demanda sem dono, na fila.
create or replace function public.sincronizar_demanda_da_etapa(_client_id uuid, _fase text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resp uuid;
  v_checklist jsonb;
  v_total int;
  v_feitas int;
  v_task public.tasks%rowtype;
  v_cliente text;
  v_rotulo text := case _fase
    when 'acessos' then 'Acessos'
    when 'rastreamento' then 'Rastreamento'
    when 'estrategia' then 'Estratégia'
    when 'operacao' then 'Operação'
    else 'Geral' end;
begin
  select responsavel_id into v_resp
  from public.client_fase_responsaveis where client_id = _client_id and fase = _fase;

  select * into v_task from public.tasks where client_id = _client_id and onboarding_fase = _fase;
  if v_task.id is null and v_resp is null then
    return;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'texto', titulo, 'feito', done) order by posicao), '[]'::jsonb),
         count(*), count(*) filter (where done)
    into v_checklist, v_total, v_feitas
  from public.client_tasks where client_id = _client_id and fase = _fase;

  if v_task.id is null then
    select name into v_cliente from public.clients where id = _client_id;
    insert into public.tasks (titulo, descricao, client_id, assigned_to, created_by, categoria, checklist, status, onboarding_fase)
    values (
      'Onboarding · ' || v_rotulo,
      'Etapa de ' || v_rotulo || ' do onboarding de ' || coalesce(v_cliente, 'cliente')
        || '. O checklist acompanha o da tela de Onboarding.',
      _client_id, v_resp, auth.uid(), 'atendimento', v_checklist,
      public.status_pelo_checklist(null, v_total, v_feitas), _fase
    );
    return;
  end if;

  update public.tasks
     set assigned_to = v_resp,
         checklist = v_checklist,
         status = public.status_pelo_checklist(v_task.status, v_total, v_feitas)
   where id = v_task.id
     and (assigned_to is distinct from v_resp
          or checklist is distinct from v_checklist
          or status is distinct from public.status_pelo_checklist(v_task.status, v_total, v_feitas));
end;
$$;

revoke execute on function public.sincronizar_demanda_da_etapa(uuid, text) from public, anon, authenticated;


create or replace function public.trg_responsavel_da_etapa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create or replace function public.trg_sincronizar_etapa_por_responsavel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sincronizar_demanda_da_etapa(new.client_id, new.fase);
  return null;
end;
$$;

drop trigger if exists trg_client_fase_responsaveis_touch on public.client_fase_responsaveis;
create trigger trg_client_fase_responsaveis_touch
  before insert or update on public.client_fase_responsaveis
  for each row execute function public.trg_responsavel_da_etapa();

drop trigger if exists trg_client_fase_responsaveis_sync on public.client_fase_responsaveis;
create trigger trg_client_fase_responsaveis_sync
  after insert or update on public.client_fase_responsaveis
  for each row execute function public.trg_sincronizar_etapa_por_responsavel();


-- Item marcado, criado, renomeado ou apagado no Onboarding reflete na
-- demanda. Quando a mudanca veio da propria demanda (profundidade > 1), o
-- trigger de tasks ja cuidou do status.
create or replace function public.trg_sincronizar_etapa_por_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.sincronizar_demanda_da_etapa(old.client_id, old.fase);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.fase is distinct from old.fase or new.client_id is distinct from old.client_id) then
    perform public.sincronizar_demanda_da_etapa(new.client_id, new.fase);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_client_tasks_sync_demanda on public.client_tasks;
create trigger trg_client_tasks_sync_demanda
  after insert or update or delete on public.client_tasks
  for each row execute function public.trg_sincronizar_etapa_por_item();


-- Responsavel marcando o checklist na demanda: grava no Onboarding e ajusta o
-- status. So itens que ja sao da etapa; o checklist da demanda nao cria nem
-- apaga item do Onboarding.
create or replace function public.trg_demanda_da_etapa_para_onboarding()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_total int;
  v_feitas int;
begin
  if new.onboarding_fase is null or pg_trigger_depth() > 1 or new.checklist is not distinct from old.checklist then
    return new;
  end if;

  update public.client_tasks ct
     set done = (item->>'feito')::boolean
    from jsonb_array_elements(new.checklist) item
   where ct.id::text = item->>'id'
     and ct.client_id = new.client_id
     and ct.fase = new.onboarding_fase
     and ct.done is distinct from (item->>'feito')::boolean;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'texto', titulo, 'feito', done) order by posicao), '[]'::jsonb),
         count(*), count(*) filter (where done)
    into new.checklist, v_total, v_feitas
  from public.client_tasks where client_id = new.client_id and fase = new.onboarding_fase;

  if new.status is not distinct from old.status then
    new.status := public.status_pelo_checklist(old.status, v_total, v_feitas);
  end if;
  return new;
end;
$$;

-- O nome ordena antes de trg_tasks_guard: o guard carimba concluida_at pelo
-- status final, que este trigger pode ter mudado.
drop trigger if exists trg_tasks_checklist_onboarding on public.tasks;
create trigger trg_tasks_checklist_onboarding
  before update of checklist on public.tasks
  for each row execute function public.trg_demanda_da_etapa_para_onboarding();


-- Responsavel trocado pela tela de Demandas: a etapa acompanha. O caminho
-- contrario (etapa -> demanda) chega aqui com profundidade > 1 e para.
create or replace function public.trg_demanda_da_etapa_responsavel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.onboarding_fase is null or pg_trigger_depth() > 1 or new.assigned_to is not distinct from old.assigned_to then
    return null;
  end if;
  insert into public.client_fase_responsaveis (client_id, fase, responsavel_id)
  values (new.client_id, new.onboarding_fase, new.assigned_to)
  on conflict (client_id, fase) do update set responsavel_id = excluded.responsavel_id;
  return null;
end;
$$;

drop trigger if exists trg_tasks_responsavel_onboarding on public.tasks;
create trigger trg_tasks_responsavel_onboarding
  after update of assigned_to on public.tasks
  for each row execute function public.trg_demanda_da_etapa_responsavel();
