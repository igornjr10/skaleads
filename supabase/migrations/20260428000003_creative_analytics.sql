-- Extend ads table with creative fields
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS video_id text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS creative_type text not null default 'image',
  ADD COLUMN IF NOT EXISTS conversions bigint not null default 0,
  ADD COLUMN IF NOT EXISTS frequency numeric(6,2) not null default 0,
  ADD COLUMN IF NOT EXISTS creative_synced_at timestamptz;

-- Per-ad daily metrics (fatigue detection + timeline charts)
create table public.ad_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.ads(id) on delete cascade,
  date date not null,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  spend numeric(12,2) not null default 0,
  conversions bigint not null default 0,
  reach bigint not null default 0,
  frequency numeric(6,2) not null default 0,
  video_3s_views bigint not null default 0,
  video_p25_views bigint not null default 0,
  video_p75_views bigint not null default 0,
  video_thruplay bigint not null default 0,
  unique(ad_id, date)
);
alter table public.ad_daily_metrics enable row level security;
create policy "Authenticated view ad metrics" on public.ad_daily_metrics
  for select to authenticated using (true);
create policy "Admins manage ad metrics" on public.ad_daily_metrics
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()))
  with check (public.is_admin_or_owner(auth.uid()));

-- Audience breakdowns (per client, dimension, date range)
create table public.ad_breakdowns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  date_start date not null,
  date_stop date not null,
  dimension text not null,
  dimension_value text not null,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  spend numeric(12,2) not null default 0,
  conversions bigint not null default 0,
  reach bigint not null default 0,
  unique(client_id, date_start, date_stop, dimension, dimension_value)
);
alter table public.ad_breakdowns enable row level security;
create policy "Authenticated view breakdowns" on public.ad_breakdowns
  for select to authenticated using (true);
create policy "Admins manage breakdowns" on public.ad_breakdowns
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()))
  with check (public.is_admin_or_owner(auth.uid()));

-- Indexes
create index on public.ad_daily_metrics(ad_id, date desc);
create index on public.ad_breakdowns(client_id, dimension, date_start);
create index on public.ads(ad_set_id, spend desc);
