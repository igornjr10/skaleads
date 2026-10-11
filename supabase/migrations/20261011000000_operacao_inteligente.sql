-- Avisos operacionais reaproveitam tasks, notifications e o dispatch de cron.
-- Nenhuma regra modifica campanhas, valores ou a atribuição das demandas.
alter table public.tasks add column if not exists horario_limite time;
alter table public.tasks add column if not exists bloqueio text check (bloqueio in ('material_cliente','aprovacao_cliente','dependencia'));

create table public.operacao_regras (
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo text not null check (tipo in ('prazo','atraso','criativo','parada','carga','reuniao','resumo')),
  ativa boolean not null default false,
  horario time not null default '08:00',
  antecedencia_horas integer not null default 24 check (antecedencia_horas in (2,24)),
  dias_parada integer not null default 3 check (dias_parada between 1 and 90),
  limite_carga integer not null default 10 check (limite_carga between 1 and 1000),
  destinatarios uuid[] not null default '{}',
  whatsapp boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (company_id,tipo)
);
create table public.operacao_avisos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  autor_id uuid not null references auth.users(id),
  tipo text not null check (tipo in ('alerta','ideia','problema','aviso')),
  texto text not null check (length(trim(texto)) between 1 and 3000),
  resolvido_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.operacao_execucoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo text not null,
  chave text not null,
  destinatario uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  mensagem text not null,
  created_at timestamptz not null default now(),
  whatsapp_status text not null default 'desativado' check (whatsapp_status in ('desativado','pendente','processando','enviado','erro','cancelado')),
  erro text,
  processando_at timestamptz,
  unique (company_id,tipo,chave,destinatario)
);
create index operacao_avisos_empresa on public.operacao_avisos(company_id,created_at desc);
create index operacao_execucoes_empresa on public.operacao_execucoes(company_id,created_at desc);
create index operacao_whatsapp_fila on public.operacao_execucoes(created_at) where whatsapp_status = 'pendente';

alter table public.operacao_regras enable row level security;
alter table public.operacao_avisos enable row level security;
alter table public.operacao_execucoes enable row level security;
create policy "Empresa lê regras" on public.operacao_regras for select to authenticated using (public.is_my_company(company_id));
create policy "Gestão configura regras" on public.operacao_regras for all to authenticated
 using (public.is_my_company(company_id) and public.is_admin_or_owner(auth.uid()))
 with check (public.is_my_company(company_id) and public.is_admin_or_owner(auth.uid()));
create policy "Empresa lê avisos" on public.operacao_avisos for select to authenticated using (public.is_my_company(company_id));
create policy "Equipe registra aviso" on public.operacao_avisos for insert to authenticated with check (public.is_my_company(company_id) and autor_id = auth.uid());
create policy "Autor ou gestão resolve aviso" on public.operacao_avisos for update to authenticated
 using (public.is_my_company(company_id) and (autor_id = auth.uid() or public.is_admin_or_owner(auth.uid())))
 with check (public.is_my_company(company_id) and (autor_id = auth.uid() or public.is_admin_or_owner(auth.uid())));
create policy "Pessoa ou gestão lê execuções" on public.operacao_execucoes for select to authenticated
 using (public.is_my_company(company_id) and (destinatario = auth.uid() or public.is_admin_or_owner(auth.uid())));
grant select,insert,update on public.operacao_avisos, public.operacao_regras to authenticated;
grant select on public.operacao_execucoes to authenticated;
grant all on public.operacao_avisos, public.operacao_regras, public.operacao_execucoes to service_role;

create function public.guard_operacao() returns trigger language plpgsql security definer set search_path = public as $$
begin
 if tg_table_name = 'tasks' then
   if auth.uid() is not null and not public.is_admin_or_owner(auth.uid()) and old.created_by is distinct from auth.uid()
      and (new.horario_limite is distinct from old.horario_limite or new.bloqueio is distinct from old.bloqueio) then raise exception 'Apenas gestão ou solicitante pode alterar o horário'; end if;
 elsif tg_table_name = 'operacao_avisos' then
   if new.company_id is distinct from old.company_id or new.autor_id is distinct from old.autor_id
      or new.created_at is distinct from old.created_at then raise exception 'Empresa, autoria e data não mudam'; end if;
 elsif tg_table_name = 'operacao_regras' then
   if tg_op = 'UPDATE' and new.company_id is distinct from old.company_id then raise exception 'Empresa não muda'; end if;
   if exists (select 1 from unnest(new.destinatarios) uid where not exists (
     select 1 from public.user_companies uc join public.user_roles ur on ur.user_id = uc.user_id
     where uc.company_id = new.company_id and uc.user_id = uid and ur.role in ('admin','owner')
   )) then raise exception 'Destinatários adicionais devem ser gestores desta empresa'; end if;
   new.updated_at := now();
 end if;
 return new;
end; $$;
create trigger trg_operacao_horario before update on public.tasks for each row execute function public.guard_operacao();
create trigger trg_operacao_aviso before update on public.operacao_avisos for each row execute function public.guard_operacao();
create trigger trg_operacao_regra before insert or update on public.operacao_regras for each row execute function public.guard_operacao();

-- Carimbo e notificação na mesma transação: reexecução não duplica o aviso.
create function public.registrar_aviso_operacional(_empresa uuid, _tipo text, _chave text, _pessoa uuid, _titulo text, _mensagem text, _whatsapp boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
 if not exists (select 1 from public.user_companies where company_id = _empresa and user_id = _pessoa) then return; end if;
 insert into public.operacao_execucoes(company_id,tipo,chave,destinatario,titulo,mensagem,whatsapp_status)
 values (_empresa,_tipo,_chave,_pessoa,_titulo,_mensagem,case when _whatsapp then 'pendente' else 'desativado' end)
 on conflict (company_id,tipo,chave,destinatario) do nothing returning id into v_id;
 if v_id is not null then
   insert into public.notifications(user_id,type,title,body) values (_pessoa,'operacao',_titulo,_mensagem);
 end if;
end; $$;
revoke all on function public.registrar_aviso_operacional(uuid,text,text,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.registrar_aviso_operacional(uuid,text,text,uuid,text,text,boolean) to service_role;

create function public.executar_operacao_inteligente() returns integer
language plpgsql security definer set search_path = public as $$
declare
 r public.operacao_regras%rowtype;
 t record;
 u uuid;
 local_agora timestamp := now() at time zone 'America/Sao_Paulo';
 hoje date := local_agora::date;
 limite timestamp;
 chave text;
 titulo text;
 mensagem text;
 antes bigint;
 depois bigint;
begin
 if not pg_try_advisory_xact_lock(hashtext('operacao-inteligente')) then return 0; end if;
 select count(*) into antes from public.operacao_execucoes;
 for r in select * from public.operacao_regras where ativa loop
   if r.tipo in ('carga','resumo') then
     if local_agora::time < r.horario then continue; end if;
     for t in
       select uc.user_id,
         count(ts.id) filter (where ts.status <> 'concluida') abertas,
         count(ts.id) filter (where ts.status <> 'concluida' and ts.prazo < hoje) atrasadas,
         count(ts.id) filter (where ts.status <> 'concluida' and ts.prazo between hoje and hoje+2) proximas,
         count(ts.id) filter (where ts.status = 'concluida' and ts.concluida_at >= date_trunc('week',local_agora) at time zone 'America/Sao_Paulo') entregas
       from public.user_companies uc left join public.tasks ts on ts.company_id = uc.company_id and ts.assigned_to = uc.user_id
       where uc.company_id = r.company_id group by uc.user_id
     loop
       if r.tipo = 'carga' and t.abertas < r.limite_carga then continue; end if;
       titulo := case when r.tipo = 'carga' then 'Carga de trabalho elevada' else 'Resumo diário da operação' end;
       mensagem := format('%s abertas, %s atrasadas, %s vencem em até dois dias; %s entregas na semana. Consulte a Visão da Empresa para organizar as prioridades.',t.abertas,t.atrasadas,t.proximas,t.entregas);
       chave := t.user_id::text || ':' || hoje::text;
       perform public.registrar_aviso_operacional(r.company_id,r.tipo,chave,t.user_id,titulo,mensagem,r.whatsapp);
       -- Resumo agregado da empresa é enviado uma vez para cada gestor escolhido.
       if r.tipo = 'carga' then
         foreach u in array r.destinatarios loop
           perform public.registrar_aviso_operacional(r.company_id,r.tipo,chave,u,titulo,'Colaborador ' || t.user_id::text || ': ' || mensagem,r.whatsapp);
         end loop;
       end if;
     end loop;
     if r.tipo = 'resumo' then
       select format('%s demandas abertas, %s atrasadas, %s vencem em até dois dias; %s concluídas na semana.',
         count(*) filter (where status <> 'concluida'), count(*) filter (where status <> 'concluida' and prazo < hoje),
         count(*) filter (where status <> 'concluida' and prazo between hoje and hoje+2),
         count(*) filter (where status = 'concluida' and concluida_at >= date_trunc('week',local_agora) at time zone 'America/Sao_Paulo'))
       into mensagem from public.tasks where company_id = r.company_id;
       foreach u in array r.destinatarios loop
         perform public.registrar_aviso_operacional(r.company_id,r.tipo,'empresa:' || hoje::text,u,'Resumo da empresa',mensagem,r.whatsapp);
       end loop;
     end if;
     continue;
   end if;
   for t in select ts.*, c.name cliente from public.tasks ts left join public.clients c on c.id = ts.client_id and c.company_id = ts.company_id
     where ts.company_id = r.company_id and ts.status <> 'concluida' loop
     chave := t.id::text || ':' || hoje::text;
     if r.tipo in ('prazo','reuniao') then
       if t.prazo is null or (r.tipo = 'reuniao' and t.categoria <> 'reuniao') then continue; end if;
       if r.antecedencia_horas = 2 then
         if t.horario_limite is null then continue; end if;
         limite := t.prazo + t.horario_limite;
         if local_agora < limite - interval '2 hours' or local_agora >= limite then continue; end if;
       else
         if t.prazo <> hoje + 1 or local_agora::time < r.horario then continue; end if;
       end if;
       chave := t.id::text || ':' || t.prazo::text || ':' || coalesce(t.horario_limite::text,'') || ':' || r.antecedencia_horas::text;
       titulo := case when r.tipo = 'reuniao' then 'Lembrete de reunião: ' else 'Prazo próximo: ' end || t.titulo;
     elsif r.tipo in ('atraso','criativo') then
       if t.prazo is null or t.prazo >= hoje or local_agora::time < r.horario then continue; end if;
       if r.tipo = 'criativo' and t.categoria not in ('criativo','video','copy') then continue; end if;
       titulo := 'Entrega atrasada: ' || t.titulo;
     elsif r.tipo = 'parada' then
       if t.updated_at > now() - make_interval(days => r.dias_parada) or local_agora::time < r.horario then continue; end if;
       titulo := 'Demanda sem atualização: ' || t.titulo;
     end if;
     mensagem := coalesce(t.cliente,'Demanda interna') || '. Prazo: ' || coalesce(to_char(t.prazo,'DD/MM/YYYY'),'não definido')
       || coalesce(' às ' || to_char(t.horario_limite,'HH24:MI'),'') || '. Confirme o impedimento e registre o próximo passo na Central de Demandas.';
     perform public.registrar_aviso_operacional(r.company_id,r.tipo,chave,t.assigned_to,titulo,mensagem,r.whatsapp);
     foreach u in array r.destinatarios loop
       perform public.registrar_aviso_operacional(r.company_id,r.tipo,chave,u,titulo,mensagem,r.whatsapp);
     end loop;
   end loop;
 end loop;
 select count(*) into depois from public.operacao_execucoes;
 return (depois-antes)::integer;
end; $$;
revoke all on function public.executar_operacao_inteligente() from public,anon,authenticated;
grant execute on function public.executar_operacao_inteligente() to service_role;

-- Reclama o lote atomicamente. O worker não repete envios cujo resultado é incerto.
create function public.reclamar_whatsapp_operacional() returns setof public.operacao_execucoes
language plpgsql security definer set search_path = public as $$
begin
 update public.operacao_execucoes set whatsapp_status = 'erro', erro = 'Envio interrompido; confira a entrega antes de reenviar manualmente.'
 where whatsapp_status = 'processando' and processando_at < now() - interval '1 hour';
 update public.operacao_execucoes e set whatsapp_status='cancelado' from public.operacao_regras r
 where e.company_id=r.company_id and e.tipo=r.tipo and e.whatsapp_status='pendente' and (not r.ativa or not r.whatsapp);
 return query with lote as (
   select e.id from public.operacao_execucoes e join public.operacao_regras r on r.company_id=e.company_id and r.tipo=e.tipo
   where e.whatsapp_status='pendente' and r.ativa and r.whatsapp order by e.created_at limit 20 for update of e skip locked
 ) update public.operacao_execucoes e set whatsapp_status='processando', processando_at=now() from lote where e.id=lote.id returning e.*;
end; $$;
revoke all on function public.reclamar_whatsapp_operacional() from public,anon,authenticated;
grant execute on function public.reclamar_whatsapp_operacional() to service_role;

select cron.schedule('operacao-inteligente','*/5 * * * *', $$select public.executar_operacao_inteligente();$$);
select cron.schedule('operacao-whatsapp','*/5 * * * *', $$select public.dispatch_cron_job('operacao-whatsapp',120000);$$);

-- Realtime é um complemento; o cliente também consulta a cada 30 segundos.
do $$ declare tabela text; begin
 foreach tabela in array array['tasks','rotinas','rotina_execucoes'] loop
   if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists (
      select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tabela) then
     execute format('alter publication supabase_realtime add table public.%I',tabela);
   end if;
 end loop;
end $$;
notify pgrst, 'reload schema';

-- O checklist de entrada já nasce no trigger existente. Defaults de responsável
-- e prazo geram propostas; a gestão aprova antes de alterar a operação.
create table public.operacao_onboarding (
 company_id uuid not null references public.companies(id) on delete cascade,
 fase text not null check(fase in ('acessos','rastreamento','estrategia','operacao','geral')),
 ativa boolean not null default false,
 responsavel_id uuid references auth.users(id) on delete set null,
 dias_prazo integer not null default 7 check(dias_prazo between 0 and 90),
 primary key(company_id,fase)
);
create table public.operacao_aprovacoes (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 client_id uuid not null references public.clients(id) on delete cascade,
 fase text not null,
 responsavel_id uuid references auth.users(id) on delete set null,
 prazo date not null,
 status text not null default 'pendente' check(status in ('pendente','aprovada','recusada')),
 decidido_por uuid references auth.users(id),
 decidido_at timestamptz,
 created_at timestamptz not null default now(),
 unique(client_id,fase)
);
alter table public.operacao_onboarding enable row level security;
alter table public.operacao_aprovacoes enable row level security;
create policy "Gestão configura entrada" on public.operacao_onboarding for all to authenticated
 using(public.is_my_company(company_id) and public.is_admin_or_owner(auth.uid()))
 with check(public.is_my_company(company_id) and public.is_admin_or_owner(auth.uid()));
create policy "Gestão lê aprovações" on public.operacao_aprovacoes for select to authenticated
 using(public.is_my_company(company_id) and public.is_admin_or_owner(auth.uid()));
grant select,insert,update on public.operacao_onboarding to authenticated;
grant select on public.operacao_aprovacoes to authenticated;
grant all on public.operacao_onboarding,public.operacao_aprovacoes to service_role;

create function public.guard_onboarding_operacional() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' and new.company_id is distinct from old.company_id then raise exception 'Empresa não muda'; end if;
 if new.responsavel_id is not null and not exists(select 1 from public.user_companies where user_id=new.responsavel_id and company_id=new.company_id) then raise exception 'Responsável deve pertencer à empresa'; end if;
 return new;
end; $$;
create trigger trg_operacao_onboarding_guard before insert or update on public.operacao_onboarding for each row execute function public.guard_onboarding_operacional();
create function public.propor_onboarding_operacional() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.operacao_aprovacoes(company_id,client_id,fase,responsavel_id,prazo)
 select new.company_id,new.id,r.fase,r.responsavel_id,(now() at time zone 'America/Sao_Paulo')::date + r.dias_prazo
 from public.operacao_onboarding r where r.company_id=new.company_id and r.ativa
 on conflict(client_id,fase) do nothing;
 return new;
end; $$;
create trigger trg_z_operacao_onboarding after insert on public.clients for each row execute function public.propor_onboarding_operacional();
create function public.decidir_onboarding_operacional(_id uuid,_aprovar boolean) returns void
language plpgsql security definer set search_path=public as $$
declare p public.operacao_aprovacoes%rowtype;
begin
 select * into p from public.operacao_aprovacoes where id=_id for update;
 if p.id is null or not public.is_my_company(p.company_id) or not public.is_admin_or_owner(auth.uid()) then raise exception 'Sem permissão'; end if;
 if p.status <> 'pendente' then raise exception 'Proposta já decidida'; end if;
 if _aprovar then
   if p.responsavel_id is null or not exists(select 1 from public.user_companies where user_id=p.responsavel_id and company_id=p.company_id) then raise exception 'Configure um responsável válido antes de aprovar'; end if;
   if exists(select 1 from public.client_fase_responsaveis where client_id=p.client_id and fase=p.fase and responsavel_id is not null and responsavel_id <> p.responsavel_id) then raise exception 'Etapa já atribuída: revise no Onboarding'; end if;
   insert into public.client_fase_responsaveis(client_id,fase,responsavel_id) values(p.client_id,p.fase,p.responsavel_id)
   on conflict(client_id,fase) do update set responsavel_id=excluded.responsavel_id;
   -- O trigger existente sincroniza a demanda e o checklist, sem outra fila.
   update public.tasks set prazo=p.prazo where client_id=p.client_id and onboarding_fase=p.fase;
 end if;
 update public.operacao_aprovacoes set status=case when _aprovar then 'aprovada' else 'recusada' end,decidido_por=auth.uid(),decidido_at=now() where id=p.id;
end; $$;
revoke all on function public.decidir_onboarding_operacional(uuid,boolean) from public,anon;
grant execute on function public.decidir_onboarding_operacional(uuid,boolean) to authenticated;
notify pgrst, 'reload schema';

-- Empresa da demanda deriva do cliente, inclusive em instalações com vários times.
create or replace function public.sincronizar_demanda_da_etapa(_client_id uuid, _fase text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resp uuid;
  v_checklist jsonb;
  v_total int;
  v_feitas int;
  v_task public.tasks%rowtype;
  v_cliente text;
  v_empresa uuid;
  v_rotulo text := case _fase
    when 'acessos' then 'Acessos'
    when 'rastreamento' then 'Rastreamento'
    when 'estrategia' then 'Estratégia'
    when 'operacao' then 'Operação'
    else 'Geral' end;
begin
  select responsavel_id into v_resp
  from public.client_fase_responsaveis where client_id = _client_id and fase = _fase;

  select * into v_task from public.tasks where client_id = _client_id and onboarding_fase = _fase;
  if v_task.id is null and v_resp is null then
    return;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'texto', titulo, 'feito', done) order by posicao), '[]'::jsonb),
         count(*), count(*) filter (where done)
    into v_checklist, v_total, v_feitas
  from public.client_tasks where client_id = _client_id and fase = _fase;

  if v_task.id is null then
    select name, company_id into v_cliente, v_empresa from public.clients where id = _client_id;
    insert into public.tasks (titulo, descricao, client_id, assigned_to, created_by, categoria, checklist, status, onboarding_fase, company_id)
    values (
      'Onboarding · ' || v_rotulo,
      'Etapa de ' || v_rotulo || ' do onboarding de ' || coalesce(v_cliente, 'cliente')
        || '. O checklist acompanha o da tela de Onboarding.',
      _client_id, v_resp, auth.uid(), 'atendimento', v_checklist,
      public.status_pelo_checklist(null, v_total, v_feitas), _fase, v_empresa
    );
    return;
  end if;

  update public.tasks
     set assigned_to = v_resp,
         checklist = v_checklist,
         status = public.status_pelo_checklist(v_task.status, v_total, v_feitas)
   where id = v_task.id
     and (assigned_to is distinct from v_resp
          or checklist is distinct from v_checklist
          or status is distinct from public.status_pelo_checklist(v_task.status, v_total, v_feitas));
end;
$$;

