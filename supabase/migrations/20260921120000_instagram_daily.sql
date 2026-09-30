-- Retrato diario do Instagram de cada cliente.
--
-- A Graph API so entrega insights de perfil dos ultimos 30 dias, e o total de
-- seguidores so no valor de hoje. Guardando um retrato por dia a serie deixa de
-- ter teto: "quanto cresceu nos ultimos 6 meses" passa a ter resposta.
--
-- `followers_total` e o retrato absoluto e so existe do dia em que comecamos a
-- gravar em diante — nao da para reconstruir o passado. `followers_gained` e
-- `profile_views` sao do dia e a Meta entrega 30 dias para tras, entao a
-- primeira execucao ja nasce com um mes de historico.

create table if not exists public.client_instagram_daily (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  date date not null,
  followers_total integer,
  followers_gained integer,
  profile_views integer,
  captured_at timestamptz not null default now(),
  unique (client_id, date)
);

create index if not exists client_instagram_daily_client_date_idx
  on public.client_instagram_daily (client_id, date desc);

alter table public.client_instagram_daily enable row level security;

create policy "instagram_daily_team"
  on public.client_instagram_daily
  for all
  to authenticated
  using (can_access_client(client_id))
  with check (can_access_client(client_id));

create policy "instagram_daily_admin"
  on public.client_instagram_daily
  for all
  to authenticated
  using (is_admin_or_owner(auth.uid()))
  with check (is_admin_or_owner(auth.uid()));
