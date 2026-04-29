-- Backfill safety migration for environments that still have the old alerts schema.
-- This is idempotent and can be applied even if alerts_v2 already ran.

ALTER TABLE public.alerts ALTER COLUMN metric DROP NOT NULL;
ALTER TABLE public.alerts ALTER COLUMN operator DROP NOT NULL;
ALTER TABLE public.alerts ALTER COLUMN threshold DROP NOT NULL;

ALTER TABLE public.alerts DROP CONSTRAINT IF EXISTS alerts_metric_check;
ALTER TABLE public.alerts DROP CONSTRAINT IF EXISTS alerts_operator_check;

ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS tenant_id uuid references auth.users(id) on delete cascade,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS rule_json jsonb not null default '{"conditions":[],"logic":"AND"}',
  ADD COLUMN IF NOT EXISTS channels jsonb not null default '{"dashboard":true,"email":false,"emailRecipients":[]}',
  ADD COLUMN IF NOT EXISTS cooldown_minutes integer not null default 60,
  ADD COLUMN IF NOT EXISTS last_triggered_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz default now();

ALTER TABLE public.alert_events
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id text,
  ADD COLUMN IF NOT EXISTS entity_name text,
  ADD COLUMN IF NOT EXISTS rule_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.alert_events ALTER COLUMN metric_value DROP NOT NULL;

ALTER TABLE public.alert_events DROP CONSTRAINT IF EXISTS alert_events_status_check;
ALTER TABLE public.alert_events
  ADD CONSTRAINT alert_events_status_check
  CHECK (status IN ('open', 'acknowledged', 'resolved'));

DROP POLICY IF EXISTS "Admins manage alerts" ON public.alerts;
CREATE POLICY "Admins manage alerts" ON public.alerts
  FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_alerts_tenant ON public.alerts(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alerts_client ON public.alerts(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alert_events_alert ON public.alert_events(alert_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_status ON public.alert_events(status) WHERE status = 'open';

DROP TRIGGER IF EXISTS trg_alerts_touch ON public.alerts;
CREATE TRIGGER trg_alerts_touch BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
