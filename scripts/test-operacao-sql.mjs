import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create table companies(id uuid primary key);
create table clients(id uuid primary key,company_id uuid,name text);
create table client_tasks(id uuid,client_id uuid,fase text,titulo text,done boolean,posicao int);
create table client_fase_responsaveis(client_id uuid,fase text,responsavel_id uuid,primary key(client_id,fase));
create function status_pelo_checklist(text,int,int) returns text language sql as $$select coalesce($1,'a_fazer')$$;
create table user_companies(company_id uuid,user_id uuid,whatsapp text);
create table user_roles(user_id uuid,role text);
create table tasks(id uuid primary key default gen_random_uuid(),titulo text,company_id uuid,client_id uuid,assigned_to uuid,created_by uuid,status text,prazo date,categoria text,updated_at timestamptz,concluida_at timestamptz,checklist jsonb,descricao text,prioridade text,onboarding_fase text);
create table notifications(id uuid default gen_random_uuid(),user_id uuid,type text,title text,body text);
create table rotinas(id uuid); create table rotina_execucoes(id uuid);
create function is_my_company(x uuid) returns boolean language sql security definer as $$select exists(select 1 from user_companies where company_id=x and user_id=auth.uid())$$;
create function is_admin_or_owner(x uuid) returns boolean language sql security definer as $$select exists(select 1 from user_roles where user_id=x and role in ('admin','owner'))$$;
create schema cron;
create function cron.schedule(text,text,text) returns integer language sql as $$select 1$$;
create function dispatch_cron_job(text,integer) returns integer language sql as $$select 1$$;
`);
const sql = fs.readFileSync(
  new URL(
    "../supabase/migrations/20261011000000_operacao_inteligente.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(sql);

const c1 = "00000000-0000-0000-0000-000000000001",
  c2 = "00000000-0000-0000-0000-000000000002";
const u1 = "00000000-0000-0000-0000-000000000011",
  u2 = "00000000-0000-0000-0000-000000000012";
await db.exec(`insert into auth.users values ('${u1}'),('${u2}'); insert into companies values('${c1}'),('${c2}'); insert into user_companies values('${c1}','${u1}','5511999999999'),('${c2}','${u2}',null); insert into user_roles values('${u1}','admin'),('${u2}','admin');
insert into tasks(id,titulo,company_id,client_id,assigned_to,created_by,status,prazo,categoria,updated_at,concluida_at,horario_limite,bloqueio) values ('00000000-0000-0000-0000-000000000021','Arte','${c1}',null,'${u1}','${u1}','a_fazer',(now() at time zone 'America/Sao_Paulo')::date-1,'criativo',now()-interval '5 days',null,null,null);
insert into operacao_regras(company_id,tipo,ativa,horario,whatsapp) values('${c1}','atraso',true,'00:00',true);
`);
assert.equal(
  (await db.query("select executar_operacao_inteligente() n")).rows[0].n,
  1,
);
assert.equal(
  (await db.query("select executar_operacao_inteligente() n")).rows[0].n,
  0,
);
assert.equal(
  (await db.query("select count(*)::int n from notifications")).rows[0].n,
  1,
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from reclamar_whatsapp_operacional()",
    )
  ).rows[0].n,
  1,
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from reclamar_whatsapp_operacional()",
    )
  ).rows[0].n,
  0,
);
await assert.rejects(
  db.exec(
    `insert into operacao_regras(company_id,tipo,destinatarios) values('${c1}','prazo',array['${u2}'::uuid])`,
  ),
  /Destinatários/,
);
await db.exec(`set test.uid='${u2}'; set role authenticated;`);
assert.equal(
  (await db.query("select count(*)::int n from operacao_execucoes")).rows[0].n,
  0,
);
assert.equal(
  (await db.query("select count(*)::int n from operacao_regras")).rows[0].n,
  0,
);
await assert.rejects(
  db.query("select executar_operacao_inteligente()"),
  /permission denied/,
);
await db.exec(
  `reset role; set test.uid=''; update tasks set status='concluida'; delete from operacao_execucoes; delete from notifications;`,
);
assert.equal(
  (await db.query("select executar_operacao_inteligente() n")).rows[0].n,
  0,
);
await db.exec(`insert into operacao_regras(company_id,tipo,ativa,horario,antecedencia_horas) values('${c1}','prazo',true,'00:00',2);
insert into tasks(id,titulo,company_id,assigned_to,created_by,status,prazo,categoria,updated_at,horario_limite) values('00000000-0000-0000-0000-000000000022','Prazo 2h','${c1}','${u1}','${u1}','a_fazer',((now() at time zone 'America/Sao_Paulo') + interval '1 hour')::date,'outro',now(),((now() at time zone 'America/Sao_Paulo') + interval '1 hour')::time);`);
assert.equal(
  (await db.query("select executar_operacao_inteligente() n")).rows[0].n,
  1,
);
assert.equal(
  (await db.query("select executar_operacao_inteligente() n")).rows[0].n,
  0,
);
await db.exec(`insert into operacao_onboarding(company_id,fase,ativa,responsavel_id,dias_prazo) values('${c1}','acessos',true,'${u1}',7);
insert into clients values('00000000-0000-0000-0000-000000000031','${c1}','Novo cliente');
create function test_sync_etapa() returns trigger language plpgsql as $$begin perform sincronizar_demanda_da_etapa(new.client_id,new.fase); return new; end;$$;
create trigger test_sync after insert or update on client_fase_responsaveis for each row execute function test_sync_etapa();
set test.uid='${u1}'; set role authenticated;`);
const proposta = (await db.query("select id from operacao_aprovacoes")).rows[0]
  .id;
assert.ok(proposta);
await db.query("select decidir_onboarding_operacional($1,true)", [proposta]);
await assert.rejects(
  db.query("select decidir_onboarding_operacional($1,true)", [proposta]),
  /já decidida/,
);
await db.exec("reset role");
const etapa = (
  await db.query(
    "select company_id,assigned_to,prazo from tasks where onboarding_fase='acessos'",
  )
).rows[0];
assert.equal(etapa.company_id, c1);
assert.equal(etapa.assigned_to, u1);
assert.ok(etapa.prazo);
await db.exec(`set test.uid='${u2}'; set role authenticated;`);
await assert.rejects(
  db.query("select decidir_onboarding_operacional($1,true)", [proposta]),
  /Sem permissão/,
);
await assert.rejects(
  db.exec(
    `insert into operacao_avisos(company_id,autor_id,tipo,texto) values('${c1}','${u2}','alerta','Outro time')`,
  ),
  /row-level security/,
);
await db.exec("reset role");
console.log(
  "SQL validado: compilação, execução, deduplicação, claim concorrente, destinatários, RLS e permissões.",
);
await db.close();
