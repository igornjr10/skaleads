-- Um WhatsApp por usuario: cada pessoa conecta o proprio numero (uma instancia
-- da uazapi para cada uma). O token envia mensagem em nome da pessoa, entao
-- so as Edge Functions leem; o browser enxerga o resto por grant de coluna.
--
-- `padrao` e o numero da empresa para o que nao tem criador (cobranca,
-- aviso de deposito, agendamento antigo). Quem tem criador sai do numero dele.
create table if not exists public.wa_instancias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text not null unique,
  token text not null unique,
  padrao boolean not null default false,
  conectado boolean not null default false,
  numero text,
  perfil_nome text,
  status_em timestamptz,
  criada_em timestamptz not null default now()
);

create unique index if not exists wa_instancias_padrao_unico on public.wa_instancias (company_id) where padrao;

alter table public.wa_instancias enable row level security;
revoke all on public.wa_instancias from anon, authenticated;
grant select (id, company_id, user_id, nome, padrao, conectado, numero, perfil_nome, status_em, criada_em)
  on public.wa_instancias to authenticated;
grant all on public.wa_instancias to service_role;

drop policy if exists "Ve o proprio numero ou, se ADM, os da empresa" on public.wa_instancias;
create policy "Ve o proprio numero ou, se ADM, os da empresa" on public.wa_instancias
  for select to authenticated
  using (user_id = auth.uid() or (public.is_admin_or_owner(auth.uid()) and public.is_my_company(company_id)));

-- O numero que ja existia era da agencia: fica com o dono e vira o padrao.
insert into public.wa_instancias (company_id, user_id, nome, token, padrao)
select emp.id, dono.user_id, w.nome, w.token, true
  from public.wa_instancia w
  cross join lateral (
    select nullif(trim(both '"' from value::text), '')::uuid as id
      from public.app_config where key = 'whatsapp_company_id'
  ) emp
  cross join lateral (
    select uc.user_id
      from public.user_companies uc
      join public.user_roles r on r.user_id = uc.user_id
     where uc.company_id = emp.id and r.role in ('owner', 'admin')
     order by (r.role = 'owner') desc, uc.created_at
     limit 1
  ) dono
 where emp.id is not null
on conflict do nothing;

create or replace function public.definir_numero_padrao_wa(_instancia uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _empresa uuid;
begin
  select company_id into _empresa from public.wa_instancias where id = _instancia;
  if _empresa is null then raise exception 'Número não encontrado'; end if;
  if not (public.is_admin_or_owner(auth.uid()) and public.is_my_company(_empresa)) then
    raise exception 'Só o ADM escolhe o número padrão';
  end if;
  update public.wa_instancias set padrao = false where company_id = _empresa and padrao and id <> _instancia;
  update public.wa_instancias set padrao = true where id = _instancia;
end;
$$;

revoke all on function public.definir_numero_padrao_wa(uuid) from public, anon;
grant execute on function public.definir_numero_padrao_wa(uuid) to authenticated;

-- Mensagem pertence ao numero que a recebeu ou enviou. A conversa passa a ser
-- (instancia, chave): o mesmo contato falando com duas pessoas sao duas conversas.
alter table public.wa_mensagens
  add column if not exists instancia_id uuid references public.wa_instancias(id) on delete set null;

update public.wa_mensagens m
   set instancia_id = i.id
  from public.wa_instancias i
 where m.instancia_id is null and i.padrao and i.company_id = m.company_id;

-- O id da uazapi e unico so dentro da instancia: dois numeros no mesmo grupo recebem a mesma mensagem.
alter table public.wa_mensagens drop constraint if exists wa_mensagens_messageid_key;
alter table public.wa_mensagens drop constraint if exists wa_mensagens_instancia_messageid_key;
alter table public.wa_mensagens add constraint wa_mensagens_instancia_messageid_key unique (instancia_id, messageid);

create index if not exists wa_mensagens_instancia_chave_idx on public.wa_mensagens (instancia_id, chave, enviada_em desc);
create index if not exists wa_mensagens_instancia_saida_idx on public.wa_mensagens (instancia_id, enviada_em) where direcao = 'saida';

drop policy if exists "Ve conversas que lhe cabem" on public.wa_mensagens;
create policy "Ve conversas que lhe cabem" on public.wa_mensagens
  for select to authenticated
  using (
    public.is_my_company(company_id)
    and (
      public.is_admin_or_owner(auth.uid())
      or exists (select 1 from public.wa_instancias i where i.id = instancia_id and i.user_id = auth.uid())
    )
  );

-- Ler uma conversa nao marca como lida a do colega: so o dono do numero zera o contador.
drop policy if exists "Marca como lida conversa que enxerga" on public.wa_mensagens;
create policy "Marca como lida conversa que enxerga" on public.wa_mensagens
  for update to authenticated
  using (exists (select 1 from public.wa_instancias i where i.id = instancia_id and i.user_id = auth.uid()))
  with check (exists (select 1 from public.wa_instancias i where i.id = instancia_id and i.user_id = auth.uid()));

-- Envio automatico sem criador gravado cai no numero padrao da empresa.
alter table public.report_schedules
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid();
