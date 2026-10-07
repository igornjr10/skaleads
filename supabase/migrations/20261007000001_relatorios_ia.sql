-- Relatorio em HTML montado pela IA a partir de prints. Guarda so os dados
-- (o HTML sai do template em src/lib/relatorio-html.ts), para reabrir, editar
-- e baixar de novo sem gastar IA.
create table if not exists public.relatorios_ia (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  periodo text not null default '',
  dados jsonb not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists relatorios_ia_cliente_idx on public.relatorios_ia (client_id, created_at desc);

alter table public.relatorios_ia enable row level security;

create policy "Relatorio IA de cliente da carteira" on public.relatorios_ia
  for all to authenticated
  using (client_id in (select id from public.clients))
  with check (client_id in (select id from public.clients));

grant select, insert, update, delete on public.relatorios_ia to authenticated;
