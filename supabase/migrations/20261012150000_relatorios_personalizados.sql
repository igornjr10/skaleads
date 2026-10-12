-- Relatorios personalizados e programados.
--
-- report_schedules ganha o que o gestor configura por agendamento. Tudo
-- opcional: linha antiga (sem modo) continua reenviando o ultimo PDF gerado,
-- como antes. Linha nova (modo 'atualizado') monta o relatorio com os dados do
-- periodo na hora do envio, grava em reports (schedule_id + sent_at = historico)
-- e manda o resumo + link no WhatsApp do cliente.

alter table public.report_schedules
  add column if not exists nome text,
  add column if not exists modo text,
  add column if not exists periodo jsonb,
  add column if not exists metricas jsonb,
  add column if not exists mensagem text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'report_schedules_modo_check'
  ) then
    alter table public.report_schedules
      add constraint report_schedules_modo_check
      check (modo is null or modo in ('atualizado', 'ultimo_pdf'));
  end if;
end $$;

-- Falha de envio tambem vira linha de historico (status 'error'); o motivo
-- fica aqui para a tela mostrar sem abrir log.
alter table public.reports
  add column if not exists erro_envio text;

create index if not exists reports_schedule_idx
  on public.reports (schedule_id, created_at desc)
  where schedule_id is not null;

-- Historico apaga junto com o agendamento? Nao: o relatorio enviado continua
-- valendo para o cliente. So solta o vinculo.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reports_schedule_id_fkey'
  ) then
    alter table public.reports
      add constraint reports_schedule_id_fkey
      foreign key (schedule_id) references public.report_schedules(id) on delete set null
      not valid;
  end if;
end $$;

-- O job usa a service role, cujos grants padrao foram revogados neste projeto.
grant select, update on public.report_schedules to service_role;
grant select, insert, update on public.reports to service_role;
grant select on public.clients to service_role;
grant select on public.campaign_daily_metrics to service_role;
grant select on public.campaigns to service_role;
grant select on public.ads to service_role;
grant select on public.ad_sets to service_role;
grant select on public.companies to service_role;
