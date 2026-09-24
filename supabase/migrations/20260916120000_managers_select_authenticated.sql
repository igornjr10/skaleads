-- O seletor de destino do AlertBuilder passou a listar gestor por gestor, e nao
-- so o numero padrao do secret. Para popular essa lista o front le
-- `public.managers` — mas a unica policy da tabela ("Admins manage managers",
-- FOR ALL) exige `is_admin_or_owner`, e a rota /alerts/new nao e restrita a
-- admin. Sem isto o usuario comum abre o seletor e a secao "Gestores" vem
-- vazia, sem erro nenhum, que e o pior tipo de falha: silenciosa.
--
-- Libera so leitura. Escrita continua sendo do admin, pela policy que ja existe
-- (as duas sao permissivas e o Postgres faz OR entre elas no SELECT).
--
-- Consequencia aceita: o telefone de todo gestor ativo fica legivel por
-- qualquer usuario autenticado do sistema. Sao numeros internos da equipe, e e
-- exatamente o dado que o alerta precisa enderecar.
--
-- Idempotente: pode rodar de novo sem efeito.

drop policy if exists "Authenticated read managers" on public.managers;
create policy "Authenticated read managers" on public.managers
  for select to authenticated
  using (true);
