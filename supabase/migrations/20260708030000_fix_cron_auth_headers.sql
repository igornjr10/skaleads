-- O gateway de Edge Functions do Supabase exige um JWT válido no header Authorization
-- por padrão. As chamadas do pg_cron via pg_net só enviavam x-cron-secret, então
-- eram rejeitadas com 401 antes mesmo de chegar no código da function (o segredo
-- x-cron-secret nunca era verificado). A anon key é pública (já embutida no
-- bundle do frontend) e satisfaz o gateway sem conceder nenhum privilégio extra —
-- a autorização real continua sendo o x-cron-secret checado dentro da function.

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'run-alerts-hourly';

SELECT cron.schedule(
  'run-alerts-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://npfcxgijwrxrssinpkdw.supabase.co/functions/v1/run-alerts-cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZmN4Z2lqd3J4cnNzaW5wa2R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzAwMDQsImV4cCI6MjA5MTQ0NjAwNH0.Ac6yXczmlg8B7tXWc1CqyCD98dz2aVxzmQHGdDkdaF0", "x-cron-secret": "E425D9BB379E407BA3AEA32064BA1E86"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'run-scheduled-whatsapp-15min';

SELECT cron.schedule(
  'run-scheduled-whatsapp-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://npfcxgijwrxrssinpkdw.supabase.co/functions/v1/send-scheduled-whatsapp',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZmN4Z2lqd3J4cnNzaW5wa2R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzAwMDQsImV4cCI6MjA5MTQ0NjAwNH0.Ac6yXczmlg8B7tXWc1CqyCD98dz2aVxzmQHGdDkdaF0", "x-cron-secret": "E425D9BB379E407BA3AEA32064BA1E86"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
