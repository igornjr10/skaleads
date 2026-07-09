GRANT SELECT, UPDATE ON public.report_schedules TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'run-report-schedules-hourly';

SELECT cron.schedule(
  'run-report-schedules-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://npfcxgijwrxrssinpkdw.supabase.co/functions/v1/run-report-schedules',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZmN4Z2lqd3J4cnNzaW5wa2R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzAwMDQsImV4cCI6MjA5MTQ0NjAwNH0.Ac6yXczmlg8B7tXWc1CqyCD98dz2aVxzmQHGdDkdaF0", "x-cron-secret": "E425D9BB379E407BA3AEA32064BA1E86"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
