-- Gestao de time: quem esta na equipe, o que cada um deve entregar na semana
-- e no dia, e o aviso por email/WhatsApp quando uma demanda cai no nome de
-- alguem.
--
-- Membro de time nao e usuario do sistema: o editor pode receber a demanda no
-- WhatsApp sem nunca ter logado aqui. Por isso `team_members` guarda email e
-- WhatsApp proprios e `user_id` e opcional — quando preenchido, a pessoa
-- tambem recebe a notificacao no sino do app.
--
-- Tudo e escopado por time (my_team_id), igual a billing_settings.

-- ── Membros ──────────────────────────────────────────────────────────────────
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  nome text not null,
  funcao text not null default 'Gestor de tráfego',
  email text,
  whatsapp text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_team_members_team on public.team_members(team_id);

alter table public.team_members enable row level security;

drop policy if exists "team_members_team" on public.team_members;
create policy "team_members_team" on public.team_members
  for all to authenticated
  using (team_id = public.my_team_id())
  with check (team_id = public.my_team_id());

grant select, insert, update, delete on public.team_members to authenticated;
grant select on public.team_members to service_role;

-- ── Demandas ─────────────────────────────────────────────────────────────────
-- `semanal` e o combinado da semana; `diaria` e o extra que entrou no dia.
create table if not exists public.team_demands (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  member_id uuid references public.team_members(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  tipo text not null default 'semanal' check (tipo in ('semanal', 'diaria')),
  titulo text not null,
  descricao text,
  prioridade text not null default 'normal'
    check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  status text not null default 'pendente'
    check (status in ('pendente', 'andamento', 'concluida')),
  prazo date,
  done_at timestamptz,
  notified_at timestamptz,
  notificacao jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_team_demands_team on public.team_demands(team_id, prazo);
create index if not exists idx_team_demands_member on public.team_demands(member_id)
  where status <> 'concluida';

alter table public.team_demands enable row level security;

drop policy if exists "team_demands_team" on public.team_demands;
create policy "team_demands_team" on public.team_demands
  for all to authenticated
  using (team_id = public.my_team_id())
  with check (team_id = public.my_team_id());

grant select, insert, update, delete on public.team_demands to authenticated;
grant select, update on public.team_demands to service_role;

-- ── Triggers ─────────────────────────────────────────────────────────────────
-- team_id vem de quem esta logado, nao do frontend. Vale para as duas tabelas.
create or replace function public.touch_team_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.team_id is null then
    new.team_id := public.my_team_id();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_team_members_touch on public.team_members;
create trigger trg_team_members_touch
  before insert or update on public.team_members
  for each row execute function public.touch_team_row();

create or replace function public.touch_team_demand()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.team_id is null then
      new.team_id := public.my_team_id();
    end if;
    new.created_by := coalesce(new.created_by, auth.uid());
    if new.status = 'concluida' then
      new.done_at := now();
    end if;
  else
    if new.status = 'concluida' and old.status <> 'concluida' then
      new.done_at := now();
    elsif new.status <> 'concluida' then
      new.done_at := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_team_demands_touch on public.team_demands;
create trigger trg_team_demands_touch
  before insert or update on public.team_demands
  for each row execute function public.touch_team_demand();

-- Como team_id e preenchido no BEFORE trigger, a policy de insert precisa
-- aceitar linha que chegou sem team_id do browser. O WITH CHECK roda depois do
-- trigger, entao `team_id = my_team_id()` ja passa; nada mais a fazer aqui.
