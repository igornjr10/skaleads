-- WhatsApp no CRM (uazapi, numero unico da agencia).
--
-- Entrada: a uazapi chama a Edge Function wa-webhook a cada mensagem; ela grava
-- em wa_mensagens e liga ao lead pelo telefone. Saida manual: wa-enviar. Saida
-- em massa (disparo) e cadencia (sequencia): tudo vira linha em wa_fila, que o
-- cron wa-processar-fila esvazia respeitando intervalo, teto diario e horario —
-- numero nao oficial que dispara rajada e bloqueado.

-- ── Chave de telefone ────────────────────────────────────────────────────────
-- O WhatsApp as vezes identifica celular brasileiro sem o 9 inicial (conta
-- antiga), e o cadastro do lead vem com ou sem 55. A chave e pais + DDD + os 8
-- ultimos digitos: casa as quatro formas.
create or replace function public.wa_chave(t text)
returns text
language sql
immutable
as $$
  select case
    when length(n) < 8 then null
    when length(n) in (10, 11) then '55' || substr(n, 1, 2) || right(n, 8)
    when n like '55%' and length(n) in (12, 13) then substr(n, 1, 4) || right(n, 8)
    else n
  end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as n) d
$$;

alter table public.crm_leads
  add column if not exists wa_chave text
  generated always as (public.wa_chave(coalesce(nullif(whatsapp, ''), telefone))) stored;
create index if not exists crm_leads_wa_chave_idx on public.crm_leads (company_id, wa_chave);

-- ── Mensagens ────────────────────────────────────────────────────────────────

create table if not exists public.wa_mensagens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid references public.crm_leads(id) on delete set null,
  chave text not null,
  chatid text,
  telefone text,
  nome_contato text,
  messageid text unique,
  direcao text not null check (direcao in ('entrada', 'saida')),
  tipo text,
  texto text,
  -- celular = enviada pelo aparelho, fora do sistema; contato = recebida.
  origem text not null check (origem in ('contato', 'celular', 'manual', 'disparo', 'sequencia')),
  status text,
  autor_id uuid references auth.users(id) on delete set null,
  fila_id uuid,
  enviada_em timestamptz not null default now(),
  lida_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists wa_mensagens_conversa_idx on public.wa_mensagens (company_id, chave, enviada_em desc);
create index if not exists wa_mensagens_lead_idx on public.wa_mensagens (lead_id, enviada_em);
create index if not exists wa_mensagens_saida_dia_idx on public.wa_mensagens (company_id, enviada_em) where direcao = 'saida';

alter table public.wa_mensagens enable row level security;

-- Conversa de lead segue o lead; conversa sem lead e do time comercial e do ADM.
drop policy if exists "Ve conversas que lhe cabem" on public.wa_mensagens;
create policy "Ve conversas que lhe cabem" on public.wa_mensagens
  for select to authenticated
  using (public.is_my_company(company_id) and (
    public.is_admin_or_owner(auth.uid())
    or (lead_id is not null and exists (select 1 from public.crm_leads l where l.id = lead_id))
    or (lead_id is null and public.is_comercial(auth.uid()))
  ));

-- Da tela so se marca como lida; gravar mensagem e com as Edge Functions.
drop policy if exists "Marca como lida conversa que enxerga" on public.wa_mensagens;
create policy "Marca como lida conversa que enxerga" on public.wa_mensagens
  for update to authenticated
  using (public.is_my_company(company_id) and (
    public.is_admin_or_owner(auth.uid())
    or (lead_id is not null and exists (select 1 from public.crm_leads l where l.id = lead_id))
    or (lead_id is null and public.is_comercial(auth.uid()))
  ));

revoke insert, update, delete on public.wa_mensagens from authenticated;
grant select on public.wa_mensagens to authenticated;
grant update (lida_em) on public.wa_mensagens to authenticated;
grant select, insert, update on public.wa_mensagens to service_role;

-- ── Limites de envio ─────────────────────────────────────────────────────────

create table if not exists public.wa_config (
  company_id uuid primary key references public.companies(id) on delete cascade,
  limite_diario integer not null default 150 check (limite_diario between 1 and 2000),
  intervalo_seg integer not null default 30 check (intervalo_seg between 10 and 600),
  hora_inicio integer not null default 8 check (hora_inicio between 0 and 23),
  hora_fim integer not null default 20 check (hora_fim between 1 and 24),
  updated_at timestamptz not null default now(),
  check (hora_fim > hora_inicio)
);

alter table public.wa_config enable row level security;
drop policy if exists "Empresa ve seus limites" on public.wa_config;
create policy "Empresa ve seus limites" on public.wa_config
  for select to authenticated using (public.is_my_company(company_id));
drop policy if exists "Admin ajusta limites" on public.wa_config;
create policy "Admin ajusta limites" on public.wa_config
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id));
grant select, insert, update on public.wa_config to authenticated;
grant select on public.wa_config to service_role;

-- ── Modelos ──────────────────────────────────────────────────────────────────

create table if not exists public.wa_modelos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.default_company_id() references public.companies(id) on delete cascade,
  nome text not null,
  texto text not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.wa_modelos enable row level security;
drop policy if exists "Empresa ve modelos" on public.wa_modelos;
create policy "Empresa ve modelos" on public.wa_modelos
  for select to authenticated using (public.is_my_company(company_id));
drop policy if exists "Autor ou admin mexe no modelo" on public.wa_modelos;
create policy "Autor ou admin mexe no modelo" on public.wa_modelos
  for all to authenticated
  using (public.is_my_company(company_id) and (public.is_admin_or_owner(auth.uid()) or created_by = auth.uid()))
  with check (public.is_my_company(company_id) and (public.is_admin_or_owner(auth.uid()) or created_by = auth.uid()));
grant select, insert, update, delete on public.wa_modelos to authenticated;

-- ── Sequencias ───────────────────────────────────────────────────────────────

create table if not exists public.wa_sequencias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.default_company_id() references public.companies(id) on delete cascade,
  nome text not null,
  ativa boolean not null default true,
  parar_se_responder boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.wa_sequencia_passos (
  id uuid primary key default gen_random_uuid(),
  sequencia_id uuid not null references public.wa_sequencias(id) on delete cascade,
  ordem integer not null,
  -- Dias depois do passo anterior (do inicio, no primeiro).
  espera_dias integer not null default 0 check (espera_dias between 0 and 90),
  texto text not null,
  unique (sequencia_id, ordem)
);

alter table public.wa_sequencias enable row level security;
alter table public.wa_sequencia_passos enable row level security;

drop policy if exists "Empresa ve sequencias" on public.wa_sequencias;
create policy "Empresa ve sequencias" on public.wa_sequencias
  for select to authenticated using (public.is_my_company(company_id));
drop policy if exists "Admin monta sequencias" on public.wa_sequencias;
create policy "Admin monta sequencias" on public.wa_sequencias
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id))
  with check (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id));

drop policy if exists "Ve passos de sequencia que enxerga" on public.wa_sequencia_passos;
create policy "Ve passos de sequencia que enxerga" on public.wa_sequencia_passos
  for select to authenticated using (exists (select 1 from public.wa_sequencias s where s.id = sequencia_id));
drop policy if exists "Admin monta passos" on public.wa_sequencia_passos;
create policy "Admin monta passos" on public.wa_sequencia_passos
  for all to authenticated
  using (public.is_admin_or_owner(auth.uid()) and exists (select 1 from public.wa_sequencias s where s.id = sequencia_id))
  with check (public.is_admin_or_owner(auth.uid()) and exists (select 1 from public.wa_sequencias s where s.id = sequencia_id));

grant select, insert, update, delete on public.wa_sequencias, public.wa_sequencia_passos to authenticated;
grant select on public.wa_sequencias, public.wa_sequencia_passos to service_role;

-- ── Disparos, inscricoes e fila ──────────────────────────────────────────────

create table if not exists public.wa_disparos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.default_company_id() references public.companies(id) on delete cascade,
  nome text not null,
  texto text not null,
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'concluido', 'cancelado')),
  criado_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.wa_inscricoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.default_company_id() references public.companies(id) on delete cascade,
  sequencia_id uuid not null references public.wa_sequencias(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  status text not null default 'ativa' check (status in ('ativa', 'concluida', 'respondeu', 'cancelada')),
  passo_atual integer not null default 0,
  criado_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- Um lead nao entra duas vezes na mesma cadencia enquanto ela corre.
create unique index if not exists wa_inscricoes_ativa_unica on public.wa_inscricoes (sequencia_id, lead_id) where status = 'ativa';

create table if not exists public.wa_fila (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.default_company_id() references public.companies(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  texto text not null,
  origem text not null check (origem in ('disparo', 'sequencia')),
  disparo_id uuid references public.wa_disparos(id) on delete cascade,
  inscricao_id uuid references public.wa_inscricoes(id) on delete cascade,
  passo integer,
  enviar_apos timestamptz not null default now(),
  status text not null default 'pendente' check (status in ('pendente', 'enviado', 'erro', 'cancelado')),
  erro text,
  enviado_em timestamptz,
  criado_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check ((origem = 'disparo') = (disparo_id is not null)),
  check ((origem = 'sequencia') = (inscricao_id is not null))
);

create index if not exists wa_fila_pendente_idx on public.wa_fila (enviar_apos) where status = 'pendente';
create index if not exists wa_fila_disparo_idx on public.wa_fila (disparo_id);
create index if not exists wa_fila_inscricao_idx on public.wa_fila (inscricao_id);

alter table public.wa_disparos enable row level security;
alter table public.wa_inscricoes enable row level security;
alter table public.wa_fila enable row level security;

drop policy if exists "Ve disparos da empresa" on public.wa_disparos;
create policy "Ve disparos da empresa" on public.wa_disparos
  for select to authenticated
  using (public.is_my_company(company_id) and (public.is_admin_or_owner(auth.uid()) or criado_por = auth.uid()));
drop policy if exists "Cria disparo na empresa" on public.wa_disparos;
create policy "Cria disparo na empresa" on public.wa_disparos
  for insert to authenticated
  with check (public.is_my_company(company_id) and criado_por = auth.uid());
drop policy if exists "Autor ou admin controla disparo" on public.wa_disparos;
create policy "Autor ou admin controla disparo" on public.wa_disparos
  for update to authenticated
  using (public.is_my_company(company_id) and (public.is_admin_or_owner(auth.uid()) or criado_por = auth.uid()))
  with check (public.is_my_company(company_id));

drop policy if exists "Ve inscricoes da empresa" on public.wa_inscricoes;
create policy "Ve inscricoes da empresa" on public.wa_inscricoes
  for select to authenticated
  using (public.is_my_company(company_id) and exists (select 1 from public.crm_leads l where l.id = lead_id));
drop policy if exists "Inscreve lead que enxerga" on public.wa_inscricoes;
create policy "Inscreve lead que enxerga" on public.wa_inscricoes
  for insert to authenticated
  with check (public.is_my_company(company_id) and criado_por = auth.uid()
              and exists (select 1 from public.crm_leads l where l.id = lead_id)
              and exists (select 1 from public.wa_sequencias s where s.id = sequencia_id));
drop policy if exists "Autor ou admin cancela inscricao" on public.wa_inscricoes;
create policy "Autor ou admin cancela inscricao" on public.wa_inscricoes
  for update to authenticated
  using (public.is_my_company(company_id) and (public.is_admin_or_owner(auth.uid()) or criado_por = auth.uid()))
  with check (public.is_my_company(company_id));

-- Enfileira so para lead que a pessoa enxerga (a subconsulta passa pela RLS).
drop policy if exists "Ve fila da empresa" on public.wa_fila;
create policy "Ve fila da empresa" on public.wa_fila
  for select to authenticated
  using (public.is_my_company(company_id) and exists (select 1 from public.crm_leads l where l.id = lead_id));
drop policy if exists "Enfileira para lead que enxerga" on public.wa_fila;
create policy "Enfileira para lead que enxerga" on public.wa_fila
  for insert to authenticated
  with check (public.is_my_company(company_id) and criado_por = auth.uid()
              and exists (select 1 from public.crm_leads l where l.id = lead_id)
              and (disparo_id is null or exists (select 1 from public.wa_disparos d where d.id = disparo_id and d.criado_por = auth.uid())));
drop policy if exists "Autor ou admin cancela envio" on public.wa_fila;
create policy "Autor ou admin cancela envio" on public.wa_fila
  for update to authenticated
  using (public.is_my_company(company_id) and (public.is_admin_or_owner(auth.uid()) or criado_por = auth.uid()))
  with check (public.is_my_company(company_id) and status in ('pendente', 'cancelado'));

grant select, insert, update on public.wa_disparos, public.wa_fila to authenticated;
grant select, insert, update on public.wa_inscricoes to authenticated;
grant select, insert, update on public.wa_disparos, public.wa_inscricoes, public.wa_fila to service_role;

-- Inscreve leads numa sequencia: cria a inscricao e agenda o primeiro passo.
-- security invoker: a RLS de crm_leads decide quem a pessoa pode inscrever.
create or replace function public.inscrever_em_sequencia(_sequencia_id uuid, _lead_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  seq public.wa_sequencias%rowtype;
  primeiro public.wa_sequencia_passos%rowtype;
  lead uuid;
  inscricao uuid;
  total integer := 0;
begin
  select * into seq from public.wa_sequencias where id = _sequencia_id;
  if not found or not seq.ativa then raise exception 'Sequencia inexistente ou pausada'; end if;
  select * into primeiro from public.wa_sequencia_passos where sequencia_id = _sequencia_id order by ordem limit 1;
  if not found then raise exception 'A sequencia nao tem mensagens'; end if;

  foreach lead in array _lead_ids loop
    -- Lead invisivel para quem chama, ja inscrito ou sem WhatsApp: pula.
    continue when not exists (select 1 from public.crm_leads l where l.id = lead and l.wa_chave is not null);
    continue when exists (select 1 from public.wa_inscricoes i where i.sequencia_id = _sequencia_id and i.lead_id = lead and i.status = 'ativa');

    insert into public.wa_inscricoes (sequencia_id, lead_id) values (_sequencia_id, lead)
    returning id into inscricao;
    insert into public.wa_fila (lead_id, texto, origem, inscricao_id, passo, enviar_apos)
    values (lead, primeiro.texto, 'sequencia', inscricao, primeiro.ordem, now() + make_interval(days => primeiro.espera_dias));
    total := total + 1;
  end loop;
  return total;
end;
$$;

-- ── Leitura, empresa do numero e tempo real ──────────────────────────────────

-- O numero e um so (secrets UAZAPI_*): a mensagem sem lead cai nesta empresa.
insert into public.app_config (key, value)
select 'whatsapp_company_id', id::text from public.companies order by created_at limit 1
on conflict (key) do nothing;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wa_mensagens') then
    execute 'alter publication supabase_realtime add table public.wa_mensagens';
  end if;
end $$;

-- Disparos e sequencias saem pelo cron a cada minuto. Timeout longo: a
-- function espera o intervalo entre envios dentro da mesma chamada.
select cron.unschedule(jobid) from cron.job where jobname = 'wa-processar-fila';
select cron.schedule('wa-processar-fila', '* * * * *', $$ select public.dispatch_cron_job('wa-processar-fila', 60000); $$);

notify pgrst, 'reload schema';
