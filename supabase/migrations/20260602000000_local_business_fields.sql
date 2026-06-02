-- Campos de negócio local no cadastro de clientes
alter table public.clients
  add column if not exists business_segment text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists address text,
  add column if not exists service_radius_km integer,
  add column if not exists primary_goal text;
