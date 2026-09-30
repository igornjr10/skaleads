-- Login e senha das contas do cliente (Facebook, Instagram, o que vier).
--
-- Por que nao virou coluna em `clients`: a RLS de `clients` libera SELECT para
-- qualquer membro do time (`Members view company clients`, `clients_select_team`).
-- Senha de Facebook de cliente virando coluna ali significa todo analyst e
-- viewer logado lendo tudo pela API REST. Entao: tabela propria, admin/owner so.
--
-- A senha nunca e gravada em texto. Fica cifrada com pgp_sym_encrypt usando uma
-- chave que mora no Vault do Supabase, fora desta tabela. Consequencia pratica:
-- um dump da tabela, ou um erro futuro de RLS, entrega bytea e nao senha.
--
-- Ninguem le `senha_cifrada` pelo navegador: o GRANT e por coluna e essa fica de
-- fora. O unico caminho ate o texto e `revelar_senha_acesso()`, que exige
-- admin/owner e registra em `client_acesso_revelacoes` quem revelou e quando.

create table if not exists public.client_acessos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,

  -- 'facebook' | 'instagram' | 'google' | ... — texto livre de proposito, a
  -- lista de plataformas muda mais rapido que o esquema.
  plataforma text not null,
  login text,
  senha_cifrada bytea,
  -- Para o que a coluna cifrada nao responde sozinha sem ser lida.
  tem_senha boolean generated always as (senha_cifrada is not null) stored,

  -- 2FA, conta dona do BM, "acesso pelo gerenciador do primo", etc.
  observacao text,

  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),

  unique (client_id, plataforma)
);

comment on table public.client_acessos is
  'Credenciais das contas do cliente, uma linha por plataforma. Senha cifrada com chave do Vault. Texto so por revelar_senha_acesso(), que audita.';

create index if not exists client_acessos_client_idx on public.client_acessos (client_id);

-- Quem viu qual senha e quando. Sem isto, "acesso restrito a admin" e promessa
-- sem registro: existem varios admins e nenhum rastro de quem abriu.
create table if not exists public.client_acesso_revelacoes (
  id uuid primary key default gen_random_uuid(),
  acesso_id uuid not null references public.client_acessos(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  plataforma text not null,
  user_id uuid references auth.users(id) on delete set null,
  revelado_em timestamptz not null default now()
);

create index if not exists client_acesso_revelacoes_acesso_idx
  on public.client_acesso_revelacoes (acesso_id, revelado_em desc);

comment on table public.client_acesso_revelacoes is
  'Log de quem revelou senha de cliente. Escrito so por revelar_senha_acesso().';

-- ---------------------------------------------------------------------------
-- Chave de cifragem
-- ---------------------------------------------------------------------------

-- Criada uma unica vez. Trocar a chave torna ilegivel tudo o que ja foi
-- cifrado, entao o bloco so age quando o segredo ainda nao existe.
do $chave$
begin
  if not exists (select 1 from vault.secrets where name = 'client_acessos_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'client_acessos_key',
      'Chave simetrica das senhas em public.client_acessos. Trocar invalida o que ja foi cifrado.'
    );
  end if;
end
$chave$;

create or replace function public._chave_acessos()
returns text
language sql
stable
security definer
set search_path = public, vault, extensions
as $fn$
  select decrypted_secret from vault.decrypted_secrets where name = 'client_acessos_key' limit 1;
$fn$;

-- Deliberado: nem `authenticated` nem `anon` executam isto. So as funcoes
-- abaixo, que rodam como dono e checam o papel antes.
revoke all on function public._chave_acessos() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Escopo
-- ---------------------------------------------------------------------------

-- As funcoes abaixo sao SECURITY DEFINER e portanto passam por cima da RLS de
-- `clients`. Esta aqui repete a mao as policies de SELECT que existem hoje em
-- `clients` (owner ve tudo; admin ve o da sua empresa ou do seu time). Se
-- aquelas policies mudarem, esta precisa mudar junto.
create or replace function public._cliente_no_escopo(p_client_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and (
        public.has_role(p_user_id, 'owner'::app_role)
        or c.company_id in (select public.my_company_ids())
        or c.team_id = public.my_team_id()
      )
  );
$fn$;

revoke all on function public._cliente_no_escopo(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gravar
-- ---------------------------------------------------------------------------

-- p_senha tem tres significados, e a diferenca importa: null mantem a senha que
-- ja esta la (da para corrigir o login sem redigitar a senha), string vazia
-- apaga, e qualquer outro texto substitui.
create or replace function public.salvar_acesso_cliente(
  p_client_id uuid,
  p_plataforma text,
  p_login text default null,
  p_senha text default null,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_id uuid;
  v_plataforma text := lower(btrim(coalesce(p_plataforma, '')));
begin
  if not public.is_admin_or_owner(auth.uid()) then
    raise exception 'Apenas admin ou owner pode gravar acessos de cliente.'
      using errcode = '42501';
  end if;

  if not public._cliente_no_escopo(p_client_id, auth.uid()) then
    raise exception 'Cliente fora do seu escopo.' using errcode = '42501';
  end if;

  if v_plataforma = '' then
    raise exception 'Plataforma obrigatoria.' using errcode = '22023';
  end if;

  insert into public.client_acessos as ca (
    client_id, plataforma, login, senha_cifrada, observacao, atualizado_por, atualizado_em
  )
  values (
    p_client_id,
    v_plataforma,
    nullif(btrim(coalesce(p_login, '')), ''),
    case
      when p_senha is null then null
      when btrim(p_senha) = '' then null
      else extensions.pgp_sym_encrypt(p_senha, public._chave_acessos())
    end,
    nullif(btrim(coalesce(p_observacao, '')), ''),
    auth.uid(),
    now()
  )
  on conflict (client_id, plataforma) do update set
    login = excluded.login,
    senha_cifrada = case when p_senha is null then ca.senha_cifrada else excluded.senha_cifrada end,
    observacao = excluded.observacao,
    atualizado_por = excluded.atualizado_por,
    atualizado_em = now()
  returning ca.id into v_id;

  return v_id;
end;
$fn$;

comment on function public.salvar_acesso_cliente(uuid, text, text, text, text) is
  'Cria ou atualiza o acesso de um cliente numa plataforma. p_senha null mantem a senha atual, string vazia apaga, texto substitui.';

create or replace function public.apagar_acesso_cliente(p_acesso_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_client_id uuid;
begin
  select client_id into v_client_id from public.client_acessos where id = p_acesso_id;
  if v_client_id is null then
    return;
  end if;

  if not public.is_admin_or_owner(auth.uid())
     or not public._cliente_no_escopo(v_client_id, auth.uid()) then
    raise exception 'Apenas admin ou owner do cliente pode apagar o acesso.'
      using errcode = '42501';
  end if;

  delete from public.client_acessos where id = p_acesso_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Revelar
-- ---------------------------------------------------------------------------

create or replace function public.revelar_senha_acesso(p_acesso_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_acesso public.client_acessos%rowtype;
  v_senha text;
begin
  select * into v_acesso from public.client_acessos where id = p_acesso_id;
  if v_acesso.id is null then
    raise exception 'Acesso nao encontrado.' using errcode = 'P0002';
  end if;

  if not public.is_admin_or_owner(auth.uid())
     or not public._cliente_no_escopo(v_acesso.client_id, auth.uid()) then
    raise exception 'Apenas admin ou owner do cliente pode revelar a senha.'
      using errcode = '42501';
  end if;

  if v_acesso.senha_cifrada is null then
    return null;
  end if;

  v_senha := extensions.pgp_sym_decrypt(v_acesso.senha_cifrada, public._chave_acessos());

  -- Grava o log ANTES de devolver: se a insercao falhar, a senha nao sai.
  insert into public.client_acesso_revelacoes (acesso_id, client_id, plataforma, user_id)
  values (v_acesso.id, v_acesso.client_id, v_acesso.plataforma, auth.uid());

  return v_senha;
end;
$fn$;

comment on function public.revelar_senha_acesso(uuid) is
  'Devolve a senha em texto para admin/owner e registra a revelacao. Unico caminho ate o texto.';

-- ---------------------------------------------------------------------------
-- RLS e grants
-- ---------------------------------------------------------------------------

alter table public.client_acessos enable row level security;
alter table public.client_acesso_revelacoes enable row level security;

-- O `exists (select ... from clients)` dentro da policy roda com a RLS de
-- `clients` aplicada ao proprio usuario: o escopo de empresa/time vem de graca
-- e acompanha mudanca futura nas policies de clients.
drop policy if exists "Admin le acessos de cliente" on public.client_acessos;
create policy "Admin le acessos de cliente" on public.client_acessos
  for select to authenticated
  using (
    public.is_admin_or_owner(auth.uid())
    and exists (select 1 from public.clients c where c.id = client_acessos.client_id)
  );

-- Sem policy de insert/update/delete de proposito: escrita so pelas funcoes
-- acima, que cifram a senha e checam o papel.

drop policy if exists "Admin le revelacoes" on public.client_acesso_revelacoes;
create policy "Admin le revelacoes" on public.client_acesso_revelacoes
  for select to authenticated
  using (
    public.is_admin_or_owner(auth.uid())
    and exists (select 1 from public.clients c where c.id = client_acesso_revelacoes.client_id)
  );

-- GRANT por coluna: `senha_cifrada` fica de fora, entao nem um `select=*` no
-- PostgREST devolve o bytea.
grant select (id, client_id, plataforma, login, tem_senha, observacao, atualizado_por, atualizado_em, criado_em)
  on public.client_acessos to authenticated;
grant select on public.client_acesso_revelacoes to authenticated;
grant select, insert, update, delete on public.client_acessos to service_role;
grant select, insert, update, delete on public.client_acesso_revelacoes to service_role;

grant execute on function public.salvar_acesso_cliente(uuid, text, text, text, text) to authenticated;
grant execute on function public.apagar_acesso_cliente(uuid) to authenticated;
grant execute on function public.revelar_senha_acesso(uuid) to authenticated;

notify pgrst, 'reload schema';
