-- Tira o CRON_SECRET (e a URL das functions) de dentro do SQL versionado.
--
-- Antes, seis migrations traziam o segredo literal no header do net.http_post:
--   "x-cron-secret": "E425D9BB..."
-- Ele e o unico gate dos endpoints de cron (run-alerts-cron, sync-meta-cron,
-- run-report-schedules, send-scheduled-whatsapp) e estava no historico do git,
-- visivel para qualquer pessoa com acesso ao repositorio.
--
-- Agora os jobs chamam public.dispatch_cron_job(), que le a configuracao de uma
-- tabela fechada. Trocar o segredo passa a ser um UPDATE, sem reescrever job.
--
-- ATENCAO: depois de rodar esta migration, gere um segredo NOVO. O antigo
-- continua no historico do git e deve ser considerado queimado.

create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

-- RLS ligada e sem policy: nega para anon e authenticated. O pg_cron roda como
-- superusuario e a funcao abaixo e SECURITY DEFINER, entao os jobs enxergam.
revoke all on public.app_config from anon, authenticated;
grant all on public.app_config to service_role;

-- Semente: mantem o ambiente funcionando no minuto seguinte a migration.
-- Troque os dois valores logo em seguida (veja o UPDATE comentado no fim).
insert into public.app_config (key, value) values
  ('functions_base_url', 'https://npfcxgijwrxrssinpkdw.supabase.co/functions/v1'),
  ('cron_anon_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZmN4Z2lqd3J4cnNzaW5wa2R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzAwMDQsImV4cCI6MjA5MTQ0NjAwNH0.Ac6yXczmlg8B7tXWc1CqyCD98dz2aVxzmQHGdDkdaF0'),
  ('cron_secret', 'E425D9BB379E407BA3AEA32064BA1E86')
on conflict (key) do nothing;

-- Dispatcher unico: monta o header em tempo de execucao a partir do app_config.
create or replace function public.dispatch_cron_job(_function_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  anon_key text;
  secret   text;
  req_id   bigint;
begin
  select value into base_url from public.app_config where key = 'functions_base_url';
  select value into anon_key from public.app_config where key = 'cron_anon_key';
  select value into secret   from public.app_config where key = 'cron_secret';

  if base_url is null or anon_key is null or secret is null then
    raise exception 'app_config incompleto: precisa de functions_base_url, cron_anon_key e cron_secret';
  end if;

  -- A anon key satisfaz o gateway de Edge Functions (que exige JWT valido);
  -- a autorizacao de verdade e o x-cron-secret, checado dentro da function.
  select net.http_post(
    url     := base_url || '/' || _function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'x-cron-secret', secret
    ),
    body    := '{}'::jsonb
  ) into req_id;

  return req_id;
end;
$$;

revoke execute on function public.dispatch_cron_job(text) from public, anon, authenticated;

-- Reagenda os quatro jobs sem segredo no corpo.
select cron.unschedule(jobid) from cron.job where jobname = 'run-alerts-hourly';
select cron.schedule('run-alerts-hourly', '0 * * * *',
  $$ select public.dispatch_cron_job('run-alerts-cron'); $$);

select cron.unschedule(jobid) from cron.job where jobname = 'run-scheduled-whatsapp-15min';
select cron.schedule('run-scheduled-whatsapp-15min', '*/15 * * * *',
  $$ select public.dispatch_cron_job('send-scheduled-whatsapp'); $$);

select cron.unschedule(jobid) from cron.job where jobname = 'run-report-schedules-hourly';
select cron.schedule('run-report-schedules-hourly', '0 * * * *',
  $$ select public.dispatch_cron_job('run-report-schedules'); $$);

select cron.unschedule(jobid) from cron.job where jobname = 'sync-meta-hourly';
select cron.schedule('sync-meta-hourly', '0 * * * *',
  $$ select public.dispatch_cron_job('sync-meta-cron'); $$);

-- ── DEPOIS DE RODAR ESTA MIGRATION ───────────────────────────────────────────
-- 1. Gere um segredo novo (ex.: select encode(gen_random_bytes(16), 'hex'))
-- 2. Rode, com o valor gerado:
--      update public.app_config set value = '<NOVO>', updated_at = now()
--      where key = 'cron_secret';
-- 3. Atualize o secret CRON_SECRET das Edge Functions no dashboard com o MESMO
--    valor. Enquanto os dois nao baterem, os jobs voltam 401.
