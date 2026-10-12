-- Metas por indicador e controle financeiro por cliente.
--
-- Metas: alem de resultados/custo por resultado (20261004), o gestor combina
-- custo por mensagem, mensagens, visitas ao perfil, CPC, faturamento, ROAS e
-- um teto de investimento no mes. Ficam em `clients` com o prefixo alvo_ (ou
-- limite_), gravadas por definir_metas_cliente_completo — a policy de clients
-- so deixa o ADM alterar a linha.
--
-- Financeiro: faturamento que o cliente atribui aos anuncios, investimento
-- (se diferente do que a Meta registrou), custo operacional estimado em % do
-- faturamento (30% ate alguem ajustar) ou o custo efetivo, quando informado.
-- E dado sensivel do cliente: so ADM e o gestor de trafego da carteira veem.

alter table public.clients
  add column if not exists alvo_custo_mensagem numeric(12, 2) check (alvo_custo_mensagem is null or alvo_custo_mensagem > 0),
  add column if not exists alvo_mensagens_mes integer check (alvo_mensagens_mes is null or alvo_mensagens_mes > 0),
  add column if not exists alvo_visitas_perfil_mes integer check (alvo_visitas_perfil_mes is null or alvo_visitas_perfil_mes > 0),
  add column if not exists alvo_cpc numeric(12, 2) check (alvo_cpc is null or alvo_cpc > 0),
  add column if not exists alvo_faturamento_mes numeric(14, 2) check (alvo_faturamento_mes is null or alvo_faturamento_mes > 0),
  add column if not exists alvo_roas numeric(8, 2) check (alvo_roas is null or alvo_roas > 0),
  add column if not exists limite_investimento_mes numeric(14, 2) check (limite_investimento_mes is null or limite_investimento_mes > 0);

-- Chave ausente no json = nao mexe; chave com null = tira a meta.
create or replace function public.definir_metas_cliente_completo(p_client_id uuid, p_metas jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num numeric;
begin
  if not public.user_can_access_client(auth.uid(), p_client_id)
     or coalesce(public.get_my_role()::text, '') not in ('owner', 'admin', 'analyst') then
    raise exception 'Sem permissao para definir a meta deste cliente';
  end if;

  update public.clients c set
    alvo_resultados_mes     = case when p_metas ? 'alvo_resultados_mes'     then (p_metas->>'alvo_resultados_mes')::numeric::integer     else c.alvo_resultados_mes end,
    alvo_custo_resultado    = case when p_metas ? 'alvo_custo_resultado'    then (p_metas->>'alvo_custo_resultado')::numeric             else c.alvo_custo_resultado end,
    alvo_custo_mensagem     = case when p_metas ? 'alvo_custo_mensagem'     then (p_metas->>'alvo_custo_mensagem')::numeric              else c.alvo_custo_mensagem end,
    alvo_mensagens_mes      = case when p_metas ? 'alvo_mensagens_mes'      then (p_metas->>'alvo_mensagens_mes')::numeric::integer      else c.alvo_mensagens_mes end,
    alvo_visitas_perfil_mes = case when p_metas ? 'alvo_visitas_perfil_mes' then (p_metas->>'alvo_visitas_perfil_mes')::numeric::integer else c.alvo_visitas_perfil_mes end,
    alvo_cpc                = case when p_metas ? 'alvo_cpc'                then (p_metas->>'alvo_cpc')::numeric                         else c.alvo_cpc end,
    alvo_faturamento_mes    = case when p_metas ? 'alvo_faturamento_mes'    then (p_metas->>'alvo_faturamento_mes')::numeric             else c.alvo_faturamento_mes end,
    alvo_roas               = case when p_metas ? 'alvo_roas'               then (p_metas->>'alvo_roas')::numeric                        else c.alvo_roas end,
    limite_investimento_mes = case when p_metas ? 'limite_investimento_mes' then (p_metas->>'limite_investimento_mes')::numeric          else c.limite_investimento_mes end
  where c.id = p_client_id;
end;
$$;

revoke execute on function public.definir_metas_cliente_completo(uuid, jsonb) from public, anon;
grant execute on function public.definir_metas_cliente_completo(uuid, jsonb) to authenticated;

-- ── Financeiro ───────────────────────────────────────────────────────────────

create or replace function public.ve_financeiro_do_cliente(_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_can_access_client(auth.uid(), _client_id)
     and coalesce(public.get_my_role()::text, '') in ('owner', 'admin', 'analyst')
$$;
revoke execute on function public.ve_financeiro_do_cliente(uuid) from public, anon;
grant execute on function public.ve_financeiro_do_cliente(uuid) to authenticated;

-- Configuracao por cliente: o % de custo operacional que vale quando o mes
-- nao tem custo efetivo.
create table if not exists public.cliente_financeiro (
  client_id uuid primary key references public.clients(id) on delete cascade,
  custo_operacional_pct numeric(5, 2) not null default 30
    check (custo_operacional_pct >= 0 and custo_operacional_pct < 100),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Um registro por cliente e mes (mes = primeiro dia).
create table if not exists public.cliente_financeiro_mes (
  client_id uuid not null references public.clients(id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  faturamento numeric(14, 2) check (faturamento is null or faturamento >= 0),
  -- null = usa o investimento que a Meta registrou no mes.
  investimento_manual numeric(14, 2) check (investimento_manual is null or investimento_manual >= 0),
  -- null = usa o % de cliente_financeiro.
  custos_efetivos numeric(14, 2) check (custos_efetivos is null or custos_efetivos >= 0),
  observacao text,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (client_id, mes)
);

create or replace function public.carimbar_financeiro()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_cliente_financeiro_carimbo on public.cliente_financeiro;
create trigger trg_cliente_financeiro_carimbo
  before insert or update on public.cliente_financeiro
  for each row execute function public.carimbar_financeiro();

drop trigger if exists trg_cliente_financeiro_mes_carimbo on public.cliente_financeiro_mes;
create trigger trg_cliente_financeiro_mes_carimbo
  before insert or update on public.cliente_financeiro_mes
  for each row execute function public.carimbar_financeiro();

alter table public.cliente_financeiro enable row level security;
alter table public.cliente_financeiro_mes enable row level security;

drop policy if exists "Gestor da carteira ve e edita financeiro" on public.cliente_financeiro;
create policy "Gestor da carteira ve e edita financeiro" on public.cliente_financeiro
  for all to authenticated
  using (public.ve_financeiro_do_cliente(client_id))
  with check (public.ve_financeiro_do_cliente(client_id));

drop policy if exists "Gestor da carteira ve e edita financeiro do mes" on public.cliente_financeiro_mes;
create policy "Gestor da carteira ve e edita financeiro do mes" on public.cliente_financeiro_mes
  for all to authenticated
  using (public.ve_financeiro_do_cliente(client_id))
  with check (public.ve_financeiro_do_cliente(client_id));

grant select, insert, update, delete on public.cliente_financeiro to authenticated;
grant select, insert, update, delete on public.cliente_financeiro_mes to authenticated;
grant select on public.cliente_financeiro to service_role;
grant select on public.cliente_financeiro_mes to service_role;

notify pgrst, 'reload schema';
