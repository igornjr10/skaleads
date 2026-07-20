-- O service_role tinha apenas leitura implicita em alerts/alert_events: o cron
-- conseguia avaliar os alertas, mas o INSERT do evento e o UPDATE de
-- last_triggered_at eram rejeitados sem erro visivel. Sem gravar o cooldown,
-- todo alerta disparava de novo a cada execucao do cron.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_events TO service_role;
