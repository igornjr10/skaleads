-- De hora em hora, e nao uma vez por dia: cada execucao mede so um lote (o
-- pg_net corta a chamada em 5s), entao a carteira fecha o dia em algumas
-- voltas. Quem ja foi medido hoje e pulado, entao as voltas seguintes sao
-- baratas — a ultima levou meio segundo.
select cron.schedule(
  'sync-instagram-daily-hourly',
  '20 * * * *',
  $$select public.dispatch_cron_job('sync-instagram-daily');$$
);
