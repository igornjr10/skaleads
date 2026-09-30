-- Planner: checklist de onboarding por cliente.
--
-- As policies espelham exatamente a regra de public.clients neste projeto:
-- todo autenticado LE, mas so owner/admin ESCREVE (is_admin_or_owner).

create table if not exists public.client_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  fase text not null default 'geral',
  titulo text not null,
  descricao text,
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references auth.users(id) on delete set null,
  posicao int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_tasks_client on public.client_tasks(client_id, posicao);
create index if not exists idx_client_tasks_pendentes on public.client_tasks(client_id) where not done;

alter table public.client_tasks enable row level security;

drop policy if exists "Authenticated can view client_tasks" on public.client_tasks;
create policy "Authenticated can view client_tasks" on public.client_tasks
  for select to authenticated using (true);

drop policy if exists "Admins manage client_tasks" on public.client_tasks;
create policy "Admins manage client_tasks" on public.client_tasks
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()))
  with check (public.is_admin_or_owner(auth.uid()));

grant select, insert, update, delete on public.client_tasks to authenticated;
grant select, insert, update, delete on public.client_tasks to service_role;


-- ── Checklist padrao ─────────────────────────────────────────────────────────
create or replace function public.seed_client_tasks(_client_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  inseridas int;
begin
  -- A funcao e SECURITY DEFINER, entao o insert dela ignora a RLS: a checagem
  -- de permissao precisa ser feita aqui. A condicao sobre auth.uid() preserva o
  -- caminho do trigger em insercoes via service_role, que rodam sem usuario.
  if auth.uid() is not null and not public.is_admin_or_owner(auth.uid()) then
    raise exception 'Sem permissao para gerar checklist';
  end if;

  if exists (select 1 from public.client_tasks where client_id = _client_id) then
    return 0;
  end if;

  insert into public.client_tasks (client_id, fase, titulo, posicao)
  select _client_id, fase, titulo, posicao
  from (values
    ('acessos',       'Contrato assinado e escopo combinado',                      10),
    ('acessos',       'Acesso de parceiro no Business Manager do cliente',          20),
    ('acessos',       'Conta de anuncios compartilhada com a agencia',              30),
    ('acessos',       'Forma de pagamento ativa e limite conferido',                40),
    ('acessos',       'Pagina do Facebook e perfil do Instagram vinculados',        50),
    ('rastreamento',  'Pixel instalado e disparando no site',                       60),
    ('rastreamento',  'Conversions API (CAPI) configurada',                         70),
    ('rastreamento',  'Dominio verificado no Business Manager',                     80),
    ('rastreamento',  'Eventos priorizados definidos (pos iOS 14)',                 90),
    ('rastreamento',  'Publicos personalizados criados',                           100),
    ('estrategia',    'Briefing preenchido: publico, oferta e diferenciais',       110),
    ('estrategia',    'Materiais recebidos (logo, fotos, videos)',                 120),
    ('estrategia',    'Verba mensal definida e cadastrada',                        130),
    ('estrategia',    'Objetivo principal acordado com o cliente',                 140),
    ('estrategia',    'Reuniao de kickoff realizada',                              150),
    ('operacao',      'Cliente cadastrado e conta Meta conectada',                 160),
    ('operacao',      'Primeira sincronizacao concluida',                          170),
    ('operacao',      'Primeira auditoria rodada e pontos criticos tratados',      180),
    ('operacao',      'Alertas configurados para a conta',                         190),
    ('operacao',      'Modelo de relatorio definido',                              200),
    ('operacao',      'Grupo ou numero de WhatsApp do cliente cadastrado',         210),
    ('operacao',      'Primeira campanha no ar',                                   220)
  ) as t(fase, titulo, posicao);

  get diagnostics inseridas = row_count;
  return inseridas;
end;
$$;

-- OBRIGATORIO: funcao nova nasce com EXECUTE para PUBLIC, e o grant abaixo so
-- soma. Sem o revoke, a chave anonima do bundle executa uma funcao que escreve
-- por baixo da RLS.
revoke execute on function public.seed_client_tasks(uuid) from public;
revoke execute on function public.seed_client_tasks(uuid) from anon;
grant  execute on function public.seed_client_tasks(uuid) to authenticated;


-- ── Cliente novo ja nasce com o checklist ────────────────────────────────────
create or replace function public.trg_seed_client_tasks()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_client_tasks(new.id);
  return new;
end;
$$;

drop trigger if exists trg_clients_seed_tasks on public.clients;
create trigger trg_clients_seed_tasks
  after insert on public.clients
  for each row execute function public.trg_seed_client_tasks();


-- ── Quem concluiu e quando, sem depender do frontend ─────────────────────────
create or replace function public.touch_client_task_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.done and not old.done then
    new.done_at := now();
    new.done_by := auth.uid();
  elsif not new.done and old.done then
    new.done_at := null;
    new.done_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_client_tasks_done on public.client_tasks;
create trigger trg_client_tasks_done
  before update on public.client_tasks
  for each row execute function public.touch_client_task_done();

notify pgrst, 'reload schema';
