-- CRM e prospeccao.
--
-- Um funil sem cliente e a prospeccao da propria agencia (SDR, closer, social
-- seller). Um funil com cliente e o CRM de vendas daquele cliente — o caminho
-- anuncio -> lead -> atendimento -> venda. Mesmas tabelas para os dois.
--
-- Quem ve: ADM tudo da empresa. Time comercial (sdr, closer, social_seller) os
-- leads de prospeccao deles e os ainda sem dono, para puxar. Gestor os leads
-- dos funis de clientes da carteira dele.

-- ── Helpers ──────────────────────────────────────────────────────────────────

create or replace function public.is_comercial(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role::text in ('sdr', 'closer', 'social_seller')
  )
$$;
revoke execute on function public.is_comercial(uuid) from public, anon;
grant execute on function public.is_comercial(uuid) to authenticated, service_role;

-- ── Funis e etapas ───────────────────────────────────────────────────────────

create table if not exists public.crm_funis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.default_company_id() references public.companies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now()
);

create index if not exists crm_funis_company_idx on public.crm_funis (company_id);

-- Funil de cliente pertence a empresa do cliente, nunca a que veio do front.
drop trigger if exists trg_crm_funis_company on public.crm_funis;
create trigger trg_crm_funis_company
  before insert or update of client_id on public.crm_funis
  for each row execute function public.company_from_client();

create table if not exists public.crm_etapas (
  id uuid primary key default gen_random_uuid(),
  funil_id uuid not null references public.crm_funis(id) on delete cascade,
  nome text not null,
  posicao integer not null default 0,
  -- ganho/perdido encerram o lead; o resto e caminho.
  tipo text not null default 'aberta' check (tipo in ('aberta', 'ganho', 'perdido')),
  created_at timestamptz not null default now()
);

create index if not exists crm_etapas_funil_idx on public.crm_etapas (funil_id, posicao);

alter table public.crm_funis enable row level security;
alter table public.crm_etapas enable row level security;

drop policy if exists "Ve funis da empresa" on public.crm_funis;
create policy "Ve funis da empresa" on public.crm_funis
  for select to authenticated
  using (public.is_my_company(company_id)
         and (client_id is null or client_id in (select id from public.clients)));

drop policy if exists "Admin gerencia funis" on public.crm_funis;
create policy "Admin gerencia funis" on public.crm_funis
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id));

drop policy if exists "Ve etapas de funil que enxerga" on public.crm_etapas;
create policy "Ve etapas de funil que enxerga" on public.crm_etapas
  for select to authenticated
  using (exists (select 1 from public.crm_funis f where f.id = funil_id));

drop policy if exists "Admin gerencia etapas" on public.crm_etapas;
create policy "Admin gerencia etapas" on public.crm_etapas
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and exists (select 1 from public.crm_funis f where f.id = funil_id))
  with check (public.is_admin_or_owner(auth.uid()) and exists (select 1 from public.crm_funis f where f.id = funil_id));

grant select, insert, update, delete on public.crm_funis, public.crm_etapas to authenticated;
grant select on public.crm_funis, public.crm_etapas to service_role;

-- ── Leads ────────────────────────────────────────────────────────────────────

create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  funil_id uuid not null references public.crm_funis(id) on delete cascade,
  etapa_id uuid not null references public.crm_etapas(id),
  client_id uuid references public.clients(id) on delete cascade,
  empresa text,
  contato_nome text not null,
  cargo text,
  telefone text,
  whatsapp text,
  instagram text,
  email text,
  segmento text,
  cidade text,
  origem text,
  canal text not null default 'sdr' check (canal in ('sdr', 'social', 'inbound', 'indicacao', 'anuncio', 'outro')),
  responsavel_id uuid references auth.users(id) on delete set null,
  closer_id uuid references auth.users(id) on delete set null,
  valor_estimado numeric(12, 2),
  proximo_contato_em timestamptz,
  reuniao_em timestamptz,
  motivo_perda text,
  observacoes text,
  ganho_em timestamptz,
  perdido_em timestamptz,
  convertido_client_id uuid references public.clients(id) on delete set null,
  posicao double precision not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_leads_funil_idx on public.crm_leads (funil_id, etapa_id);
create index if not exists crm_leads_resp_idx on public.crm_leads (responsavel_id);
create index if not exists crm_leads_closer_idx on public.crm_leads (closer_id);
create index if not exists crm_leads_followup_idx on public.crm_leads (company_id, proximo_contato_em);

-- Empresa e cliente vem do funil; etapa tem que ser do mesmo funil; ganho e
-- perdido carimbam a data. Autoria e empresa nao mudam depois.
create or replace function public.preparar_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  funil public.crm_funis%rowtype;
  etapa public.crm_etapas%rowtype;
begin
  select * into funil from public.crm_funis where id = new.funil_id;
  if not found then raise exception 'Funil inexistente'; end if;
  select * into etapa from public.crm_etapas where id = new.etapa_id;
  if not found or etapa.funil_id <> new.funil_id then
    raise exception 'A etapa nao pertence a este funil';
  end if;

  new.company_id := funil.company_id;
  new.client_id := funil.client_id;
  new.updated_at := now();

  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  if tg_op = 'INSERT' or new.etapa_id is distinct from old.etapa_id then
    new.ganho_em := case when etapa.tipo = 'ganho' then coalesce(new.ganho_em, now()) end;
    new.perdido_em := case when etapa.tipo = 'perdido' then coalesce(new.perdido_em, now()) end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_leads_preparar on public.crm_leads;
create trigger trg_crm_leads_preparar
  before insert or update on public.crm_leads
  for each row execute function public.preparar_lead();

alter table public.crm_leads enable row level security;

drop policy if exists "Ve leads que lhe cabem" on public.crm_leads;
create policy "Ve leads que lhe cabem" on public.crm_leads
  for select to authenticated
  using (public.is_my_company(company_id) and (
    public.is_admin_or_owner(auth.uid())
    or responsavel_id = auth.uid()
    or closer_id = auth.uid()
    or created_by = auth.uid()
    or (client_id is null and responsavel_id is null and public.is_comercial(auth.uid()))
    or (client_id is not null and client_id in (select id from public.clients))
  ));

-- Cadastra em funil que enxerga. O resto (empresa, cliente) o trigger preenche.
drop policy if exists "Cadastra lead em funil que enxerga" on public.crm_leads;
create policy "Cadastra lead em funil que enxerga" on public.crm_leads
  for insert to authenticated
  with check (created_by = auth.uid()
              and exists (select 1 from public.crm_funis f where f.id = funil_id)
              and (responsavel_id is null or responsavel_id = auth.uid() or public.shares_company(responsavel_id))
              and (closer_id is null or closer_id = auth.uid() or public.shares_company(closer_id)));

drop policy if exists "Atualiza lead que enxerga" on public.crm_leads;
create policy "Atualiza lead que enxerga" on public.crm_leads
  for update to authenticated
  using (public.is_my_company(company_id) and (
    public.is_admin_or_owner(auth.uid())
    or responsavel_id = auth.uid()
    or closer_id = auth.uid()
    or created_by = auth.uid()
    or (client_id is null and responsavel_id is null and public.is_comercial(auth.uid()))
    or (client_id is not null and client_id in (select id from public.clients))
  ))
  with check (exists (select 1 from public.crm_funis f where f.id = funil_id)
              and (responsavel_id is null or responsavel_id = auth.uid() or public.shares_company(responsavel_id))
              and (closer_id is null or closer_id = auth.uid() or public.shares_company(closer_id)));

drop policy if exists "Admin ou autor apaga lead" on public.crm_leads;
create policy "Admin ou autor apaga lead" on public.crm_leads
  for delete to authenticated
  using (public.is_my_company(company_id) and (public.is_admin_or_owner(auth.uid()) or created_by = auth.uid()));

grant select, insert, update, delete on public.crm_leads to authenticated;
grant select on public.crm_leads to service_role;

-- ── Atividades (historico de contatos) ───────────────────────────────────────

create table if not exists public.crm_atividades (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null default auth.uid(),
  tipo text not null check (tipo in (
    'mensagem', 'ligacao', 'ligacao_nao_atendida', 'follow_up', 'reuniao_marcada', 'reuniao_realizada',
    'proposta', 'negociacao', 'nota', 'etapa', 'convertido'
  )),
  canal text check (canal in ('whatsapp', 'instagram', 'email', 'telefone', 'presencial', 'video')),
  descricao text,
  -- clock_timestamp: mudanca de etapa e conversao nascem na mesma transacao e
  -- com now() empatariam, embaralhando a ordem do historico.
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists crm_atividades_lead_idx on public.crm_atividades (lead_id, created_at);
create index if not exists crm_atividades_autor_idx on public.crm_atividades (autor_id, created_at);

alter table public.crm_atividades enable row level security;

drop policy if exists "Ve atividades de lead que enxerga" on public.crm_atividades;
create policy "Ve atividades de lead que enxerga" on public.crm_atividades
  for select to authenticated
  using (exists (select 1 from public.crm_leads l where l.id = lead_id));

-- 'etapa' e 'convertido' so o banco escreve.
drop policy if exists "Registra atividade em lead que enxerga" on public.crm_atividades;
create policy "Registra atividade em lead que enxerga" on public.crm_atividades
  for insert to authenticated
  with check (autor_id = auth.uid()
              and tipo not in ('etapa', 'convertido')
              and exists (select 1 from public.crm_leads l where l.id = lead_id));

drop policy if exists "Autor ou admin apaga atividade" on public.crm_atividades;
create policy "Autor ou admin apaga atividade" on public.crm_atividades
  for delete to authenticated
  using ((autor_id = auth.uid() or public.is_admin_or_owner(auth.uid()))
         and tipo not in ('etapa', 'convertido')
         and exists (select 1 from public.crm_leads l where l.id = lead_id));

grant select, insert, delete on public.crm_atividades to authenticated;
grant select on public.crm_atividades to service_role;

create or replace function public.registrar_mudanca_de_etapa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.etapa_id is distinct from old.etapa_id then
    insert into public.crm_atividades (lead_id, autor_id, tipo, descricao)
    select new.id, auth.uid(), 'etapa', coalesce(de.nome, '?') || ' → ' || coalesce(para.nome, '?')
    from (select 1) x
    left join public.crm_etapas de on de.id = old.etapa_id
    left join public.crm_etapas para on para.id = new.etapa_id;
  end if;

  -- Lead passado para alguem: aviso no sino de quem recebeu.
  if new.responsavel_id is not null and new.responsavel_id is distinct from old.responsavel_id
     and new.responsavel_id is distinct from auth.uid() then
    insert into public.notifications (user_id, type, title, body)
    values (new.responsavel_id, 'lead', 'Novo lead para você', coalesce(new.empresa, new.contato_nome));
  end if;
  if new.closer_id is not null and new.closer_id is distinct from old.closer_id
     and new.closer_id is distinct from auth.uid() then
    insert into public.notifications (user_id, type, title, body)
    values (new.closer_id, 'lead', 'Reunião para você fechar',
            coalesce(new.empresa, new.contato_nome)
              || coalesce(' — ' || to_char(new.reuniao_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), ''));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_leads_historico on public.crm_leads;
create trigger trg_crm_leads_historico
  after update on public.crm_leads
  for each row execute function public.registrar_mudanca_de_etapa();

-- ── Funil padrao da prospeccao ───────────────────────────────────────────────

-- Chamada pela tela: cria o funil de prospeccao da empresa na primeira visita.
create or replace function public.garantir_funil_prospeccao()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  empresa uuid := public.my_team_id();
  funil uuid;
begin
  if empresa is null then raise exception 'Usuario sem empresa'; end if;

  select id into funil from public.crm_funis
  where company_id = empresa and client_id is null
  order by created_at limit 1;
  if funil is not null then return funil; end if;

  insert into public.crm_funis (company_id, nome) values (empresa, 'Prospecção') returning id into funil;
  insert into public.crm_etapas (funil_id, nome, posicao, tipo)
  select funil, e.nome, e.posicao, e.tipo
  from (values
    ('Lead', 1, 'aberta'), ('Primeiro contato', 2, 'aberta'), ('Em conversa', 3, 'aberta'),
    ('Qualificado', 4, 'aberta'), ('Reunião marcada', 5, 'aberta'), ('Reunião realizada', 6, 'aberta'),
    ('Proposta', 7, 'aberta'), ('Negociação', 8, 'aberta'), ('Fechado', 9, 'ganho'), ('Perdido', 10, 'perdido')
  ) as e(nome, posicao, tipo);
  return funil;
end;
$$;
revoke execute on function public.garantir_funil_prospeccao() from public, anon;
grant execute on function public.garantir_funil_prospeccao() to authenticated;

-- Funil de vendas de um cliente, com etapas mais curtas (atendimento).
create or replace function public.criar_funil_de_cliente(_client_id uuid, _nome text default 'Vendas')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  funil uuid;
begin
  if not public.is_admin_or_owner(auth.uid()) or not public.user_can_access_client(auth.uid(), _client_id) then
    raise exception 'Sem permissao para este cliente';
  end if;
  insert into public.crm_funis (client_id, nome) values (_client_id, coalesce(nullif(trim(_nome), ''), 'Vendas'))
  returning id into funil;
  insert into public.crm_etapas (funil_id, nome, posicao, tipo)
  select funil, e.nome, e.posicao, e.tipo
  from (values
    ('Novo lead', 1, 'aberta'), ('Em atendimento', 2, 'aberta'), ('Orçamento enviado', 3, 'aberta'),
    ('Negociação', 4, 'aberta'), ('Venda', 5, 'ganho'), ('Perdido', 6, 'perdido')
  ) as e(nome, posicao, tipo);
  return funil;
end;
$$;
revoke execute on function public.criar_funil_de_cliente(uuid, text) from public, anon;
grant execute on function public.criar_funil_de_cliente(uuid, text) to authenticated;

-- ── Lead vira cliente ────────────────────────────────────────────────────────

-- Cria o cliente com os dados do lead, move o lead para a etapa de ganho e
-- deixa o vinculo (convertido_client_id): o historico comercial continua no
-- lead e a pagina do cliente o encontra por ali.
create or replace function public.converter_lead_em_cliente(_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  lead public.crm_leads%rowtype;
  ganho uuid;
  cliente uuid;
begin
  if not public.is_admin_or_owner(auth.uid()) then
    raise exception 'So o ADM cadastra cliente';
  end if;

  select * into lead from public.crm_leads where id = _lead_id;
  if not found or not public.is_my_company(lead.company_id) then raise exception 'Lead nao encontrado'; end if;
  if lead.client_id is not null then raise exception 'Lead de funil de cliente nao vira cliente da agencia'; end if;
  if lead.convertido_client_id is not null then return lead.convertido_client_id; end if;

  insert into public.clients (name, status, company_id, email, whatsapp_comercial, city, business_segment, responsavel_nome)
  values (coalesce(nullif(trim(lead.empresa), ''), lead.contato_nome), 'active', lead.company_id,
          lead.email, coalesce(lead.whatsapp, lead.telefone), lead.cidade, lead.segmento, lead.contato_nome)
  returning id into cliente;

  select id into ganho from public.crm_etapas where funil_id = lead.funil_id and tipo = 'ganho' order by posicao limit 1;

  update public.crm_leads
  set convertido_client_id = cliente, etapa_id = coalesce(ganho, etapa_id)
  where id = _lead_id;

  insert into public.crm_atividades (lead_id, autor_id, tipo, descricao)
  values (_lead_id, auth.uid(), 'convertido', 'Virou cliente');

  return cliente;
end;
$$;
revoke execute on function public.converter_lead_em_cliente(uuid) from public, anon;
grant execute on function public.converter_lead_em_cliente(uuid) to authenticated;

notify pgrst, 'reload schema';
