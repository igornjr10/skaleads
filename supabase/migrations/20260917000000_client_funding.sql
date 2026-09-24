-- Verba deixa de ser um numero digitado a mao.
--
-- Ate aqui `clients.monthly_budget` era a unica fonte da verba: alguem abria o
-- cliente e digitava. Quando o cliente depositava, ninguem ficava sabendo — foi
-- o que aconteceu com a BLITZ STORE em 16/09/2026 (PIX de R$ 700 as 11h24 que o
-- card ignorou por um dia inteiro).
--
-- A sondagem de 17/09/2026 na conta act_2337343680158229 mostrou que a Graph API
-- entrega tudo o que falta, sem permissao nova (o app ja pede ads_read):
--
--   act_<id>?fields=funding_source_details
--     -> {"display_string":"Saldo disponivel (R$689,05 BRL)","type":20}
--
--   act_<id>/activities?fields=event_type,event_time,extra_data
--     -> funding_event_successful  {"amount":70000,"currency":"BRL","network_id":"PIX"}
--     -> ad_account_billing_charge {"new_value":2502,"transaction_id":"..."}
--
-- Valores em centavos. A cobranca diaria bateu com o gasto do dia anterior em
-- `campaign_daily_metrics` com diferenca de centavos nos 5 dias conferidos, o
-- que torna o par cobranca/gasto util como conferencia do proprio sync.
--
-- Idempotente: pode rodar de novo sem efeito.

-- ── 1. Saldo da conta, espelhado a cada sync ─────────────────────────────────
-- `meta_balance_label` guarda o texto cru da Meta ("Saldo disponivel (R$689,05
-- BRL)") porque `meta_balance_cents` sai de um parse de string formatada em
-- pt-BR: se a Meta mudar o formato o numero vira null, e o texto continua
-- mostravel na tela enquanto o parse nao e corrigido.
alter table public.clients
  add column if not exists meta_balance_cents bigint,
  add column if not exists meta_balance_label text,
  add column if not exists meta_funding_type integer,
  add column if not exists meta_balance_at timestamptz;

comment on column public.clients.meta_funding_type is
  'funding_source_details.type da Meta. 20 = saldo pre-pago (tem aporte); outros valores indicam pos-pago (so fatura).';

-- ── 2. Aportes e cobrancas vindos do log de atividades ───────────────────────
create table if not exists public.client_funding_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  event_type text not null check (event_type in ('funding_event_successful', 'ad_account_billing_charge')),
  event_time timestamptz not null,
  amount_cents bigint not null,
  currency text,
  -- Meio do aporte (PIX, credit_card...) — so vem no funding_event_successful.
  network_id text,
  -- Id da transacao — so vem no ad_account_billing_charge.
  transaction_id text,
  extra_data jsonb,
  created_at timestamptz not null default now()
);

-- O log da Meta nao da id proprio ao aporte, entao a chave natural e o que
-- identifica o evento na pratica: mesmo cliente, mesmo tipo, mesmo instante,
-- mesmo valor. Sem isso cada sync horario reinsere o mesmo deposito.
create unique index if not exists uq_client_funding_events_natural
  on public.client_funding_events(client_id, event_type, event_time, amount_cents);

create index if not exists idx_client_funding_events_lookup
  on public.client_funding_events(client_id, event_type, event_time desc);

alter table public.client_funding_events enable row level security;

-- Mesma regra de visibilidade dos demais dados de cliente: quem esta logado le.
drop policy if exists "Authenticated read funding events" on public.client_funding_events;
create policy "Authenticated read funding events" on public.client_funding_events
  for select to authenticated
  using (true);

-- Escrita e do sync (client-side com o usuario logado, e o cron com service_role).
drop policy if exists "Authenticated write funding events" on public.client_funding_events;
create policy "Authenticated write funding events" on public.client_funding_events
  for insert to authenticated
  with check (true);

drop policy if exists "Admin apaga funding events" on public.client_funding_events;
create policy "Admin apaga funding events" on public.client_funding_events
  for delete to authenticated
  using (public.is_admin_or_owner(auth.uid()));

grant select, insert, delete on public.client_funding_events to authenticated;
grant select, insert, update, delete on public.client_funding_events to service_role;

notify pgrst, 'reload schema';
