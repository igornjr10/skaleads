-- Neste projeto os grants padrao do service_role foram revogados, entao cada
-- tabela precisa liberar acesso explicitamente (ver *_service_role_grants.sql).
-- A function delete-user le user_roles/profiles para autorizar o chamador e
-- conta o que a cascata vai levar: sem estes grants a leitura falha com
-- 42501 permission denied, que a function reportava como falta de permissao.

do $$
declare
  t text;
begin
  foreach t in array array['user_roles', 'profiles', 'notifications', 'report_templates'] loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select on public.%I to service_role', t);
      raise notice 'SELECT em public.% liberado para service_role', t;
    else
      raise notice 'public.% nao existe, ignorado', t;
    end if;
  end loop;
end $$;
