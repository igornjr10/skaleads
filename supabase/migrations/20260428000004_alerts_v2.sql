-- Relax old required columns (backward compat with existing data)
ALTER TABLE public.alerts ALTER COLUMN metric DROP NOT NULL;
ALTER TABLE public.alerts ALTER COLUMN operator DROP NOT NULL;
ALTER TABLE public.alerts ALTER COLUMN threshold DROP NOT NULL;

-- Drop auto-generated check constraints (PostgreSQL names them {table}_{col}_check)
ALTER TABLE public.alerts DROP CONSTRAINT IF EXISTS alerts_metric_check;
ALTER TABLE public.alerts DROP CONSTRAINT IF EXISTS alerts_operator_check;

-- Add new alert columns
ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS tenant_id uuid references auth.users(id) on delete cascade,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS rule_json jsonb not null default '{"conditions":[],"logic":"AND"}',
  ADD COLUMN IF NOT EXISTS channels jsonb not null default '{"dashboard":true,"email":false,"emailRecipients":[]}',
  ADD COLUMN IF NOT EXISTS cooldown_minutes integer not null default 60,
  ADD COLUMN IF NOT EXISTS last_triggered_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz default now();

-- Add new alert_event columns
ALTER TABLE public.alert_events
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id text,
  ADD COLUMN IF NOT EXISTS entity_name text,
  ADD COLUMN IF NOT EXISTS rule_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Make metric_value optional (some alerts don't have a single scalar value)
ALTER TABLE public.alert_events ALTER COLUMN metric_value DROP NOT NULL;

-- Extend status check to include acknowledged
ALTER TABLE public.alert_events DROP CONSTRAINT IF EXISTS alert_events_status_check;
ALTER TABLE public.alert_events
  ADD CONSTRAINT alert_events_status_check
  CHECK (status IN ('open', 'acknowledged', 'resolved'));

-- Extend existing alert policy to allow owner CRUD
DROP POLICY IF EXISTS "Admins manage alerts" ON public.alerts;
CREATE POLICY "Admins manage alerts" ON public.alerts
  FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_alerts_tenant ON public.alerts(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alerts_client ON public.alerts(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alert_events_alert ON public.alert_events(alert_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_status ON public.alert_events(status) WHERE status = 'open';

-- Touch updated_at trigger for alerts
CREATE TRIGGER trg_alerts_touch BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
