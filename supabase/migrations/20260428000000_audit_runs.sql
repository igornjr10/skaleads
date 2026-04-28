CREATE TABLE public.audit_runs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  score       INTEGER     NOT NULL DEFAULT 0,
  category_scores JSONB   NOT NULL DEFAULT '{}',
  results     JSONB       NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view audit runs" ON public.audit_runs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage audit runs" ON public.audit_runs
  FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_runs TO authenticated;
