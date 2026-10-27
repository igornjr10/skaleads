-- COMPLETED e o prazo vencido (prazo-campanha.ts) e ARCHIVED vem da propria
-- Meta: o check antigo recusava os dois e derrubava o sync do cliente inteiro.
alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in ('ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED', 'COMPLETED'));

alter table public.ad_sets drop constraint if exists ad_sets_status_check;
alter table public.ad_sets add constraint ad_sets_status_check
  check (status in ('ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED'));

alter table public.ads drop constraint if exists ads_status_check;
alter table public.ads add constraint ads_status_check
  check (status in ('ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED'));
