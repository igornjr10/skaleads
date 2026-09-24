-- Token da Pagina do Facebook, que ate agora era descoberto e jogado fora.
--
-- `fetchFacebookPages` (src/lib/meta-discovery.ts) ja pede `access_token` no
-- PAGE_FIELDS, mas a gravacao do cliente so guardava id e nome. As chamadas de
-- Pagina saiam entao com o token de USUARIO, e a Meta respondia:
--
--   (#10) This endpoint requires the 'pages_read_engagement' permission or the
--   'Page Public Content Access' feature...
--
-- A documentacao de Page Insights exige Page access token com `read_insights`
-- e `pages_read_engagement`. Token de usuario e a causa classica do #10.
--
-- Vale o mesmo cuidado de `meta_access_token`: e credencial, e fica protegida
-- pela RLS da propria tabela `clients`.
--
-- Idempotente: pode rodar de novo sem efeito.

alter table public.clients
  add column if not exists meta_page_access_token text;

comment on column public.clients.meta_page_access_token is
  'Page access token da Pagina do Facebook vinculada. Derivado do token de usuario de longa duracao, usado nas leituras de Pagina e de Instagram. Preenchido ao conectar a Meta.';

notify pgrst, 'reload schema';
