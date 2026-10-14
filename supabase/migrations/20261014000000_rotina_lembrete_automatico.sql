-- Lembrete automatico no WhatsApp, escolhido em cada demanda da Rotina.
--
-- `lembrete_minutos_antes` nulo = as 8h do dia; com numero, sai esse tanto
-- antes do horario limite (sem horario limite, cai nas 8h tambem).
-- O carimbo do automatico e separado do manual (`lembrete_wa_at`): alguem
-- clicar no WhatsApp do card nao pode impedir o lembrete combinado.
alter table public.rotinas
  add column if not exists lembrete_auto boolean not null default false,
  add column if not exists lembrete_minutos_antes integer
    check (lembrete_minutos_antes is null or lembrete_minutos_antes between 0 and 720);

alter table public.rotina_execucoes
  add column if not exists lembrete_auto_at timestamptz;

-- Ocorrencias de hoje (horario de Brasilia) cujo lembrete ja deu a hora e
-- ainda nao saiu. A remanejada para hoje entra; a remanejada para outro dia sai.
create or replace function public.rotinas_para_lembrar()
returns table (rotina_id uuid, data_ref date)
language sql
stable
security definer
set search_path to 'public'
as $$
  with agora as (
    select (now() at time zone 'America/Sao_Paulo') as ts,
           (now() at time zone 'America/Sao_Paulo')::date as hoje
  ),
  ocorrencias as (
    select r.id as rotina_id, a.hoje as data_ref
    from public.rotinas r, agora a
    where public.rotina_vence_em(r.periodicidade, r.dias_semana, r.dia_mes, r.data_pontual, a.hoje)
    union
    select e.rotina_id, e.data_ref
    from public.rotina_execucoes e, agora a
    where e.mover_para = a.hoje
  )
  select o.rotina_id, o.data_ref
  from ocorrencias o
  join public.rotinas r on r.id = o.rotina_id
  left join public.rotina_execucoes e on e.rotina_id = o.rotina_id and e.data_ref = o.data_ref
  cross join agora a
  where r.ativa
    and r.lembrete_auto
    and r.assigned_to is not null
    and coalesce(e.mover_para, o.data_ref) = a.hoje
    and not coalesce(e.done, false)
    and coalesce(e.status, 'pendente') <> 'concluida'
    and e.lembrete_auto_at is null
    and a.ts >= case
      when r.lembrete_minutos_antes is not null and r.horario_limite is not null
        then a.hoje + r.horario_limite - make_interval(mins => r.lembrete_minutos_antes)
      else a.hoje + time '08:00'
    end
$$;

revoke all on function public.rotinas_para_lembrar() from public, anon, authenticated;
grant execute on function public.rotinas_para_lembrar() to service_role;

select cron.schedule(
  'rotina-lembrete-5min',
  '*/5 * * * *',
  $$select public.dispatch_cron_job('rotina-lembrete', 60000);$$
);
