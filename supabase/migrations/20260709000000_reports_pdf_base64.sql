ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS pdf_base64 text;

GRANT SELECT ON public.reports TO service_role;
