-- A cada 6 horas, nao de hora em hora: contrato muda pouco, e quando muda o
-- webhook ja avisa na hora. Esta varredura e a rede de seguranca para evento
-- perdido e para documento criado antes de o webhook existir.
select cron.schedule(
  'sync-autentique-6h',
  '40 */6 * * *',
  $$select public.dispatch_cron_job('sync-autentique', 120000);$$
);
