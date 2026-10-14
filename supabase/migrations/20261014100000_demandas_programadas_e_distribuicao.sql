-- Demandas programadas, recorrencia diaria/dias uteis e distribuicao automatica.
--
-- `inicia_em`: a demanda existe desde ja (quem pediu acompanha), mas so
-- "chega" para quem executa nessa data. `liberada_em` carimba quando chegou;
-- o aviso do sino (e o WhatsApp da Central de Automacoes, chave nova_demanda)
-- saem a partir dele.
--
-- Distribuicao: demanda criada sem responsavel numa categoria com regra cai
-- para o gestor do cliente (se a regra pedir) ou para quem da lista tem menos
-- demandas abertas.
--
-- Roda DEPOIS de 20261012100000_demandas_multiplas: guard_task_update e
-- abrir_proxima_recorrencia daqui sao os de la mais inicia_em.

-- ── Programadas ──────────────────────────────────────────────────────────────

alter table public.tasks
  add column if not exists inicia_em date,
  add column if not exists liberada_em timestamptz,
  add column if not exists distribuida_auto boolean not null default false;

update public.tasks set liberada_em = created_at where liberada_em is null and inicia_em is null;

create index if not exists tasks_programadas_idx on public.tasks (inicia_em)
  where liberada_em is null and inicia_em is not null;

create or replace function public.hoje_sp()
returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create or replace function public.demanda_liberada(_inicia_em date)
returns boolean language sql stable as $$
  select _inicia_em is null or _inicia_em <= public.hoje_sp()
$$;

-- Carimba a liberacao no insert e quando o ADM/quem pediu muda a data.
create or replace function public.carimbar_liberacao_demanda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.liberada_em := case when public.demanda_liberada(new.inicia_em) then now() end;
  elsif new.inicia_em is distinct from old.inicia_em then
    if public.demanda_liberada(new.inicia_em) then
      new.liberada_em := coalesce(old.liberada_em, now());
    else
      new.liberada_em := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tasks_liberacao on public.tasks;
create trigger trg_tasks_liberacao
  before insert or update of inicia_em on public.tasks
  for each row execute function public.carimbar_liberacao_demanda();

-- ── Distribuicao automatica ──────────────────────────────────────────────────

create table if not exists public.demanda_distribuicao (
  company_id uuid not null default public.default_company_id() references public.companies(id) on delete cascade,
  categoria text not null,
  pessoas uuid[] not null default '{}',
  gestor_do_cliente boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (company_id, categoria)
);

alter table public.demanda_distribuicao enable row level security;

drop policy if exists "Equipe ve a distribuicao" on public.demanda_distribuicao;
create policy "Equipe ve a distribuicao" on public.demanda_distribuicao
  for select to authenticated
  using (public.is_my_company(company_id));

drop policy if exists "ADM configura a distribuicao" on public.demanda_distribuicao;
create policy "ADM configura a distribuicao" on public.demanda_distribuicao
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id));

grant select, insert, update, delete on public.demanda_distribuicao to authenticated;
grant all on public.demanda_distribuicao to service_role;

-- Abertas = nao concluidas, como principal ou corresponsavel. Programada que
-- ainda nao chegou tambem pesa: ja e trabalho reservado para a pessoa.
create or replace function public.carga_aberta(_user_id uuid, _company_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.tasks t
  where t.company_id = _company_id
    and t.status <> 'concluida'
    and (t.assigned_to = _user_id
         or exists (select 1 from public.task_corresponsaveis c where c.task_id = t.id and c.user_id = _user_id))
$$;
revoke execute on function public.carga_aberta(uuid, uuid) from public, anon;
grant execute on function public.carga_aberta(uuid, uuid) to authenticated;

create or replace function public.distribuir_demanda()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_regra public.demanda_distribuicao%rowtype;
  v_escolhido uuid;
begin
  if new.assigned_to is not null or new.onboarding_fase is not null then
    return new;
  end if;

  select * into v_regra from public.demanda_distribuicao
  where company_id = new.company_id and categoria = new.categoria;
  if not found then
    return new;
  end if;

  if v_regra.gestor_do_cliente and new.client_id is not null then
    select c.manager_id into v_escolhido
    from public.clients c
    join public.user_companies uc on uc.user_id = c.manager_id and uc.company_id = new.company_id
    where c.id = new.client_id;
  end if;

  if v_escolhido is null then
    select p into v_escolhido
    from unnest(v_regra.pessoas) as p
    where exists (select 1 from public.user_companies uc where uc.user_id = p and uc.company_id = new.company_id)
    order by public.carga_aberta(p, new.company_id), random()
    limit 1;
  end if;

  if v_escolhido is not null then
    new.assigned_to := v_escolhido;
    new.distribuida_auto := true;
  end if;
  return new;
end;
$$;

-- Nome com "z" para rodar depois de trg_tasks_company, que define company_id.
drop trigger if exists trg_tasks_z_distribuir on public.tasks;
create trigger trg_tasks_z_distribuir
  before insert on public.tasks
  for each row execute function public.distribuir_demanda();

-- ── Avisos esperam a liberacao ──────────────────────────────────────────────

create or replace function public.notify_task_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is null or new.assigned_to = auth.uid() or new.liberada_em is null then
    return new;
  end if;

  -- O if e aninhado de proposito: o AND do SQL nao garante curto-circuito, e
  -- ler OLD durante um INSERT aborta com "record old is not assigned yet".
  if tg_op = 'UPDATE' then
    if new.assigned_to is not distinct from old.assigned_to then
      return new;
    end if;
  end if;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.assigned_to,
    'tarefa',
    case when new.distribuida_auto then 'Nova demanda para você (distribuída automaticamente)' else 'Nova demanda para você' end,
    new.titulo || coalesce(' - prazo ' || to_char(new.prazo, 'DD/MM'), ''),
    '/demandas?demanda=' || new.id
  );

  return new;
end;
$$;

create or replace function public.notify_corresponsavel()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_titulo text;
  v_prazo date;
  v_liberada timestamptz;
begin
  if new.user_id = auth.uid() then
    return new;
  end if;
  select titulo, prazo, liberada_em into v_titulo, v_prazo, v_liberada from public.tasks where id = new.task_id;
  if v_liberada is null then
    return new;
  end if;
  insert into public.notifications (user_id, type, title, body, link)
  values (new.user_id, 'tarefa', 'Você entrou numa demanda',
          coalesce(v_titulo, 'Demanda') || coalesce(' - prazo ' || to_char(v_prazo, 'DD/MM'), ''),
          '/demandas?demanda=' || new.task_id);
  return new;
end;
$$;

-- Chega o dia (a partir das 7h de Brasilia): carimba e avisa principal e
-- corresponsaveis. O carimbo e o que impede o cron de avisar de novo.
create or replace function public.liberar_demandas_programadas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  agora timestamp := now() at time zone 'America/Sao_Paulo';
  avisos integer := 0;
begin
  with liberadas as (
    update public.tasks t
    set liberada_em = now()
    where t.liberada_em is null
      and t.inicia_em is not null
      and t.status <> 'concluida'
      and (t.inicia_em < agora::date or (t.inicia_em = agora::date and agora::time >= time '07:00'))
    returning t.id, t.titulo, t.prazo, t.assigned_to
  ),
  destinos as (
    select l.id, l.titulo, l.prazo, l.assigned_to as user_id from liberadas l where l.assigned_to is not null
    union
    select l.id, l.titulo, l.prazo, c.user_id from liberadas l join public.task_corresponsaveis c on c.task_id = l.id
  )
  insert into public.notifications (user_id, type, title, body, link)
  select d.user_id, 'tarefa', 'Demanda programada chegou: ' || d.titulo,
         coalesce('Prazo ' || to_char(d.prazo, 'DD/MM'), 'Sem prazo definido'),
         '/demandas?demanda=' || d.id
  from destinos d;

  get diagnostics avisos = row_count;
  return avisos;
end;
$$;

revoke execute on function public.liberar_demandas_programadas() from public, anon, authenticated;
grant execute on function public.liberar_demandas_programadas() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'demandas-programadas') then
    perform cron.unschedule('demandas-programadas');
  end if;
end $$;

select cron.schedule('demandas-programadas', '*/30 * * * *', $$select public.liberar_demandas_programadas();$$);

-- ── Recorrencia: diaria e dias uteis ─────────────────────────────────────────

alter table public.tasks drop constraint if exists tasks_recorrencia_check;
alter table public.tasks add constraint tasks_recorrencia_check
  check (recorrencia is null or recorrencia in ('diaria', 'dias_uteis', 'semanal', 'quinzenal', 'mensal'));

-- A proxima nasce com a mesma antecedencia da atual: um relatorio semanal que
-- chegou 2 dias antes do prazo volta 2 dias antes do proximo prazo, em vez de
-- aparecer na fila assim que a atual e concluida.
create or replace function public.abrir_proxima_recorrencia()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_passo interval;
  v_base date;
  v_prazo date;
  v_antecedencia integer;
  v_inicia date;
  v_nova uuid;
begin
  if new.recorrencia is null or new.status <> 'concluida' or old.status = 'concluida' then
    return new;
  end if;
  if exists (select 1 from public.tasks where recorrencia_origem = new.id) then
    return new;
  end if;

  v_passo := case new.recorrencia when 'diaria' then interval '1 day'
                                  when 'dias_uteis' then interval '1 day'
                                  when 'semanal' then interval '7 days'
                                  when 'quinzenal' then interval '14 days'
                                  else interval '1 month' end;
  v_base := coalesce(new.prazo, public.hoje_sp());
  v_prazo := (v_base + v_passo)::date;
  -- Se o prazo antigo ficou muito para tras, pula ciclos ate cair no futuro.
  while v_prazo < public.hoje_sp()
        or (new.recorrencia = 'dias_uteis' and extract(isodow from v_prazo) in (6, 7)) loop
    v_prazo := (v_prazo + v_passo)::date;
  end loop;

  v_antecedencia := greatest(0, v_base - coalesce(new.inicia_em, (new.created_at at time zone 'America/Sao_Paulo')::date));
  v_antecedencia := least(v_antecedencia, (v_prazo - v_base) - 1);
  v_inicia := v_prazo - greatest(v_antecedencia, 0);
  if v_inicia <= public.hoje_sp() then
    v_inicia := null;
  end if;

  insert into public.tasks (
    titulo, descricao, client_id, status, prioridade, categoria, checklist, prazo, prazo_hora,
    assigned_to, created_by, company_id, recorrencia, recorrencia_origem, inicia_em, distribuida_auto
  ) values (
    new.titulo, new.descricao, new.client_id, 'a_fazer', new.prioridade, new.categoria,
    coalesce((select jsonb_agg(jsonb_set(item, '{feito}', 'false'::jsonb)) from jsonb_array_elements(new.checklist) item), '[]'::jsonb),
    v_prazo, new.prazo_hora, new.assigned_to, new.created_by, new.company_id, new.recorrencia, new.id, v_inicia,
    new.distribuida_auto
  ) returning id into v_nova;

  insert into public.task_corresponsaveis (task_id, user_id)
  select v_nova, user_id from public.task_corresponsaveis where task_id = new.id;

  insert into public.task_clientes (task_id, client_id)
  select v_nova, client_id from public.task_clientes where task_id = new.id;

  return new;
end;
$$;

-- Quem pediu edita a data de inicio; o responsavel nao. Resto igual ao de
-- 20261012100000_demandas_multiplas.
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
     or new.recorrencia is distinct from old.recorrencia
     or new.inicia_em is distinct from old.inicia_em then
    raise exception 'Voce pode alterar apenas o status e o checklist desta demanda';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
