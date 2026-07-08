CREATE TABLE IF NOT EXISTS public.whatsapp_scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  target_group_jids TEXT[] NOT NULL DEFAULT '{}',
  send_time TIME NOT NULL DEFAULT '08:00',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sent_date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_scheduled_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage whatsapp scheduled messages" ON public.whatsapp_scheduled_messages;
CREATE POLICY "Admins manage whatsapp scheduled messages" ON public.whatsapp_scheduled_messages
  FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

DROP TRIGGER IF EXISTS trg_whatsapp_scheduled_messages_touch ON public.whatsapp_scheduled_messages;
CREATE TRIGGER trg_whatsapp_scheduled_messages_touch BEFORE UPDATE ON public.whatsapp_scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Enable required extensions (safe to run even if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'run-scheduled-whatsapp-15min';

SELECT cron.schedule(
  'run-scheduled-whatsapp-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://npfcxgijwrxrssinpkdw.supabase.co/functions/v1/send-scheduled-whatsapp',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "E425D9BB379E407BA3AEA32064BA1E86"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
