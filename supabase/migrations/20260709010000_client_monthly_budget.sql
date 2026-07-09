-- Verba mensal do cliente, usada pelo alerta de "verba acabando"
alter table public.clients
  add column if not exists monthly_budget numeric;
