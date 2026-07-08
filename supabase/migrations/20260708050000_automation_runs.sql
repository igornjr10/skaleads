CREATE TABLE IF NOT EXISTS public.automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  success BOOLEAN NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_job_started
  ON public.automation_runs(job_name, started_at DESC);

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view automation runs" ON public.automation_runs;
CREATE POLICY "Authenticated view automation runs" ON public.automation_runs
  FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON public.automation_runs TO authenticated;
GRANT SELECT, INSERT ON public.automation_runs TO service_role;
