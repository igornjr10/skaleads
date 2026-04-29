alter table public.clients
  add column if not exists meta_sync_status text not null default 'pending',
  add column if not exists meta_last_sync_at timestamptz,
  add column if not exists meta_last_sync_error text,
  add column if not exists meta_sync_runs integer not null default 0,
  add column if not exists meta_last_verified_at timestamptz,
  add column if not exists meta_auto_sync_enabled boolean not null default false,
  add column if not exists meta_auto_sync_frequency_hours integer not null default 24;

update public.clients
set
  meta_sync_status = case
    when meta_ad_account_id is not null and meta_connected_at is not null then 'healthy'
    when meta_ad_account_id is not null then 'connected'
    else 'pending'
  end,
  meta_last_sync_at = coalesce(meta_last_sync_at, meta_connected_at)
where meta_sync_status is null
   or meta_last_sync_at is null;

alter table public.clients
  add constraint clients_meta_sync_status_check
  check (meta_sync_status in ('pending', 'connected', 'syncing', 'healthy', 'warning', 'error', 'expired'))
  not valid;

alter table public.clients validate constraint clients_meta_sync_status_check;
