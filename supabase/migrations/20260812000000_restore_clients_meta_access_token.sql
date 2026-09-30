-- A coluna clients.meta_access_token sumiu do schema exposto pelo PostgREST
-- (PostgREST responde 42703 "column does not exist" tanto quando a coluna foi
-- dropada quanto quando o privilegio de coluna foi revogado do role).
-- Sem ela, salvar a conexao Meta em Clientes falha inteiro.

alter table public.clients
  add column if not exists meta_access_token text;

grant select (meta_access_token), insert (meta_access_token), update (meta_access_token)
  on public.clients to authenticated;

grant select (meta_access_token), insert (meta_access_token), update (meta_access_token)
  on public.clients to service_role;

notify pgrst, 'reload schema';
