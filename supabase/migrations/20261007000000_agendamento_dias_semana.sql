-- Dias da semana do agendamento de WhatsApp. 0 = domingo ... 6 = sabado, como
-- getDay(). O padrao e todo dia, que era o comportamento de antes.
alter table public.whatsapp_scheduled_messages
  add column if not exists dias_semana smallint[] not null default '{0,1,2,3,4,5,6}';
