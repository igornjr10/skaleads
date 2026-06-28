-- Enable required extensions (safe to run even if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- Remove existing job if present (idempotent)
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'run-alerts-hourly';

-- Schedule hourly alert evaluation via pg_cron + pg_net
SELECT cron.schedule(
  'run-alerts-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://npfcxgijwrxrssinpkdw.supabase.co/functions/v1/run-alerts-cron',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "E425D9BB379E407BA3AEA32064BA1E86"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
