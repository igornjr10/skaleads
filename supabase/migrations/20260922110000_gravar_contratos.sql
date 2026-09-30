-- Grava o espelho dos contratos sem desfazer o trabalho de quem vinculou a mao.
--
-- A regra que importa e o `case` do client_id: quando alguem vinculou o
-- contrato ao cliente na tela, a sincronizacao seguinte nao pode desvincular so
-- porque o nome do documento nao bate com nenhum cliente. O casamento
-- automatico e um palpite; o vinculo manual e uma decisao.
create or replace function public.gravar_contratos(_linhas jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _gravadas integer;
begin
  insert into public.contratos as alvo
    (autentique_id, client_id, nome, status, criado_em, assinado_em,
     arquivo_original, arquivo_assinado, signatarios, sincronizado_em)
  select
    linha->>'autentique_id',
    nullif(linha->>'client_id', '')::uuid,
    coalesce(nullif(linha->>'nome', ''), '(sem nome)'),
    coalesce(nullif(linha->>'status', ''), 'pendente'),
    nullif(linha->>'criado_em', '')::timestamptz,
    nullif(linha->>'assinado_em', '')::timestamptz,
    nullif(linha->>'arquivo_original', ''),
    nullif(linha->>'arquivo_assinado', ''),
    coalesce(linha->'signatarios', '[]'::jsonb),
    now()
  from jsonb_array_elements(_linhas) as linha
  on conflict (autentique_id) do update set
    nome             = excluded.nome,
    status           = excluded.status,
    criado_em        = excluded.criado_em,
    assinado_em      = excluded.assinado_em,
    arquivo_original = excluded.arquivo_original,
    arquivo_assinado = excluded.arquivo_assinado,
    signatarios      = excluded.signatarios,
    sincronizado_em  = now(),
    client_id = case
      when alvo.vinculo_manual then alvo.client_id
      else coalesce(excluded.client_id, alvo.client_id)
    end;

  get diagnostics _gravadas = row_count;
  return _gravadas;
end;
$$;

revoke all on function public.gravar_contratos(jsonb) from public, anon, authenticated;
grant execute on function public.gravar_contratos(jsonb) to service_role;
