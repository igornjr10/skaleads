-- A tabela nasceu sem privilegio nenhum: criada pela Management API, ficou fora
-- do `alter default privileges` que o Supabase aplica ao que o postgres cria.
-- Sem isto o service_role da 42501 e a coleta nao escreve.
-- A leitura continua governada pela RLS, nao por estes grants.
grant select, insert, update, delete on public.client_instagram_daily to service_role, authenticated;
grant select on public.client_instagram_daily to anon;
grant execute on function public.gravar_instagram_diario(jsonb) to service_role;
