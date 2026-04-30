alter table public.clients
  add column if not exists meta_page_id text,
  add column if not exists meta_page_name text,
  add column if not exists meta_instagram_account_id text,
  add column if not exists meta_instagram_username text;
