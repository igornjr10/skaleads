-- Rotina: o trabalho recorrente da equipe e a cobranca de quem cumpriu.
--
-- Diferente de tasks (avulso, tem comeco e fim) e de automation_runs (o que a
-- maquina executa sozinha): aqui e o habito humano que se repete todo dia,
-- toda semana ou todo mes, e o gestor precisa enxergar quem esta em dia.

create table if not exists public.rotinas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  client_id uuid references public.clients(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  periodicidade text not null default 'diaria'
    check (periodicidade in ('diaria', 'semanal', 'mensal')),
  dia_semana smallint check (dia_semana between 0 and 6),
  dia_mes smallint check (dia_mes between 1 and 31),
  horario_limite time,
  ativa boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Cada periodicidade usa o seu proprio campo de ancora e nenhum outro. Sem
  -- isto, uma rotina 'diaria' com dia_semana preenchido viraria ambiguidade
  -- silenciosa na hora de decidir se ela vence hoje.
  constraint rotinas_ancora_coerente check (
    (periodicidade = 'diaria'  and dia_semana is null     and dia_mes is null)
    or (periodicidade = 'semanal' and dia_semana is not null and dia_mes is null)
    or (periodicidade = 'mensal'  and dia_mes is not null    and dia_semana is null)
  )
);

create index if not exists idx_rotinas_assigned on public.rotinas(assigned_to) where ativa;
create index if not exists idx_rotinas_client on public.rotinas(client_id) where ativa;

alter table public.rotinas enable row level security;

-- Leitura liberada para autenticado, como em tasks: a cobranca so funciona se
-- todo mundo enxergar a rotina de todo mundo.
drop policy if exists "Authenticated can view rotinas" on public.rotinas;
create policy "Authenticated can view rotinas" on public.rotinas
  for select to authenticated using (true);

drop policy if exists "Admins manage rotinas" on public.rotinas;
create policy "Admins manage rotinas" on public.rotinas
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()))
  with check (public.is_admin_or_owner(auth.uid()));

grant select, insert, update, delete on public.rotinas to authenticated;
grant select, insert, update, delete on public.rotinas to service_role;


-- ── Execucoes ───────────────────────────────────────────────────────────────
-- Uma linha por (rotina, data de referencia). A data_ref NAO e o momento do
-- clique: e a data em que aquela ocorrencia vence. Numa rotina semanal de
-- segunda, marcar na terca ainda grava a segunda como data_ref, senao a mesma
-- ocorrencia entraria duas vezes na semana e a aderencia mentiria.
create table if not exists public.rotina_execucoes (
  id uuid primary key default gen_random_uuid(),
  rotina_id uuid not null references public.rotinas(id) on delete cascade,
  data_ref date not null,
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references auth.users(id) on delete set null,
  observacao text,
  created_at timestamptz not null default now(),
  unique (rotina_id, data_ref)
);

create index if not exists idx_rotina_exec_data on public.rotina_execucoes(data_ref, rotina_id);

alter table public.rotina_execucoes enable row level security;


-- Quem pode dar baixa: o responsavel pela rotina, ou um gestor. A checagem
-- cruza duas tabelas, entao mora numa funcao — policy nao le rotinas sozinha
-- sem esbarrar na RLS da propria rotinas.
create or replace function public.pode_executar_rotina(_rotina_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_owner(auth.uid())
      or exists (
        select 1 from public.rotinas r
        where r.id = _rotina_id and r.assigned_to = auth.uid()
      )
$$;

revoke execute on function public.pode_executar_rotina(uuid) from public;
revoke execute on function public.pode_executar_rotina(uuid) from anon;
grant  execute on function public.pode_executar_rotina(uuid) to authenticated;

drop policy if exists "Authenticated can view rotina_execucoes" on public.rotina_execucoes;
create policy "Authenticated can view rotina_execucoes" on public.rotina_execucoes
  for select to authenticated using (true);

drop policy if exists "Responsavel ou gestor da baixa" on public.rotina_execucoes;
create policy "Responsavel ou gestor da baixa" on public.rotina_execucoes
  for insert to authenticated
  with check (public.pode_executar_rotina(rotina_id));

drop policy if exists "Responsavel ou gestor corrige baixa" on public.rotina_execucoes;
create policy "Responsavel ou gestor corrige baixa" on public.rotina_execucoes
  for update to authenticated
  using (public.pode_executar_rotina(rotina_id))
  with check (public.pode_executar_rotina(rotina_id));

drop policy if exists "Admin apaga baixa" on public.rotina_execucoes;
create policy "Admin apaga baixa" on public.rotina_execucoes
  for delete to authenticated
  using (public.is_admin_or_owner(auth.uid()));

grant select, insert, update, delete on public.rotina_execucoes to authenticated;
grant select, insert, update, delete on public.rotina_execucoes to service_role;


-- ── Quem deu baixa e quando, sem depender do frontend ───────────────────────
create or replace function public.touch_rotina_execucao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at := now();
    new.done_by := auth.uid();
  elsif not new.done then
    new.done_at := null;
    new.done_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rotina_exec_touch on public.rotina_execucoes;
create trigger trg_rotina_exec_touch
  before insert or update on public.rotina_execucoes
  for each row execute function public.touch_rotina_execucao();


create or replace function public.touch_rotina_updated()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_rotinas_touch on public.rotinas;
create trigger trg_rotinas_touch
  before update on public.rotinas
  for each row execute function public.touch_rotina_updated();


-- ── Aviso no sino ao receber uma rotina ─────────────────────────────────────
-- So na atribuicao. Avisar a cada vencimento diario exigiria cron e viraria
-- spam; a cobranca do dia a dia e a propria tela.
create or replace function public.notify_rotina_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is null or new.assigned_to = auth.uid() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.assigned_to is not distinct from old.assigned_to then
      return new;
    end if;
  end if;

  insert into public.notifications (user_id, type, title, body)
  values (new.assigned_to, 'rotina', 'Nova rotina para voce', new.titulo);

  return new;
end;
$$;

drop trigger if exists trg_rotinas_notify on public.rotinas;
create trigger trg_rotinas_notify
  after insert or update of assigned_to on public.rotinas
  for each row execute function public.notify_rotina_assigned();

notify pgrst, 'reload schema';
