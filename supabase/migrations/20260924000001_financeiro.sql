-- Gestao financeira: mensalidade por cliente, faturas e regua de cobranca.
--
-- O motor e deliberadamente conservador: nada sai sem o cliente estar com
-- billing habilitado individualmente, e o time comeca em modo teste (toda
-- mensagem vai para o numero do proprio operador). Erro de template ou de valor
-- atinge uma conversa, nao a carteira inteira.
--
-- Os campos de gateway (payment_link, external_id, gateway, paid_amount) ja
-- existem mesmo sem integracao: quando entrar Asaas ou Mercado Pago, e so
-- preencher e ligar o webhook, sem migrar dado nenhum.

-- ── Ajustes do time ──────────────────────────────────────────────────────────
create table if not exists public.billing_settings (
  team_id uuid primary key,
  pix_key text,
  payment_link text,
  -- Negativo = dias ANTES do vencimento; 0 = no dia; positivo = dias de atraso.
  regua int[] not null default '{-5,-3,-1,0,3,7}',
  template_antes text not null default
    'Oi! Passando para lembrar que a mensalidade de {{cliente}} vence em {{vencimento}} ({{dias}} dias). Valor: {{valor}}.

{{pagamento}}

Qualquer duvida e so chamar.',
  template_vencimento text not null default
    'Oi! A mensalidade de {{cliente}} vence hoje, {{vencimento}}. Valor: {{valor}}.

{{pagamento}}',
  template_atraso text not null default
    'Oi! A mensalidade de {{cliente}}, com vencimento em {{vencimento}}, consta em aberto ha {{dias}} dias. Valor: {{valor}}.

{{pagamento}}

Se o pagamento ja foi feito, me avisa que eu dou baixa.',
  modo_teste boolean not null default true,
  teste_numero text,
  updated_at timestamptz not null default now()
);

alter table public.billing_settings enable row level security;

drop policy if exists "billing_settings_team" on public.billing_settings;
create policy "billing_settings_team" on public.billing_settings
  for all to authenticated
  using (team_id = public.my_team_id())
  with check (team_id = public.my_team_id());

grant select, insert, update, delete on public.billing_settings to authenticated;

-- ── Mensalidade por cliente ──────────────────────────────────────────────────
create table if not exists public.client_billing (
  client_id uuid primary key references public.clients(id) on delete cascade,
  monthly_fee numeric(12,2) not null check (monthly_fee >= 0),
  billing_day int not null default 10 check (billing_day between 1 and 28),
  enabled boolean not null default false,
  destino text not null default 'auto' check (destino in ('auto', 'numero', 'grupo')),
  observacao text,
  updated_at timestamptz not null default now()
);

alter table public.client_billing enable row level security;

drop policy if exists "client_billing_team" on public.client_billing;
create policy "client_billing_team" on public.client_billing
  for all to authenticated
  using (public.can_access_client(client_id))
  with check (public.can_access_client(client_id));

grant select, insert, update, delete on public.client_billing to authenticated;

-- ── Faturas ──────────────────────────────────────────────────────────────────
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  competencia date not null,
  due_date date not null,
  amount numeric(12,2) not null,
  status text not null default 'aberta' check (status in ('aberta', 'paga', 'vencida', 'cancelada')),
  paid_at timestamptz,
  paid_amount numeric(12,2),
  -- Ganchos para gateway futuro
  payment_link text,
  external_id text,
  gateway text,
  created_at timestamptz not null default now(),
  unique (client_id, competencia)
);

create index if not exists idx_invoices_due on public.invoices(due_date) where status in ('aberta', 'vencida');
create index if not exists idx_invoices_client on public.invoices(client_id, competencia desc);

alter table public.invoices enable row level security;

drop policy if exists "invoices_team" on public.invoices;
create policy "invoices_team" on public.invoices
  for all to authenticated
  using (public.can_access_client(client_id))
  with check (public.can_access_client(client_id));

grant select, insert, update, delete on public.invoices to authenticated;

-- Baixa registra a data sozinha, sem depender do frontend mandar certo.
create or replace function public.touch_invoice_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paga' and old.status <> 'paga' then
    new.paid_at := coalesce(new.paid_at, now());
    new.paid_amount := coalesce(new.paid_amount, new.amount);
  elsif new.status <> 'paga' and old.status = 'paga' then
    new.paid_at := null;
    new.paid_amount := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoices_paid on public.invoices;
create trigger trg_invoices_paid
  before update on public.invoices
  for each row execute function public.touch_invoice_paid();

-- ── Log de lembretes ─────────────────────────────────────────────────────────
create table if not exists public.invoice_reminders (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  offset_dias int not null,
  canal text not null default 'whatsapp',
  destino text,
  sucesso boolean not null default true,
  erro text,
  sent_at timestamptz not null default now(),
  -- Idempotencia do motor: o mesmo lembrete nunca sai duas vezes, mesmo que o
  -- cron rode de novo no mesmo dia.
  unique (invoice_id, offset_dias)
);

alter table public.invoice_reminders enable row level security;

drop policy if exists "invoice_reminders_team" on public.invoice_reminders;
create policy "invoice_reminders_team" on public.invoice_reminders
  for select to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_id and public.can_access_client(i.client_id)
  ));

grant select on public.invoice_reminders to authenticated;
grant insert on public.invoice_reminders to service_role;

-- ── Motor: gera faturas do mes e marca vencidas ──────────────────────────────
create or replace function public.billing_housekeeping()
returns table (geradas int, vencidas int)
language plpgsql security definer set search_path = public as $$
declare
  _geradas int;
  _vencidas int;
  _competencia date := date_trunc('month', current_date)::date;
begin
  insert into public.invoices (client_id, competencia, due_date, amount)
  select cb.client_id,
         _competencia,
         make_date(extract(year from _competencia)::int, extract(month from _competencia)::int, cb.billing_day),
         cb.monthly_fee
  from public.client_billing cb
  join public.clients c on c.id = cb.client_id
  where cb.enabled
    and c.status = 'active'
    and cb.monthly_fee > 0
  on conflict (client_id, competencia) do nothing;

  get diagnostics _geradas = row_count;

  update public.invoices
  set status = 'vencida'
  where status = 'aberta' and due_date < current_date;

  get diagnostics _vencidas = row_count;

  return query select _geradas, _vencidas;
end;
$$;

revoke execute on function public.billing_housekeeping() from public, anon, authenticated;
grant execute on function public.billing_housekeeping() to service_role;

-- ── Motor: o que precisa ser cobrado hoje ────────────────────────────────────
create or replace function public.billing_due_reminders()
returns table (
  invoice_id uuid,
  client_name text,
  destino text,
  offset_dias int,
  mensagem text
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with cfg as (
    select c.id as client_id, c.name, c.whatsapp_number, c.whatsapp_group_jid,
           cb.destino as pref, s.*
    from public.clients c
    join public.client_billing cb on cb.client_id = c.id and cb.enabled
    -- INNER JOIN de proposito: time sem ajustes salvos nao dispara nada.
    join public.billing_settings s on s.team_id = c.company_id
    where c.status = 'active'
  ),
  pendentes as (
    select i.id, i.amount, i.due_date, cfg.*,
           o.dias as offset_dias,
           (i.due_date - current_date) as dias_para_vencer
    from public.invoices i
    join cfg on cfg.client_id = i.client_id
    cross join lateral unnest(cfg.regua) as o(dias)
    where i.status in ('aberta', 'vencida')
      and (i.due_date - current_date) = -o.dias
      and not exists (
        select 1 from public.invoice_reminders r
        where r.invoice_id = i.id and r.offset_dias = o.dias
      )
  )
  select
    p.id,
    p.name,
    -- Modo teste sequestra o destino: tudo vai para o numero do operador.
    case when p.modo_teste then p.teste_numero
         when p.pref = 'grupo'  then p.whatsapp_group_jid
         when p.pref = 'numero' then p.whatsapp_number
         else coalesce(p.whatsapp_number, p.whatsapp_group_jid)
    end,
    p.offset_dias,
    replace(replace(replace(replace(replace(
      case when p.offset_dias < 0 then p.template_antes
           when p.offset_dias = 0 then p.template_vencimento
           else p.template_atraso end,
      '{{cliente}}', p.name),
      '{{valor}}', 'R$ ' || translate(to_char(p.amount, 'FM999G999G990D00'), '.,', ',.')),
      '{{vencimento}}', to_char(p.due_date, 'DD/MM/YYYY')),
      '{{dias}}', abs(p.dias_para_vencer)::text),
      '{{pagamento}}', trim(both from
        coalesce('PIX: ' || nullif(p.pix_key, ''), '') ||
        case when nullif(p.pix_key, '') is not null and nullif(p.payment_link, '') is not null then E'\n' else '' end ||
        coalesce('Link: ' || nullif(p.payment_link, ''), '')
      ))
  from pendentes p;
end;
$$;

revoke execute on function public.billing_due_reminders() from public, anon, authenticated;
grant execute on function public.billing_due_reminders() to service_role;
