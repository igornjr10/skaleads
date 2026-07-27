-- Enable required extensions (safe to run even if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- Remove existing job if present (idempotent)
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'sync-meta-hourly';

-- Roda a cada hora; a funcao decide por cliente se a sync esta vencida
-- (meta_auto_sync_enabled + meta_auto_sync_frequency_hours), entao rodar
-- o dispatcher a cada hora nao significa chamar a Meta a cada hora por cliente.
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
