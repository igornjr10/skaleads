-- Central de reunioes: agenda, pauta, decisoes, acoes e o que sobrou da
-- reuniao (gravacao, transcricao, resumo da IA). Acao com responsavel vira
-- demanda na fila do time pela tela.
--
-- Reuniao realizada com cliente marca o compromisso do ciclo em
-- client_compromissos (o "este mes ja teve reuniao?" da Rotina), para nao
-- precisar marcar duas vezes.

create table if not exists public.reunioes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.default_company_id() references public.companies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  titulo text not null check (length(trim(titulo)) > 0),
  inicio timestamptz not null,
  duracao_min integer not null default 60 check (duracao_min > 0 and duracao_min <= 600),
  status text not null default 'agendada' check (status in ('agendada', 'realizada', 'cancelada')),
  meet_url text check (meet_url is null or meet_url ~* '^https?://'),
  local text,
  pauta text,
  decisoes text,
  observacoes text,
  -- [{ "id": "...", "texto": "...", "responsavel_id": uuid|null, "prazo": "yyyy-mm-dd"|null,
  --    "feito": false, "task_id": uuid|null }]
  acoes jsonb not null default '[]'::jsonb check (jsonb_typeof(acoes) = 'array'),
  gravacao_url text check (gravacao_url is null or gravacao_url ~* '^https?://'),
  transcricao text,
  resumo_ia text,
  resumo_ia_em timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reunioes_company_inicio_idx on public.reunioes (company_id, inicio desc);
create index if not exists reunioes_client_idx on public.reunioes (client_id, inicio desc);

create table if not exists public.reuniao_participantes (
  reuniao_id uuid not null references public.reunioes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (reuniao_id, user_id)
);
create index if not exists reuniao_participantes_user_idx on public.reuniao_participantes (user_id);

create or replace function public.e_participante_da_reuniao(_reuniao_id uuid, _user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.reuniao_participantes where reuniao_id = _reuniao_id and user_id = _user_id)
$$;
revoke execute on function public.e_participante_da_reuniao(uuid, uuid) from public, anon;
grant execute on function public.e_participante_da_reuniao(uuid, uuid) to authenticated;

create or replace function public.pode_editar_reuniao(_reuniao_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.reunioes r
    where r.id = _reuniao_id
      and public.is_my_company(r.company_id)
      and (r.created_by = auth.uid() or public.is_admin_or_owner(auth.uid()))
  )
$$;
revoke execute on function public.pode_editar_reuniao(uuid) from public, anon;
grant execute on function public.pode_editar_reuniao(uuid) to authenticated;

alter table public.reunioes enable row level security;
alter table public.reuniao_participantes enable row level security;

-- Ve: reuniao sem cliente ou de cliente da carteira, e sempre as que participa.
drop policy if exists "Ve reunioes da carteira ou em que participa" on public.reunioes;
create policy "Ve reunioes da carteira ou em que participa" on public.reunioes
  for select to authenticated
  using (public.is_my_company(company_id)
         and (client_id is null or client_id in (select id from public.clients)
              or created_by = auth.uid() or public.e_participante_da_reuniao(id)));

drop policy if exists "Equipe agenda reuniao" on public.reunioes;
create policy "Equipe agenda reuniao" on public.reunioes
  for insert to authenticated
  with check (public.is_my_company(company_id)
              and created_by = auth.uid()
              and (client_id is null or client_id in (select id from public.clients)));

-- Quem participa registra pauta, decisoes e acoes; trocar o cliente segue a carteira.
drop policy if exists "Quem marcou, participa ou ADM edita" on public.reunioes;
create policy "Quem marcou, participa ou ADM edita" on public.reunioes
  for update to authenticated
  using (public.is_my_company(company_id)
         and (created_by = auth.uid() or public.is_admin_or_owner(auth.uid()) or public.e_participante_da_reuniao(id)))
  with check (public.is_my_company(company_id));

drop policy if exists "Quem marcou ou ADM apaga" on public.reunioes;
create policy "Quem marcou ou ADM apaga" on public.reunioes
  for delete to authenticated
  using (public.is_my_company(company_id) and (created_by = auth.uid() or public.is_admin_or_owner(auth.uid())));

grant select, insert, update, delete on public.reunioes to authenticated;
grant select, update on public.reunioes to service_role;

create or replace function public.guard_reuniao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.resumo_ia is distinct from old.resumo_ia then
    new.resumo_ia_em := case when new.resumo_ia is null then null else now() end;
  end if;
  if auth.uid() is null or public.is_admin_or_owner(auth.uid()) then
    return new;
  end if;
  if new.created_by is distinct from old.created_by or new.company_id is distinct from old.company_id then
    raise exception 'Autoria e empresa da reuniao nao mudam';
  end if;
  if new.client_id is distinct from old.client_id and new.client_id is not null
     and not public.user_can_access_client(auth.uid(), new.client_id) then
    raise exception 'Esse cliente nao esta na sua carteira';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reunioes_guard on public.reunioes;
create trigger trg_reunioes_guard
  before update on public.reunioes
  for each row execute function public.guard_reuniao();

drop policy if exists "Ve participantes de reuniao que enxerga" on public.reuniao_participantes;
create policy "Ve participantes de reuniao que enxerga" on public.reuniao_participantes
  for select to authenticated
  using (exists (select 1 from public.reunioes r where r.id = reuniao_id));

drop policy if exists "Quem marcou define participantes" on public.reuniao_participantes;
create policy "Quem marcou define participantes" on public.reuniao_participantes
  for insert to authenticated
  with check (public.pode_editar_reuniao(reuniao_id) and (user_id = auth.uid() or public.shares_company(user_id)));

drop policy if exists "Quem marcou tira participantes" on public.reuniao_participantes;
create policy "Quem marcou tira participantes" on public.reuniao_participantes
  for delete to authenticated
  using (public.pode_editar_reuniao(reuniao_id));

grant select, insert, delete on public.reuniao_participantes to authenticated;
grant select on public.reuniao_participantes to service_role;

-- Participante novo fica sabendo pelo sino.
create or replace function public.notify_participante_reuniao()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.reunioes%rowtype;
begin
  if new.user_id = auth.uid() then
    return new;
  end if;
  select * into r from public.reunioes where id = new.reuniao_id;
  insert into public.notifications (user_id, type, title, body, link)
  values (new.user_id, 'reuniao', 'Você foi incluído numa reunião',
          r.titulo || ' - ' || to_char(r.inicio at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
          '/reunioes?reuniao=' || r.id);
  return new;
end;
$$;

drop trigger if exists trg_reuniao_participantes_notify on public.reuniao_participantes;
create trigger trg_reuniao_participantes_notify
  after insert on public.reuniao_participantes
  for each row execute function public.notify_participante_reuniao();

-- Realizada com cliente: marca o compromisso de reuniao do ciclo. Marca as
-- linhas que ja existem (mensal e/ou semanal); sem nenhuma, cria a mensal.
create or replace function public.marcar_compromisso_da_reuniao()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_dia date;
  v_marcadas int;
begin
  if new.client_id is null or new.status <> 'realizada'
     or (tg_op = 'UPDATE' and old.status = 'realizada' and old.client_id is not distinct from new.client_id) then
    return new;
  end if;
  v_dia := (new.inicio at time zone 'America/Sao_Paulo')::date;

  update public.client_compromissos
     set feito = true,
         data_feito = coalesce(data_feito, v_dia),
         registrado_por = coalesce(registrado_por, auth.uid()),
         registrado_em = coalesce(registrado_em, now())
   where client_id = new.client_id
     and tipo = 'reuniao'
     and not feito
     and ((ciclo = 'mensal' and competencia = date_trunc('month', v_dia)::date)
          or (ciclo = 'semanal' and competencia = date_trunc('week', v_dia)::date));
  get diagnostics v_marcadas = row_count;

  if v_marcadas = 0 and not exists (
    select 1 from public.client_compromissos
    where client_id = new.client_id and tipo = 'reuniao'
      and ((ciclo = 'mensal' and competencia = date_trunc('month', v_dia)::date)
           or (ciclo = 'semanal' and competencia = date_trunc('week', v_dia)::date))
  ) then
    insert into public.client_compromissos (client_id, tipo, ciclo, competencia, feito, data_feito, registrado_por, registrado_em)
    values (new.client_id, 'reuniao', 'mensal', date_trunc('month', v_dia)::date, true, v_dia, auth.uid(), now())
    on conflict (client_id, tipo, ciclo, competencia) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reunioes_compromisso on public.reunioes;
create trigger trg_reunioes_compromisso
  after insert or update of status, client_id on public.reunioes
  for each row execute function public.marcar_compromisso_da_reuniao();

-- Agenda e Visao da agencia se atualizam sozinhas.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'reunioes') then
    execute 'alter publication supabase_realtime add table public.reunioes';
  end if;
end $$;

notify pgrst, 'reload schema';
