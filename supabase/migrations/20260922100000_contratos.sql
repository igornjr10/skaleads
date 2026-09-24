-- Contratos da Autentique espelhados aqui.
--
-- A fonte continua sendo a Autentique: esta tabela e leitura. O que e nosso e o
-- `client_id` — de qual cliente da carteira aquele documento e.
--
-- O casamento automatico e por nome, e nao por CNPJ ou e-mail como seria o
-- natural: em 22/09/2026 nenhum dos 37 clientes ativos tinha cnpj, cpf ou email
-- preenchido, entao casar por documento nao acharia nada. Quando o nome nao
-- decide, a linha fica sem cliente e alguem vincula na tela — e `vinculo_manual`
-- impede que a proxima sincronizacao desfaca esse trabalho.
create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),
  autentique_id text not null unique,
  client_id uuid references public.clients(id) on delete set null,
  vinculo_manual boolean not null default false,
  nome text not null,
  status text not null default 'pendente',
  criado_em timestamptz,
  assinado_em timestamptz,
  arquivo_original text,
  arquivo_assinado text,
  signatarios jsonb not null default '[]'::jsonb,
  sincronizado_em timestamptz not null default now()
);

create index if not exists contratos_client_idx on public.contratos (client_id);
create index if not exists contratos_status_idx on public.contratos (status, criado_em desc);

alter table public.contratos enable row level security;

-- Contrato e assunto do time inteiro, como o resto do cadastro do cliente.
-- Login e senha de conta de cliente e que sao restritos, e moram noutro lugar.
create policy "contratos_time_le" on public.contratos
  for select to authenticated using (true);

-- Vincular contrato a cliente e trabalho de rotina, nao e privilegio de admin.
create policy "contratos_time_vincula" on public.contratos
  for update to authenticated using (true) with check (true);

create policy "contratos_admin" on public.contratos
  for all to authenticated
  using (is_admin_or_owner(auth.uid()))
  with check (is_admin_or_owner(auth.uid()));

-- Sem isto o service_role leva 42501: a tabela criada fora do postgres fica de
-- fora do `alter default privileges` que o Supabase aplica.
grant select, insert, update, delete on public.contratos to service_role;
grant select, update on public.contratos to authenticated;
