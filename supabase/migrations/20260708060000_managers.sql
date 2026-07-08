CREATE TABLE IF NOT EXISTS public.managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.managers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage managers" ON public.managers;
CREATE POLICY "Admins manage managers" ON public.managers
  FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.managers TO authenticated;
GRANT SELECT ON public.managers TO service_role;
