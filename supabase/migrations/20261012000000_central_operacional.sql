-- Visao da agencia vira central operacional: prazo com hora, entrega
-- aguardando o cliente, mural da equipe e a Central de Automacoes.
--
-- Quem decide o que avisar e a Edge Function automacoes-operacao (cron a cada
-- 15 min). O banco guarda a configuracao por empresa e o historico, que
-- tambem serve de trava: o mesmo aviso nao sai duas vezes.

-- ── 1. Demanda com hora e entrega travada no cliente ─────────────────────────

alter table public.tasks add column if not exists prazo_hora time;
alter table public.tasks add column if not exists aguardando_cliente boolean not null default false;

-- Igual a versao de 20260930000000, com prazo_hora entre os campos de quem
-- pediu. aguardando_cliente fica com o responsavel: e ele quem sabe que travou.
create or replace function public.guard_task_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();

  if new.status = 'concluida' and old.status <> 'concluida' then
    new.concluida_at := now();
    new.aguardando_cliente := false;
  elsif new.status <> 'concluida' and old.status = 'concluida' then
    new.concluida_at := null;
  end if;

  if auth.uid() is null or public.is_admin_or_owner(auth.uid()) then
    return new;
  end if;

  if new.created_by is distinct from old.created_by or new.company_id is distinct from old.company_id then
    raise exception 'Autoria e empresa da demanda nao mudam';
  end if;

  if old.created_by = auth.uid() then
    if new.client_id is distinct from old.client_id and new.client_id is not null
       and not public.user_can_access_client(auth.uid(), new.client_id) then
      raise exception 'Esse cliente nao esta na sua carteira';
    end if;
    return new;
  end if;

  if new.titulo is distinct from old.titulo
     or new.descricao is distinct from old.descricao
     or new.client_id is distinct from old.client_id
     or new.prioridade is distinct from old.prioridade
     or new.prazo is distinct from old.prazo
     or new.prazo_hora is distinct from old.prazo_hora
     or new.assigned_to is distinct from old.assigned_to
     or new.categoria is distinct from old.categoria then
    raise exception 'Voce pode alterar apenas o status e o checklist desta demanda';
  end if;

  return new;
end;
$$;

-- A Visao da agencia e o quadro de Demandas se atualizam sozinhos.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tasks') then
    execute 'alter publication supabase_realtime add table public.tasks';
  end if;
end $$;

-- ── 2. Notificacao que leva ao lugar certo ───────────────────────────────────

alter table public.notifications add column if not exists link text;

-- ── 3. Mural da equipe ───────────────────────────────────────────────────────

create table if not exists public.mural_itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.default_company_id() references public.companies(id) on delete cascade,
  tipo text not null check (tipo in ('alerta', 'ideia', 'problema', 'aviso', 'gestao')),
  titulo text not null check (length(trim(titulo)) > 0),
  texto text,
  client_id uuid references public.clients(id) on delete set null,
  autor_id uuid references auth.users(id) on delete set null default auth.uid(),
  resolvido_at timestamptz,
  resolvido_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mural_itens_company_idx on public.mural_itens (company_id, resolvido_at, created_at desc);

alter table public.mural_itens enable row level security;

drop policy if exists "Equipe ve o mural" on public.mural_itens;
create policy "Equipe ve o mural" on public.mural_itens
  for select to authenticated
  using (public.is_my_company(company_id));

drop policy if exists "Equipe escreve no mural" on public.mural_itens;
create policy "Equipe escreve no mural" on public.mural_itens
  for insert to authenticated
  with check (public.is_my_company(company_id) and autor_id = auth.uid()
              and (client_id is null or client_id in (select id from public.clients)));

-- Resolver e de quem escreveu ou do ADM; o conteudo nao muda depois de postado.
drop policy if exists "Autor ou ADM resolve" on public.mural_itens;
create policy "Autor ou ADM resolve" on public.mural_itens
  for update to authenticated
  using (public.is_my_company(company_id) and (autor_id = auth.uid() or public.is_admin_or_owner(auth.uid())))
  with check (public.is_my_company(company_id));

drop policy if exists "Autor ou ADM apaga" on public.mural_itens;
create policy "Autor ou ADM apaga" on public.mural_itens
  for delete to authenticated
  using (public.is_my_company(company_id) and (autor_id = auth.uid() or public.is_admin_or_owner(auth.uid())));

create or replace function public.guard_mural_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo is distinct from old.tipo or new.titulo is distinct from old.titulo
     or new.texto is distinct from old.texto or new.client_id is distinct from old.client_id
     or new.autor_id is distinct from old.autor_id or new.company_id is distinct from old.company_id then
    raise exception 'Do mural so se marca como resolvido';
  end if;
  if new.resolvido_at is not null and old.resolvido_at is null then
    new.resolvido_por := auth.uid();
  elsif new.resolvido_at is null then
    new.resolvido_por := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mural_guard on public.mural_itens;
create trigger trg_mural_guard
  before update on public.mural_itens
  for each row execute function public.guard_mural_update();

grant select, insert, update, delete on public.mural_itens to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'mural_itens') then
    execute 'alter publication supabase_realtime add table public.mural_itens';
  end if;
end $$;

-- ── 4. Central de Automacoes ─────────────────────────────────────────────────
-- Linha ausente = padrao da automacao (definido em _shared/automacoes.ts).

create table if not exists public.automacoes (
  company_id uuid not null default public.default_company_id() references public.companies(id) on delete cascade,
  chave text not null,
  ativa boolean not null default true,
  whatsapp boolean not null default false,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (company_id, chave)
);

alter table public.automacoes enable row level security;

drop policy if exists "Equipe ve as automacoes" on public.automacoes;
create policy "Equipe ve as automacoes" on public.automacoes
  for select to authenticated
  using (public.is_my_company(company_id));

drop policy if exists "ADM configura automacoes" on public.automacoes;
create policy "ADM configura automacoes" on public.automacoes
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id));

create or replace function public.touch_automacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_automacoes_touch on public.automacoes;
create trigger trg_automacoes_touch
  before insert or update on public.automacoes
  for each row execute function public.touch_automacao();

grant select, insert, update, delete on public.automacoes to authenticated;

-- Historico: cada aviso enviado, e as acoes que esperam aprovacao do ADM.
-- `ref` identifica o fato (demanda + prazo, pessoa + dia...): a unique e o
-- que impede o cron de repetir o mesmo aviso a cada 15 minutos.
create table if not exists public.automacao_execucoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  chave text not null,
  ref text not null,
  user_id uuid references auth.users(id) on delete cascade,
  titulo text not null,
  corpo text,
  link text,
  canal_whatsapp text check (canal_whatsapp in ('enviado', 'sem_numero', 'erro', 'fora_do_horario')),
  status text not null default 'feito' check (status in ('feito', 'aguardando_aprovacao', 'aprovado', 'recusado')),
  acao jsonb,
  decidido_por uuid references auth.users(id) on delete set null,
  decidido_at timestamptz,
  created_at timestamptz not null default now(),
  constraint automacao_execucoes_unica unique nulls not distinct (company_id, chave, ref, user_id)
);

create index if not exists automacao_execucoes_recentes on public.automacao_execucoes (company_id, created_at desc);

alter table public.automacao_execucoes enable row level security;

-- Cada um ve o que recebeu; o ADM ve o historico inteiro da empresa.
drop policy if exists "Ve o proprio aviso ou tudo se ADM" on public.automacao_execucoes;
create policy "Ve o proprio aviso ou tudo se ADM" on public.automacao_execucoes
  for select to authenticated
  using (public.is_my_company(company_id) and (user_id = auth.uid() or public.is_admin_or_owner(auth.uid())));

revoke insert, update, delete on public.automacao_execucoes from authenticated;
grant select on public.automacao_execucoes to authenticated;
grant all on public.automacao_execucoes to service_role;
grant all on public.automacoes to service_role;
grant all on public.mural_itens to service_role;

-- Acao que muda responsavel ou prazo nao roda sozinha quando a automacao
-- exige aprovacao: fica aguardando ate o ADM decidir aqui.
create or replace function public.decidir_automacao(_id uuid, _aprovar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.automacao_execucoes%rowtype;
  item jsonb;
begin
  select * into v from public.automacao_execucoes where id = _id for update;
  if v.id is null or not public.is_my_company(v.company_id) or not public.is_admin_or_owner(auth.uid()) then
    raise exception 'So o ADM da empresa decide esta acao';
  end if;
  if v.status <> 'aguardando_aprovacao' then
    raise exception 'Esta acao ja foi decidida';
  end if;

  if _aprovar and v.acao is not null then
    for item in select * from jsonb_array_elements(coalesce(v.acao->'responsaveis', '[]'::jsonb)) loop
      insert into public.client_fase_responsaveis (client_id, fase, responsavel_id)
      values ((item->>'client_id')::uuid, item->>'fase', (item->>'responsavel_id')::uuid)
      on conflict (client_id, fase) do nothing;
    end loop;
    for item in select * from jsonb_array_elements(coalesce(v.acao->'prazos', '[]'::jsonb)) loop
      update public.tasks set prazo = (item->>'prazo')::date
      where id = (item->>'task_id')::uuid and prazo is null;
    end loop;
  end if;

  update public.automacao_execucoes
     set status = case when _aprovar then 'aprovado' else 'recusado' end,
         decidido_por = auth.uid(),
         decidido_at = now()
   where id = _id;
end;
$$;

revoke execute on function public.decidir_automacao(uuid, boolean) from public, anon;
grant execute on function public.decidir_automacao(uuid, boolean) to authenticated;

-- ── 5. Rotina respeita o liga/desliga da Central ─────────────────────────────
-- Igual a versao de 20261007000003, pulando a empresa que desligou o aviso.

create or replace function public.notificar_rotinas_do_dia()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  avisadas integer := 0;
begin
  insert into public.rotina_execucoes (rotina_id, data_ref)
  select r.id, hoje
  from public.rotinas r
  where r.ativa
    and r.assigned_to is not null
    and public.rotina_vence_em(r.periodicidade, r.dias_semana, r.dia_mes, r.data_pontual, hoje)
  on conflict (rotina_id, data_ref) do nothing;

  with pendentes as (
    update public.rotina_execucoes e
    set avisado_at = now()
    from public.rotinas r
    where e.rotina_id = r.id
      and coalesce(e.mover_para, e.data_ref) = hoje
      and e.avisado_at is null
      and not e.done
      and r.ativa
      and r.assigned_to is not null
      and not exists (
        select 1 from public.automacoes a
        where a.company_id = r.company_id and a.chave = 'rotinas' and not a.ativa
      )
    returning r.assigned_to, r.titulo, r.horario_limite
  )
  insert into public.notifications (user_id, type, title, body, link)
  select
    p.assigned_to,
    'rotina',
    'Rotina de hoje: ' || p.titulo,
    coalesce('Prazo ate ' || to_char(p.horario_limite, 'HH24:MI'), 'Sem horario limite'),
    '/rotina'
  from pendentes p;

  get diagnostics avisadas = row_count;
  return avisadas;
end;
$$;

revoke execute on function public.notificar_rotinas_do_dia() from public, anon, authenticated;
grant  execute on function public.notificar_rotinas_do_dia() to service_role;

-- ── 6. Cron ──────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from cron.job where jobname = 'automacoes-operacao') then
    perform cron.unschedule('automacoes-operacao');
  end if;
end $$;

select cron.schedule(
  'automacoes-operacao',
  '*/15 * * * *',
  $$select public.dispatch_cron_job('automacoes-operacao', 120000);$$
);

notify pgrst, 'reload schema';
