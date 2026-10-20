-- Datas da Meta: start_time/stop_time da campanha ou, sem stop_time, o maior
-- end_time dos conjuntos (ver fimDaCampanha em _shared/prazo-campanha.ts).
alter table public.campaigns
  add column if not exists start_time timestamptz,
  add column if not exists end_time timestamptz;

create index if not exists campaigns_end_time_idx on public.campaigns (end_time)
  where end_time is not null and status in ('ACTIVE', 'PAUSED');

-- O sync ja grava COMPLETED quando a data passou; isto cobre o intervalo entre
-- um sync e outro, para a lista nao mostrar "Ativa" numa oferta que ja acabou.
create or replace function public.concluir_campanhas_vencidas()
returns integer
language sql
security definer
set search_path = public
as $$
  with feitas as (
    update public.campaigns
       set status = 'COMPLETED', updated_at = now()
     where end_time is not null
       and end_time <= now()
       and status in ('ACTIVE', 'PAUSED')
    returning 1
  )
  select count(*)::integer from feitas;
$$;

revoke all on function public.concluir_campanhas_vencidas() from public, anon, authenticated;
grant execute on function public.concluir_campanhas_vencidas() to service_role;

select cron.schedule(
  'concluir-campanhas-vencidas',
  '*/15 * * * *',
  $$select public.concluir_campanhas_vencidas();$$
);
