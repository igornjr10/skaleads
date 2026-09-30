-- Exclusao definitiva de usuario: alerts.created_by e
-- whatsapp_scheduled_messages.created_by referenciam auth.users sem ON DELETE,
-- entao qualquer usuario que tenha criado um alerta ou agendamento nao podia
-- ser removido (violacao de FK). Passam a soltar a referencia.

do $$
declare
  fk record;
begin
  for fk in
    select con.conname, rel.relname as table_name, att.attname as column_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_class ref on ref.oid = con.confrelid
    join pg_namespace refnsp on refnsp.oid = ref.relnamespace
    join unnest(con.conkey) as k(attnum) on true
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = k.attnum
    where con.contype = 'f'
      and nsp.nspname = 'public'
      and refnsp.nspname = 'auth'
      and ref.relname = 'users'
      and con.confdeltype = 'a'          -- NO ACTION: bloqueia o delete
      and array_length(con.conkey, 1) = 1
      and not att.attnotnull            -- so da pra anular coluna opcional
  loop
    execute format('alter table public.%I drop constraint %I', fk.table_name, fk.conname);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      fk.table_name, fk.conname, fk.column_name
    );
    raise notice 'FK % em public.%(%) agora e ON DELETE SET NULL', fk.conname, fk.table_name, fk.column_name;
  end loop;
end $$;
