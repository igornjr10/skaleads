-- Academia: modulos e aulas de treinamento da equipe, com progresso de cada
-- pessoa. O conteudo e editado na propria tela pelo ADM (link do Drive,
-- YouTube, PDF ou texto), sem precisar mexer no sistema.

create table if not exists public.academia_modulos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.default_company_id() references public.companies(id) on delete cascade,
  titulo text not null check (length(trim(titulo)) > 0),
  descricao text,
  categoria text not null default 'operacao'
    check (categoria in ('trafego', 'criativos', 'clientes', 'operacao', 'outro')),
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists academia_modulos_company_idx on public.academia_modulos (company_id, ordem);

create table if not exists public.academia_aulas (
  id uuid primary key default gen_random_uuid(),
  modulo_id uuid not null references public.academia_modulos(id) on delete cascade,
  titulo text not null check (length(trim(titulo)) > 0),
  descricao text,
  tipo text not null default 'video' check (tipo in ('video', 'pdf', 'link', 'texto')),
  url text check (url is null or url ~* '^https?://'),
  conteudo text,
  duracao_min integer check (duracao_min is null or duracao_min > 0),
  -- ["Sei abrir o gerenciador", "Sei ler o CPM"] — o que a pessoa marca ao estudar.
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists academia_aulas_modulo_idx on public.academia_aulas (modulo_id, ordem);

create table if not exists public.academia_progresso (
  aula_id uuid not null references public.academia_aulas(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  concluida_em timestamptz,
  -- Indices dos itens do checklist da aula ja marcados.
  checklist_feitos jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist_feitos) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (aula_id, user_id)
);
create index if not exists academia_progresso_user_idx on public.academia_progresso (user_id);

create or replace function public.empresa_da_aula(_aula_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.company_id from public.academia_aulas a join public.academia_modulos m on m.id = a.modulo_id where a.id = _aula_id
$$;
revoke execute on function public.empresa_da_aula(uuid) from public, anon;
grant execute on function public.empresa_da_aula(uuid) to authenticated;

alter table public.academia_modulos enable row level security;
alter table public.academia_aulas enable row level security;
alter table public.academia_progresso enable row level security;

drop policy if exists "Equipe ve modulos" on public.academia_modulos;
create policy "Equipe ve modulos" on public.academia_modulos
  for select to authenticated using (public.is_my_company(company_id));

drop policy if exists "ADM edita modulos" on public.academia_modulos;
create policy "ADM edita modulos" on public.academia_modulos
  for all to authenticated
  using (public.is_my_company(company_id) and public.is_admin_or_owner(auth.uid()))
  with check (public.is_my_company(company_id) and public.is_admin_or_owner(auth.uid()));

drop policy if exists "Equipe ve aulas" on public.academia_aulas;
create policy "Equipe ve aulas" on public.academia_aulas
  for select to authenticated
  using (exists (select 1 from public.academia_modulos m where m.id = modulo_id));

drop policy if exists "ADM edita aulas" on public.academia_aulas;
create policy "ADM edita aulas" on public.academia_aulas
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and exists (select 1 from public.academia_modulos m where m.id = modulo_id))
  with check (public.is_admin_or_owner(auth.uid()) and exists (select 1 from public.academia_modulos m where m.id = modulo_id));

-- Cada um ve e marca o proprio progresso; o ADM acompanha o da equipe.
drop policy if exists "Ve progresso proprio ou da equipe" on public.academia_progresso;
create policy "Ve progresso proprio ou da equipe" on public.academia_progresso
  for select to authenticated
  using (user_id = auth.uid()
         or (public.is_admin_or_owner(auth.uid()) and public.is_my_company(public.empresa_da_aula(aula_id))));

drop policy if exists "Marca o proprio progresso" on public.academia_progresso;
create policy "Marca o proprio progresso" on public.academia_progresso
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_my_company(public.empresa_da_aula(aula_id)));

grant select, insert, update, delete on public.academia_modulos to authenticated;
grant select, insert, update, delete on public.academia_aulas to authenticated;
grant select, insert, update, delete on public.academia_progresso to authenticated;

create or replace function public.carimbar_academia()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_academia_aulas_carimbo on public.academia_aulas;
create trigger trg_academia_aulas_carimbo before update on public.academia_aulas
  for each row execute function public.carimbar_academia();
drop trigger if exists trg_academia_progresso_carimbo on public.academia_progresso;
create trigger trg_academia_progresso_carimbo before update on public.academia_progresso
  for each row execute function public.carimbar_academia();

-- Na primeira visita do ADM, a trilha padrao nasce com os temas da
-- operacao; as aulas (videos, PDFs) ele adiciona depois pela tela.
create or replace function public.garantir_academia()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  empresa uuid := public.default_company_id();
begin
  if empresa is null or not public.is_admin_or_owner(auth.uid()) then
    return;
  end if;
  if exists (select 1 from public.academia_modulos where company_id = empresa) then
    return;
  end if;
  insert into public.academia_modulos (company_id, titulo, descricao, categoria, ordem) values
    (empresa, 'Estratégia de tráfego pago', 'Como a agência pensa e estrutura o tráfego dos clientes.', 'trafego', 1),
    (empresa, 'Análise e otimização de campanhas', 'O que olhar todo dia e o que mudar quando o resultado cai.', 'trafego', 2),
    (empresa, 'Criativos saturados', 'Como identificar fadiga de criativo (frequência, CTR, CPM) e quando trocar.', 'criativos', 3),
    (empresa, 'Anúncios e criativos eficientes', 'Ganchos, formatos e roteiros que funcionam para negócio local.', 'criativos', 4),
    (empresa, 'Referências e ideias de criativos', 'Onde e como buscar referências; uso da Biblioteca de ideias.', 'criativos', 5),
    (empresa, 'Estrutura no Meta Ads e Google Ads', 'Campanhas, conjuntos, públicos e configuração de cada plataforma.', 'trafego', 6),
    (empresa, 'Indicadores e relatórios', 'Como ler custo por mensagem, CPC, CTR, ROAS e montar o relatório do cliente.', 'trafego', 7),
    (empresa, 'Entrada de novos clientes', 'O passo a passo do onboarding: acessos, rastreamento e estratégia.', 'clientes', 8),
    (empresa, 'Organização e execução de demandas', 'Como abrir, tocar, revisar e entregar demandas na fila do time.', 'operacao', 9),
    (empresa, 'Reuniões e alinhamentos com clientes', 'Pauta, condução, registro de decisões e próximos passos.', 'clientes', 10),
    (empresa, 'Ordem de entrega dos serviços', 'A sequência de entregas da agência para cada cliente.', 'operacao', 11);
end;
$$;
revoke execute on function public.garantir_academia() from public, anon;
grant execute on function public.garantir_academia() to authenticated;

notify pgrst, 'reload schema';
