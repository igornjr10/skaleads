-- Report templates (branding + sections config)
create table public.report_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sections jsonb not null default '["cover","summary","campaigns","recommendations"]',
  branding jsonb not null default '{"primaryColor":"#6366f1","agencyName":"","logoUrl":""}',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- Reports
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  period jsonb not null default '{}',
  template_id uuid references public.report_templates(id),
  data jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','generating','ready','error')),
  file_url text,
  share_token text unique,
  share_expires_at timestamptz,
  schedule_id uuid,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- Report schedules
create table public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  template_id uuid references public.report_templates(id),
  cron text not null,
  email_recipients jsonb not null default '[]',
  is_active boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.report_templates enable row level security;
alter table public.reports enable row level security;
alter table public.report_schedules enable row level security;

create policy "reports_owner" on public.reports for all using (tenant_id = auth.uid());
create policy "reports_public_share" on public.reports for select to anon
  using (share_token is not null and (share_expires_at is null or share_expires_at > now()));

create policy "templates_owner" on public.report_templates for all using (tenant_id = auth.uid());
create policy "schedules_owner" on public.report_schedules for all using (tenant_id = auth.uid());

-- Indexes
create index on public.reports(tenant_id, client_id, created_at desc);
create index on public.reports(share_token) where share_token is not null;
create index on public.report_schedules(next_run_at) where is_active = true;
create index on public.report_templates(tenant_id);

-- Increment view count via RPC (called from public share page)
create or replace function public.increment_report_views(p_share_token text)
returns void language plpgsql security definer as $$
begin
  update public.reports
  set view_count = view_count + 1
  where share_token = p_share_token
    and (share_expires_at is null or share_expires_at > now());
end;
$$;
