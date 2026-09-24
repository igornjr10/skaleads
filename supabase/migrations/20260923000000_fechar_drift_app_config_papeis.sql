-- Fecha tres buracos entre o repo e o banco: `app_config`, `get_my_role()` e
-- `can_access_client()`.
--
-- Os tres existem no banco da carteira atual mas nenhuma migration deste repo os
-- cria: nasceram fora, no marketpro-manager ou na mao. So aparecem quando alguem
-- levanta uma instancia nova — foi o que travou a subida do Midsam em 23/09/2026,
-- primeiro no `can_access_client` da RLS do Instagram e depois no `app_config`
-- que a `dispatch_cron_job` le.
--
-- TUDO AQUI E GUARDADO POR EXISTENCIA, de proposito. Rodar este arquivo num
-- banco que ja tem as tres nao muda nada. Isso importa porque as definicoes da
-- carteira atual nao estao acessiveis para conferencia — a conta do CLI perdeu o
-- acesso aquele projeto —, entao o que esta escrito abaixo e reconstrucao a
-- partir do uso, nao copia do original. `create or replace` sem guarda trocaria
-- uma funcao que funciona por uma parecida, e ninguem ia perceber na hora.

-- ── app_config ──────────────────────────────────────────────────────────────
-- Chave/valor para o que nao pode viver no git. Hoje guarda o trio que a
-- `dispatch_cron_job` le: functions_base_url, cron_anon_key e cron_secret.
create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_config is
  'Configuracao que nao entra no repo (URL base das functions, anon key e segredo do cron). Sem policy de leitura: so service_role e o dono do banco enxergam.';

alter table public.app_config enable row level security;

-- Nenhuma policy, de proposito: `cron_secret` aqui dentro e a credencial que
-- autoriza disparar qualquer Edge Function. Uma policy de select para
-- `authenticated` entregaria isso a qualquer usuario logado. Quem le e a
-- `dispatch_cron_job`, que e SECURITY DEFINER e roda como dono.
revoke all on public.app_config from anon, authenticated;
grant select, insert, update, delete on public.app_config to service_role;

-- ── get_my_role ─────────────────────────────────────────────────────────────
-- `useAuth` chama isto no login e cai em 'viewer' quando vem null.
--
-- `user_roles` permite mais de uma linha por usuario, e o front espera UM valor.
-- A ordem abaixo e explicita em vez de usar a ordem do enum: no enum, `viewer`
-- vem antes de `editor` e `designer`, entao ordenar por ele daria o papel menos
-- privilegiado para quem tem dois.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_my_role'
  ) then
    execute $fn$
      create function public.get_my_role()
      returns app_role
      language sql
      stable
      security definer
      set search_path to 'public'
      as $body$
        select role
        from public.user_roles
        where user_id = auth.uid()
        order by case role
          when 'owner'    then 1
          when 'admin'    then 2
          when 'analyst'  then 3
          when 'editor'   then 4
          when 'designer' then 5
          when 'viewer'   then 6
          else 7
        end
        limit 1
      $body$;
    $fn$;
  end if;
end $$;

-- ── can_access_client ───────────────────────────────────────────────────────
-- Usada na RLS de `client_instagram_daily`: `using (can_access_client(client_id))`.
--
-- Nao e SECURITY DEFINER, e isso e a decisao inteira. Rodando como quem chama,
-- o `select` abaixo passa pela RLS de `clients` e herda a regra que ja existe
-- (`has_role(owner) or company_id in my_company_ids()`). Como DEFINER eu teria
-- que reescrever essa regra aqui, e ela passaria a existir em dois lugares para
-- divergir com o tempo.
--
-- E o mesmo efeito do padrao que as outras tabelas ja usam na mao
-- (`client_id in (select id from clients)`), so que com nome.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'can_access_client'
  ) then
    execute $fn$
      create function public.can_access_client(p_client_id uuid)
      returns boolean
      language sql
      stable
      set search_path to 'public'
      as $body$
        select exists (select 1 from public.clients c where c.id = p_client_id)
      $body$;
    $fn$;
  end if;
end $$;

grant execute on function public.get_my_role() to authenticated;
grant execute on function public.can_access_client(uuid) to authenticated;

notify pgrst, 'reload schema';
