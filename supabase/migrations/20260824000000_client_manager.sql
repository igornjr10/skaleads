-- Gestor responsavel por cada conta de anuncio.

-- Um gestor pode existir so para responder por contas, sem entrar na lista de
-- destinos de WhatsApp — por isso o numero deixa de ser obrigatorio.
alter table public.managers alter column whatsapp_number drop not null;

alter table public.clients
  add column if not exists manager_id uuid references public.managers(id) on delete set null;

create index if not exists clients_manager_id_idx on public.clients (manager_id);

-- Quem nao e admin precisa enxergar o gestor da conta na tela de Clientes;
-- a policy de ALL ja existente continua restringindo a escrita a admin/owner.
drop policy if exists "Authenticated view managers" on public.managers;
create policy "Authenticated view managers" on public.managers
  for select to authenticated using (true);
