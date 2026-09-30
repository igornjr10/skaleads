-- Grava o retrato diario do Instagram sem apagar o que ja esta la.
--
-- Duas razoes para nao usar o upsert do PostgREST:
--
-- 1. Ele exige que todas as linhas do lote tenham exatamente as mesmas chaves,
--    e o nosso lote e irregular de proposito: o total de seguidores so existe
--    para hoje, as visitas so para ontem, o ganho para os 30 dias anteriores.
--
-- 2. Com merge-duplicates o `null` sobrescreve. A execucao de amanha, que traz
--    o ganho de hoje mas nao o total de hoje, apagaria o total gravado hoje.
--    Por isso cada coluna cai num coalesce: o que chega vazio nao encosta no
--    que ja foi medido.
create or replace function public.gravar_instagram_diario(_linhas jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _gravadas integer;
begin
  insert into public.client_instagram_daily as alvo
    (client_id, date, followers_total, followers_gained, profile_views)
  select
    (linha->>'client_id')::uuid,
    (linha->>'date')::date,
    nullif(linha->>'followers_total', '')::integer,
    nullif(linha->>'followers_gained', '')::integer,
    nullif(linha->>'profile_views', '')::integer
  from jsonb_array_elements(_linhas) as linha
  on conflict (client_id, date) do update set
    followers_total  = coalesce(excluded.followers_total,  alvo.followers_total),
    followers_gained = coalesce(excluded.followers_gained, alvo.followers_gained),
    profile_views    = coalesce(excluded.profile_views,    alvo.profile_views),
    captured_at      = now();

  get diagnostics _gravadas = row_count;
  return _gravadas;
end;
$$;

revoke all on function public.gravar_instagram_diario(jsonb) from public, anon, authenticated;
