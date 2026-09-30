-- A migration 20260813000000_creative_tasks.sql esta no repo inteira, mas so
-- chegou pela metade ao projeto no ar. Sondagem de 16/09/2026 em
-- npfcxgijwrxrssinpkdw:
--
--   creative_tasks          existe, RLS ligada, 3 policies,
--                           mas GRANT so para `authenticated` — service_role sem nada
--   creative_task_comments  NAO EXISTE (a API responde PGRST205)
--
-- O segundo e falha de verdade, nao detalhe de manutencao: `Production.tsx` le
-- `creative_task_comments` para a ida e volta de ajuste do criativo, entao o
-- comentario da aba Producao esta quebrado no ar desde 13/08/2026.
--
-- O primeiro impede qualquer script de manutencao de ler a fila: e por isso que
-- `npm run sincronizar --prefix cerebro` nao consegue gerar os numeros da nota
-- [[producao-de-criativos]].
--
-- Tudo aqui e idempotente e so acrescenta: pode rodar de novo sem efeito.

-- ── 1. GRANT que faltou em creative_tasks ────────────────────────────────────
grant select, insert, update, delete on public.creative_tasks to service_role;

-- ── 2. A tabela de comentario que nunca foi criada ───────────────────────────
create table if not exists public.creative_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.creative_tasks(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null,
  texto text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_creative_comments_task
  on public.creative_task_comments(task_id, created_at);

alter table public.creative_task_comments enable row level security;

drop policy if exists "Authenticated can view creative_comments" on public.creative_task_comments;
create policy "Authenticated can view creative_comments" on public.creative_task_comments
  for select to authenticated using (true);

-- Comentar e livre para quem esta logado; assinar como outra pessoa nao e.
drop policy if exists "Authenticated comenta como si" on public.creative_task_comments;
create policy "Authenticated comenta como si" on public.creative_task_comments
  for insert to authenticated with check (autor_id = auth.uid());

drop policy if exists "Autor edita proprio comentario" on public.creative_task_comments;
create policy "Autor edita proprio comentario" on public.creative_task_comments
  for update to authenticated
  using (autor_id = auth.uid()) with check (autor_id = auth.uid());

drop policy if exists "Autor ou admin apaga comentario" on public.creative_task_comments;
create policy "Autor ou admin apaga comentario" on public.creative_task_comments
  for delete to authenticated
  using (autor_id = auth.uid() or public.is_admin_or_owner(auth.uid()));

grant select, insert, update, delete on public.creative_task_comments to authenticated;
grant select, insert, update, delete on public.creative_task_comments to service_role;

notify pgrst, 'reload schema';
