-- A policy reports_public_share deixava o anon listar TODO relatorio com link
-- ativo sem saber o token (o filtro por token era so do front, e a anon key e
-- publica). Agora o link publico le uma linha por funcao, e so com o token.
drop policy if exists "reports_public_share" on public.reports;

create or replace function public.relatorio_compartilhado(_token text)
returns table (id uuid, name text, data jsonb, period jsonb, share_token text, view_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.name, r.data, r.period, r.share_token, r.view_count
    from public.reports r
   where _token is not null
     and length(_token) >= 16
     and r.share_token = _token
     and (r.share_expires_at is null or r.share_expires_at > now())
   limit 1;
$$;

revoke all on function public.relatorio_compartilhado(text) from public;
grant execute on function public.relatorio_compartilhado(text) to anon, authenticated;

alter function public.cleanup_ai_cache() set search_path = public;
alter function public.increment_report_views(text) set search_path = public;
