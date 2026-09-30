-- Aposenta a verba mensal digitada a mao.
--
-- `clients.monthly_budget` era uma promessa ("o cliente vai investir R$ 700"),
-- nao um fato, e por isso vivia divergindo do dinheiro que existe na conta. Em
-- 17/09/2026 a BLITZ STORE tinha R$ 700 cadastrados e R$ 687,24 de saldo real;
-- em outras contas a distancia era bem maior, porque ninguem reeditava o campo.
--
-- Desde a migration 20260917000000 o sistema le da Meta o que e fato: saldo da
-- conta (`clients.meta_balance_cents`) e aporte do mes
-- (`public.client_funding_events`). O campo digitado passou a ser so uma segunda
-- versao da verdade competindo com a primeira.
--
-- Idempotente: pode rodar de novo sem efeito.

-- ── 1. Guardar o que seria perdido ───────────────────────────────────────────
-- Dropar coluna apaga dado. Os 22 valores cadastrados viram uma tabela de
-- arquivo: se alguem precisar saber o que estava combinado com cada cliente
-- antes desta data, esta aqui. Pode ser dropada quando nao fizer mais falta.
-- Guardado por um DO em vez de `create table as`: depois que a coluna cai, o
-- select nem compila mais, e a migration precisa continuar re-executavel.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'monthly_budget'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = '_arquivo_monthly_budget'
  ) then
    execute $sql$
      create table public._arquivo_monthly_budget as
      select id as client_id, name, monthly_budget, now() as arquivado_em
      from public.clients
      where monthly_budget is not null
    $sql$;
  end if;
end $$;

create table if not exists public._arquivo_monthly_budget (
  client_id uuid,
  name text,
  monthly_budget numeric,
  arquivado_em timestamptz
);

comment on table public._arquivo_monthly_budget is
  'Valores de clients.monthly_budget no dia em que a verba manual foi aposentada (17/09/2026). So arquivo: nada le esta tabela.';

alter table public._arquivo_monthly_budget enable row level security;

drop policy if exists "Admin le arquivo de verba" on public._arquivo_monthly_budget;
create policy "Admin le arquivo de verba" on public._arquivo_monthly_budget
  for select to authenticated
  using (public.is_admin_or_owner(auth.uid()));

grant select on public._arquivo_monthly_budget to authenticated;
grant select on public._arquivo_monthly_budget to service_role;

-- ── 2. Desligar o alerta que dependia do campo ───────────────────────────────
-- A metrica `budget` deixou de existir no motor. Um alerta com ela nunca mais
-- dispararia, mas ficaria na tela como se estivesse vigiando algo — que e pior
-- do que nao existir. O alerta de saldo baixo (metrica `balance`) ocupa o lugar.
-- Casado por conteudo jsonb, nao por texto: o Postgres normaliza o jsonb com
-- espaco depois dos dois-pontos (`"metric": "budget"`), entao um LIKE sobre o
-- texto cru nao acha nada e falha em silencio — foi o que aconteceu na
-- primeira tentativa desta migration.
update public.alerts
set is_active = false,
    description = coalesce(description || ' ', '') ||
      '[Desativado em 17/09/2026: a verba manual foi aposentada. Use o alerta de saldo baixo.]'
where rule_json->'conditions' @> '[{"metric": "budget"}]'::jsonb
  and is_active;

-- ── 3. Remover a coluna ──────────────────────────────────────────────────────
alter table public.clients drop column if exists monthly_budget;

notify pgrst, 'reload schema';
