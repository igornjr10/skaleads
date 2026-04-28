-- Cache de respostas de IA (24h TTL)
CREATE TABLE public.ai_cache (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_hash TEXT        NOT NULL UNIQUE,
  action      TEXT        NOT NULL,
  response    JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Log de uso (tokens/custo por tenant)
CREATE TABLE public.ai_usage_logs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        REFERENCES public.clients(id) ON DELETE SET NULL,
  action              TEXT        NOT NULL,
  input_tokens        INTEGER     NOT NULL DEFAULT 0,
  output_tokens       INTEGER     NOT NULL DEFAULT 0,
  estimated_cost_usd  NUMERIC(10,6) NOT NULL DEFAULT 0,
  cached              BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Histórico de gerações de copy
CREATE TABLE public.copy_generations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  produto     TEXT,
  objetivo    TEXT,
  tom         TEXT,
  briefing    TEXT,
  result      JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_cache          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_generations  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view ai_cache"         ON public.ai_cache         FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated view ai_usage_logs"    ON public.ai_usage_logs    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated view copy_generations" ON public.copy_generations  FOR SELECT TO authenticated USING (true);

-- Edge Function escreve via service role (bypassa RLS), mas grants são necessários
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_cache         TO authenticated;
GRANT SELECT, INSERT               ON public.ai_usage_logs     TO authenticated;
GRANT SELECT, INSERT, DELETE       ON public.copy_generations  TO authenticated;

-- Limpar cache expirado (chamar manualmente ou via cron)
CREATE OR REPLACE FUNCTION public.cleanup_ai_cache()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM public.ai_cache WHERE expires_at < now();
$$;
