-- Corrige um furo introduzido na migration anterior.
--
-- seed_client_tasks e SECURITY DEFINER, e no Postgres funcao nova ja nasce com
-- EXECUTE para PUBLIC. O "grant execute ... to authenticated" que eu escrevi
-- dava a impressao de restringir, mas nao revogava o PUBLIC — entao um chamador
-- anonimo, so com a chave publica, conseguia executar a funcao. E como ela e
-- SECURITY DEFINER, o insert dela nao passa pela RLS de client_tasks: quem
-- soubesse o UUID de um cliente conseguiria semear checklist nele.
--
-- Verificado em producao: a chamada anonima chegou ate o erro 23503 (chave
-- estrangeira), ou seja, o corpo da funcao executou.

revoke execute on function public.seed_client_tasks(uuid) from public;
revoke execute on function public.seed_client_tasks(uuid) from anon;
grant  execute on function public.seed_client_tasks(uuid) to authenticated;

-- Mesmo problema, menor: user_can_access_client so deveria ser chamada pelas
-- Edge Functions com service_role. Aberta ao PUBLIC, virava um oraculo — dava
-- para perguntar "o usuario X enxerga o cliente Y?" sabendo os dois UUIDs.
-- As demais can_access_* continuam liberadas para authenticated de proposito:
-- as policies de RLS precisam executa-las em nome de quem consulta.
revoke execute on function public.user_can_access_client(uuid, uuid) from public;
revoke execute on function public.user_can_access_client(uuid, uuid) from anon, authenticated;
grant  execute on function public.user_can_access_client(uuid, uuid) to service_role;

-- Segunda barreira: mesmo autenticado, so semeia cliente do proprio time.
-- A condicao sobre auth.uid() preserva o caminho do trigger, que roda sem
-- usuario quando a insercao vem de service_role.
create or replace function public.seed_client_tasks(_client_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inseridas int;
begin
  if auth.uid() is not null and not public.can_access_client(_client_id) then
    raise exception 'Cliente fora da sua carteira';
  end if;

  if exists (select 1 from public.client_tasks where client_id = _client_id) then
    return 0;
  end if;

  insert into public.client_tasks (client_id, fase, titulo, posicao)
  select _client_id, fase, titulo, posicao
  from (values
    ('acessos',       'Contrato assinado e escopo combinado',                      10),
    ('acessos',       'Acesso de parceiro no Business Manager do cliente',          20),
    ('acessos',       'Conta de anuncios compartilhada com a agencia',              30),
    ('acessos',       'Forma de pagamento ativa e limite conferido',                40),
    ('acessos',       'Pagina do Facebook e perfil do Instagram vinculados',        50),

    ('rastreamento',  'Pixel instalado e disparando no site',                       60),
    ('rastreamento',  'Conversions API (CAPI) configurada',                         70),
    ('rastreamento',  'Dominio verificado no Business Manager',                     80),
    ('rastreamento',  'Eventos priorizados definidos (pos iOS 14)',                 90),
    ('rastreamento',  'Publicos personalizados criados',                           100),

    ('estrategia',    'Briefing preenchido: publico, oferta e diferenciais',       110),
    ('estrategia',    'Materiais recebidos (logo, fotos, videos)',                 120),
    ('estrategia',    'Verba mensal definida e cadastrada',                        130),
    ('estrategia',    'Objetivo principal acordado com o cliente',                 140),
    ('estrategia',    'Reuniao de kickoff realizada',                              150),

    ('operacao',      'Cliente cadastrado e conta Meta conectada no Scale Ads',    160),
    ('operacao',      'Primeira sincronizacao concluida',                          170),
    ('operacao',      'Primeira auditoria rodada e pontos criticos tratados',      180),
    ('operacao',      'Alertas configurados para a conta',                         190),
    ('operacao',      'Modelo de relatorio definido',                              200),
    ('operacao',      'Grupo ou numero de WhatsApp do cliente cadastrado',         210),
    ('operacao',      'Primeira campanha no ar',                                   220)
  ) as t(fase, titulo, posicao);

  get diagnostics inseridas = row_count;
  return inseridas;
end;
$$;

revoke execute on function public.seed_client_tasks(uuid) from public;
revoke execute on function public.seed_client_tasks(uuid) from anon;
grant  execute on function public.seed_client_tasks(uuid) to authenticated;
