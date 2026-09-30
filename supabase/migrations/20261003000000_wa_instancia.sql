-- Instancia unica da uazapi, criada pelo proprio app com o admintoken
-- (whatsapp-instance-admin). O token da instancia envia mensagem em nome da
-- agencia: so as Edge Functions (service_role) leem, nunca o browser.
create table if not exists public.wa_instancia (
  id boolean primary key default true check (id),
  nome text not null,
  token text not null,
  criada_em timestamptz not null default now()
);

alter table public.wa_instancia enable row level security;
revoke all on public.wa_instancia from anon, authenticated;
