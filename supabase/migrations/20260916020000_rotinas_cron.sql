-- Sino diario das rotinas.
--
-- Diferente de run-alerts-cron e sync-meta-cron, que existem como Edge Function
-- porque o trabalho delas e HTTP (Meta API, e-mail), aqui e tudo SQL: ler
-- rotinas, cruzar com as baixas e escrever em notifications. Chamar por pg_net
-- so acrescentaria uma chamada de rede e um segredo para vazar.

alter table public.rotina_execucoes
  add column if not exists avisado_at timestamptz;


-- ── A mesma regra de vencimento que o frontend usa ──────────────────────────
-- Espelha src/lib/rotinas.ts. `dow` do Postgres e 0=domingo, igual ao getDay()
-- do JS, entao dia_semana serve aos dois sem traducao. Mexeu aqui, mexa la.
create or replace function public.rotina_vence_em(
  _periodicidade text,
  _dia_semana smallint,
  _dia_mes smallint,
  _data date
)
returns boolean language sql immutable as $$
  select case _periodicidade
    when 'diaria' then true
    when 'semanal' then extract(dow from _data)::int = _dia_semana
    when 'mensal' then _dia_mes is not null and extract(day from _data)::int = least(
      _dia_mes,
      -- Ultimo dia do mes: uma rotina do dia 31 nao pode sumir em fevereiro.
      extract(day from (date_trunc('month', _data) + interval '1 month' - interval '1 day'))::int
    )
    else false
  end
$$;


-- ── O aviso ─────────────────────────────────────────────────────────────────
create or replace function public.notificar_rotinas_do_dia()
returns integer language plpgsql security definer set search_path = public as $$
declare
  -- pg_cron agenda em UTC. Sem converter, depois das 21h de Brasilia o "hoje"
  -- do banco ja seria o dia seguinte e o aviso cairia na ocorrencia errada.
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  avisadas integer := 0;
begin
  -- 1. Materializa a ocorrencia de hoje. O unique (rotina_id, data_ref) faz o
  --    ON CONFLICT segurar tanto a rodada repetida do cron quanto a baixa que
  --    alguem ja tenha dado na tela antes do horario do aviso.
  insert into public.rotina_execucoes (rotina_id, data_ref)
  select r.id, hoje
  from public.rotinas r
  where r.ativa
    and r.assigned_to is not null
    and public.rotina_vence_em(r.periodicidade, r.dia_semana, r.dia_mes, hoje)
  on conflict (rotina_id, data_ref) do nothing;

  -- 2. Avisa so quem ainda tem pendencia e ainda nao foi avisado hoje. O
  --    avisado_at e carimbado no mesmo comando que gera o aviso, entao uma
  --    segunda execucao do cron no mesmo dia nao duplica nada.
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

-- Funcao nova nasce com EXECUTE para PUBLIC, e o grant abaixo so soma. Sem o
-- revoke, a chave anonima do bundle dispara notificacao para a equipe inteira.
revoke execute on function public.notificar_rotinas_do_dia() from public;
revoke execute on function public.notificar_rotinas_do_dia() from anon;
revoke execute on function public.notificar_rotinas_do_dia() from authenticated;
grant  execute on function public.notificar_rotinas_do_dia() to service_role;


-- ── Agendamento ─────────────────────────────────────────────────────────────
create extension if not exists pg_cron with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'notificar-rotinas-diarias';

-- 11:00 UTC = 08:00 em Brasilia. O Brasil nao tem mais horario de verao, entao
-- o offset -3 e fixo e nao precisa de dois agendamentos.
select cron.schedule(
  'notificar-rotinas-diarias',
  '0 11 * * *',
  $$ select public.notificar_rotinas_do_dia(); $$
);

notify pgrst, 'reload schema';
