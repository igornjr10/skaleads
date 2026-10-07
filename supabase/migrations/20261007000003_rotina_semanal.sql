-- Rotina semanal por equipe: abas por time, demanda pontual, prioridade,
-- status por ocorrencia, remanejar a ocorrencia de dia e WhatsApp do membro
-- para o lembrete.
--
-- Idempotente: pode rodar de novo sem efeito.

-- ── 1. Equipes (as abas) ─────────────────────────────────────────────────────
create table if not exists public.rotina_equipes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.default_company_id()
    references public.companies(id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists rotina_equipes_company_idx on public.rotina_equipes (company_id, ordem);

alter table public.rotina_equipes enable row level security;

drop policy if exists "Company view rotina_equipes" on public.rotina_equipes;
create policy "Company view rotina_equipes" on public.rotina_equipes
  for select to authenticated using (public.is_my_company(company_id));

drop policy if exists "Company admins manage rotina_equipes" on public.rotina_equipes;
create policy "Company admins manage rotina_equipes" on public.rotina_equipes
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id));

grant select, insert, update, delete on public.rotina_equipes to authenticated;
grant select, insert, update, delete on public.rotina_equipes to service_role;

-- Empresa nova chega sem equipe; a tela chama isto na 1a visita do ADM.
create or replace function public.garantir_equipes_rotina()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _empresa uuid := public.my_team_id();
begin
  if _empresa is null or not public.is_admin_or_owner(auth.uid()) then
    return;
  end if;
  if exists (select 1 from public.rotina_equipes where company_id = _empresa) then
    return;
  end if;
  insert into public.rotina_equipes (company_id, nome, ordem)
  values (_empresa, 'Gestor de tráfego', 1), (_empresa, 'Social seller', 2), (_empresa, 'SDR', 3);
end;
$$;

revoke all on function public.garantir_equipes_rotina() from public, anon;
grant execute on function public.garantir_equipes_rotina() to authenticated;

insert into public.rotina_equipes (company_id, nome, ordem)
select c.id, e.nome, e.ordem
from public.companies c
cross join (values ('Gestor de tráfego', 1), ('Social seller', 2), ('SDR', 3)) as e(nome, ordem)
where not exists (select 1 from public.rotina_equipes x where x.company_id = c.id);


-- ── 2. Rotina: equipe, prioridade e demanda pontual ─────────────────────────
alter table public.rotinas
  add column if not exists equipe_id uuid references public.rotina_equipes(id) on delete set null,
  add column if not exists prioridade text not null default 'moderada',
  add column if not exists data_pontual date;

alter table public.rotinas drop constraint if exists rotinas_prioridade_check;
alter table public.rotinas
  add constraint rotinas_prioridade_check check (prioridade in ('urgente', 'moderada', 'leve'));

alter table public.rotinas drop constraint if exists rotinas_periodicidade_check;
alter table public.rotinas
  add constraint rotinas_periodicidade_check check (periodicidade in ('pontual', 'diaria', 'semanal', 'mensal'));

alter table public.rotinas drop constraint if exists rotinas_ancora_coerente;
alter table public.rotinas
  add constraint rotinas_ancora_coerente check (
    (periodicidade = 'pontual' and data_pontual is not null and dias_semana is null and dia_mes is null)
    or (periodicidade = 'diaria' and data_pontual is null and dias_semana is null and dia_mes is null)
    or (periodicidade = 'semanal'
        and data_pontual is null
        and dias_semana is not null
        and array_length(dias_semana, 1) between 1 and 7
        and dias_semana <@ array[0,1,2,3,4,5,6]::smallint[]
        and dia_mes is null)
    or (periodicidade = 'mensal' and data_pontual is null and dia_mes is not null and dias_semana is null)
  );

create index if not exists idx_rotinas_equipe on public.rotinas (equipe_id) where ativa;

-- A equipe tem que ser da mesma empresa da rotina.
create or replace function public.conferir_equipe_rotina()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.equipe_id is not null and not exists (
    select 1 from public.rotina_equipes e where e.id = new.equipe_id and e.company_id = new.company_id
  ) then
    raise exception 'Equipe de outra empresa' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Nome com "z" para rodar depois de trg_rotinas_company, que define company_id.
drop trigger if exists trg_rotinas_z_equipe on public.rotinas;
create trigger trg_rotinas_z_equipe
  before insert or update of equipe_id, client_id on public.rotinas
  for each row execute function public.conferir_equipe_rotina();


-- ── 3. Ocorrencia: status, dia remanejado e lembrete ────────────────────────
-- data_ref continua sendo o dia em que a ocorrencia vence pela regra (a
-- aderencia conta por ela); mover_para e so onde ela aparece na semana.
alter table public.rotina_execucoes
  add column if not exists status text not null default 'pendente',
  add column if not exists mover_para date,
  add column if not exists lembrete_wa_at timestamptz;

alter table public.rotina_execucoes drop constraint if exists rotina_execucoes_status_check;
alter table public.rotina_execucoes
  add constraint rotina_execucoes_status_check check (status in ('pendente', 'andamento', 'concluida'));

update public.rotina_execucoes set status = 'concluida' where done and status <> 'concluida';

-- `done` segue existindo (aderencia, cron, tela Do dia); status e done andam
-- juntos aqui para que quem grava um nao precise lembrar do outro.
create or replace function public.touch_rotina_execucao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    if new.done and new.status = 'pendente' then
      new.status := 'concluida';
    else
      new.done := new.status = 'concluida';
    end if;
  elsif new.status is distinct from old.status then
    new.done := new.status = 'concluida';
  elsif new.done is distinct from old.done then
    new.status := case when new.done then 'concluida' else 'pendente' end;
  end if;

  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at := now();
    new.done_by := auth.uid();
  elsif not new.done then
    new.done_at := null;
    new.done_by := null;
  end if;
  return new;
end;
$$;


-- ── 4. Vencimento com demanda pontual ───────────────────────────────────────
-- Espelha venceEm de src/lib/rotinas.ts. Mexeu aqui, mexa la.
create or replace function public.rotina_vence_em(
  _periodicidade text,
  _dias_semana smallint[],
  _dia_mes smallint,
  _data_pontual date,
  _data date
)
returns boolean language sql immutable as $$
  select case _periodicidade
    when 'pontual' then _data_pontual = _data
    when 'diaria' then true
    when 'semanal' then _dias_semana is not null
                      and extract(dow from _data)::int = any(_dias_semana)
    when 'mensal' then _dia_mes is not null and extract(day from _data)::int = least(
      _dia_mes,
      extract(day from (date_trunc('month', _data) + interval '1 month' - interval '1 day'))::int
    )
    else false
  end
$$;

create or replace function public.notificar_rotinas_do_dia()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  avisadas integer := 0;
begin
  insert into public.rotina_execucoes (rotina_id, data_ref)
  select r.id, hoje
  from public.rotinas r
  where r.ativa
    and r.assigned_to is not null
    and public.rotina_vence_em(r.periodicidade, r.dias_semana, r.dia_mes, r.data_pontual, hoje)
  on conflict (rotina_id, data_ref) do nothing;

  -- Avisa no dia em que a ocorrencia aparece, que pode ter sido remanejado.
  with pendentes as (
    update public.rotina_execucoes e
    set avisado_at = now()
    from public.rotinas r
    where e.rotina_id = r.id
      and coalesce(e.mover_para, e.data_ref) = hoje
      and e.avisado_at is null
      and not e.done
      and r.ativa
      and r.assigned_to is not null
    returning r.assigned_to, r.titulo, r.horario_limite
  )
  insert into public.notifications (user_id, type, title, body)
  select
    p.assigned_to,
    'rotina',
    'Rotina de hoje: ' || p.titulo,
    coalesce('Prazo ate ' || to_char(p.horario_limite, 'HH24:MI'), 'Sem horario limite')
  from pendentes p;

  get diagnostics avisadas = row_count;
  return avisadas;
end;
$$;

drop function if exists public.rotina_vence_em(text, smallint[], smallint, date);

revoke execute on function public.notificar_rotinas_do_dia() from public;
revoke execute on function public.notificar_rotinas_do_dia() from anon;
revoke execute on function public.notificar_rotinas_do_dia() from authenticated;
grant  execute on function public.notificar_rotinas_do_dia() to service_role;


-- ── 5. WhatsApp do membro da equipe ─────────────────────────────────────────
-- Fica no vinculo com a empresa: o ADM cadastra em Configuracoes > Equipe
-- (company-members) e so a Edge Function rotina-lembrete le, com service role.
alter table public.user_companies
  add column if not exists whatsapp text;

notify pgrst, 'reload schema';
