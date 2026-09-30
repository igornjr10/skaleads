-- Correcao de uma falha aberta pela migration anterior, que ja rodou no banco.
--
-- `20260916100000_reportei_connect.sql` revogou a RPC de anon e authenticated,
-- mas no Postgres toda funcao nasce com EXECUTE concedido a PUBLIC — e os dois
-- papeis herdam por ali. O revoke nao tirou nada: a chave anonima, que e
-- publica por definicao (vai no bundle do front), chamava
-- `connect_persist_customer` e, sendo SECURITY DEFINER, ela executava.
--
-- O estrago possivel era gravar por cima do `api_token` de um cliente. Esse
-- token o Connect devolve uma unica vez e nao ha como recuperar: sobrescrever
-- obriga a recriar o cliente no Connect e refazer todas as conexoes dele.
--
-- Idempotente: pode rodar de novo sem efeito.

revoke execute on function public.connect_persist_customer(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.connect_persist_customer(uuid, uuid, text)
  to service_role;
