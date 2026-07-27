-- Alinha o sync-meta-cron ao mesmo padrao de run-alerts-cron / run-report-schedules:
-- JWT verificado pelo gateway (Authorization: Bearer <anon key>) + x-cron-secret
-- proprio da funcao, em vez de --no-verify-jwt. Sem o Authorization aqui, o
-- gateway rejeita a chamada com 401 antes mesmo do handler rodar.

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'sync-meta-hourly';

SELECT cron.schedule(
  'sync-meta-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://npfcxgijwrxrssinpkdw.supabase.co/functions/v1/sync-meta-cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZmN4Z2lqd3J4cnNzaW5wa2R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzAwMDQsImV4cCI6MjA5MTQ0NjAwNH0.Ac6yXczmlg8B7tXWc1CqyCD98dz2aVxzmQHGdDkdaF0", "x-cron-secret": "E425D9BB379E407BA3AEA32064BA1E86"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
