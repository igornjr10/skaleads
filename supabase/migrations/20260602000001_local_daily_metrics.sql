-- Métricas de conversão local agregadas por dia/cliente
alter table public.campaign_daily_metrics
  add column if not exists messages integer not null default 0,
  add column if not exists calls integer not null default 0,
  add column if not exists directions integer not null default 0,
  add column if not exists leads integer not null default 0,
  add column if not exists profile_visits integer not null default 0;
