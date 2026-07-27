-- service_role so tinha SELECT (ou nenhum grant) em campaigns/ad_sets/ads/
-- campaign_daily_metrics/clients: o cron de sync conseguiria ler mas todo
-- INSERT/UPDATE seria rejeitado, igual ao bug que ja corrigimos em alerts.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_sets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_daily_metrics TO service_role;
GRANT SELECT, UPDATE ON public.clients TO service_role;
