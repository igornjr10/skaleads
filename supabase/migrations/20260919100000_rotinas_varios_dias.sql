-- Rotina semanal passa a aceitar varios dias da semana.
--
-- `dia_semana smallint` guardava um dia so. Uma rotina de segunda, quarta e
-- sexta — que e o caso comum de conferir conta de cliente — exigia cadastrar
-- tres rotinas iguais, e a aderencia ficava repartida entre elas.
--
-- Vira `dias_semana smallint[]`. A coluna antiga sai depois de migrada: manter
-- as duas criaria duas fontes para a mesma pergunta, e em algum momento elas
-- divergiriam.
--
-- Idempotente: pode rodar de novo sem efeito.

-- ── 1. A coluna nova, ja preenchida com o que existe ─────────────────────────
alter table public.rotinas
  add column if not exists dias_semana smallint[];

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rotinas' and column_name = 'dia_semana'
  ) then
    execute $sql$
      update public.rotinas
      set dias_semana = array[dia_semana]::smallint[]
      where periodicidade = 'semanal' and dia_semana is not null and dias_semana is null
    $sql$;
  end if;
end $$;

-- ── 2. A regra de coerencia, agora sobre o array ─────────────────────────────
-- Mesma ideia do CHECK anterior: cada periodicidade usa a sua ancora e nenhuma
-- outra. Semanal passa a exigir pelo menos um dia, e todos entre 0 e 6 — array
-- vazio faria a rotina nunca vencer, calada.
alter table public.rotinas drop constraint if exists rotinas_ancora_coerente;

alter table public.rotinas
  add constraint rotinas_ancora_coerente check (
    (periodicidade = 'diaria'  and dias_semana is null and dia_mes is null)
    or (periodicidade = 'semanal'
        and dias_semana is not null
        and array_length(dias_semana, 1) between 1 and 7
        and dias_semana <@ array[0,1,2,3,4,5,6]::smallint[]
        and dia_mes is null)
    or (periodicidade = 'mensal'  and dia_mes is not null and dias_semana is null)
  );

alter table public.rotinas drop column if exists dia_semana;

-- ── 3. A mesma regra de vencimento que o frontend usa ────────────────────────
-- Espelha src/lib/rotinas.ts. `dow` do Postgres e 0=domingo, igual ao getDay()
-- do JS, entao o array serve aos dois sem traducao. Mexeu aqui, mexa la.
create or replace function public.rotina_vence_em(
  _periodicidade text,
  _dias_semana smallint[],
  _dia_mes smallint,
  _data date
)
returns boolean language sql immutable as $$
  select case _periodicidade
    when 'diaria' then true
    when 'semanal' then _dias_semana is not null
                      and extract(dow from _data)::int = any(_dias_semana)
    when 'mensal' then _dia_mes is not null and extract(day from _data)::int = least(
      _dia_mes,
      -- Ultimo dia do mes: uma rotina do dia 31 nao pode sumir em fevereiro.
      extract(day from (date_trunc('month', _data) + interval '1 month' - interval '1 day'))::int
    )
    else false
  end
$$;

-- A versao antiga some para ninguem chamar por engano: a assinatura mudou de
-- smallint para smallint[], entao as duas conviveriam em silencio.
drop function if exists public.rotina_vence_em(text, smallint, smallint, date);

-- ── 4. O cron passa a ler o array ────────────────────────────────────────────
create or replace function public.notificar_rotinas_do_dia()
returns integer language plpgsql security definer set search_path = public as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  avisadas integer := 0;
begin
  insert into public.rotina_execucoes (rotina_id, data_ref)
  select r.id, hoje
  from public.rotinas r
  where r.ativa
    and r.assigned_to is not null
    and public.rotina_vence_em(r.periodicidade, r.dias_semana, r.dia_mes, hoje)
  on conflict (rotina_id, data_ref) do nothing;

  with pendentes as (
    update public.rotina_execucoes e
    set avisado_at = now()
    from public.rotinas r
    where e.rotina_id = r.id
      and e.data_ref = hoje
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

-- `create or replace` preserva o ACL, mas repetir o revoke deixa explicito: com
-- EXECUTE para public, a chave anonima do bundle dispararia notificacao para a
-- equipe inteira.
revoke execute on function public.notificar_rotinas_do_dia() from public;
revoke execute on function public.notificar_rotinas_do_dia() from anon;
revoke execute on function public.notificar_rotinas_do_dia() from authenticated;
grant  execute on function public.notificar_rotinas_do_dia() to service_role;

notify pgrst, 'reload schema';
