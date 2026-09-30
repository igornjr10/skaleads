-- Conversas iniciadas (WhatsApp / Direct) por campanha, conjunto e anuncio.
-- `campaign_daily_metrics.messages` ja guarda o total da conta por dia; isso
-- aqui e o mesmo numero quebrado por entidade, para saber QUAL anuncio trouxe
-- a conversa em campanha de mensagem, onde `conversions` fica sempre em zero.
alter table public.campaigns add column if not exists messages integer not null default 0;
alter table public.ad_sets   add column if not exists messages integer not null default 0;
alter table public.ads       add column if not exists messages integer not null default 0;
