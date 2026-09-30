-- O cerebro (memoria da empresa) deixa de ser so markdown no disco e passa a
-- ter uma copia consultavel pelo Manager. A fonte da verdade continua sendo
-- `cerebro/**/*.md` no repo: esta tabela e um espelho, reescrito por
-- `npm run subir --prefix cerebro`. Nada aqui deve ser editado a mao.
--
-- Por que espelhar em vez de servir arquivo estatico: o ProtectedRoute do app
-- e guarda client-side. Um grafo.json no build ficaria aberto por URL direta,
-- expondo a carteira inteira. Dentro do Postgres a RLS vale de verdade.

create table if not exists public.cerebro_notas (
  id               text primary key,
  nome             text        not null,
  titulo           text        not null,
  caminho          text        not null,
  tipo             text        not null default 'outros',
  resumo           text        not null default '',
  criado           text        not null default '',
  atualizado       text        not null default '',
  exemplo          boolean     not null default false,
  links            text[]      not null default '{}',
  corpo            text        not null default '',
  sincronizado_em  timestamptz not null default now()
);

comment on table public.cerebro_notas is
  'Espelho de cerebro/**/*.md. Reescrito por cerebro/scripts/subir.mjs; nao editar a mao.';

create index if not exists cerebro_notas_tipo_idx on public.cerebro_notas (tipo);

-- Busca textual do lado do banco, para a tela nao precisar baixar tudo so para
-- filtrar. `portuguese` cobre os stopwords certos ("de", "para", "com").
create index if not exists cerebro_notas_busca_idx on public.cerebro_notas
  using gin (to_tsvector('portuguese', titulo || ' ' || resumo || ' ' || corpo));

alter table public.cerebro_notas enable row level security;

-- Leitura: a memoria e da equipe inteira, nao e recortada por empresa como
-- `clients`. Qualquer usuario autenticado le.
drop policy if exists "Authenticated read cerebro" on public.cerebro_notas;
create policy "Authenticated read cerebro" on public.cerebro_notas
  for select to authenticated
  using (true);

-- Escrita: so admin/owner, e na pratica so pelo script de sync.
drop policy if exists "Admins write cerebro" on public.cerebro_notas;
create policy "Admins write cerebro" on public.cerebro_notas
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()))
  with check (public.is_admin_or_owner(auth.uid()));

-- Este projeto nao tem default privileges dando acesso automatico aos roles do
-- PostgREST: tabela nova nasce sem GRANT nenhum, e a RLS nem chega a ser
-- avaliada (o erro e 42501 permission denied, nao "no rows"). Mesmo motivo das
-- migrations *_service_role_grants.sql.
--
-- `anon` fica de fora de proposito: cerebro so para quem esta logado.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cerebro_notas TO service_role;

-- authenticated leva o conjunto completo porque a policy de escrita acima ainda
-- filtra para admin/owner; sem os GRANTs a policy seria letra morta.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cerebro_notas TO authenticated;
