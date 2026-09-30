-- Passo 2 de 3: backfill.
--
-- Roda ANTES do passo 3. Coloca todo cliente e todo usuario existente dentro da
-- MarketPro Ads, para que a virada das policies nao tire acesso de ninguem.
-- Cliente sem company_id fica invisivel para quem nao e owner — por isso este
-- passo nao pode ser pulado.

insert into public.companies (name)
select 'MarketPro Ads'
where not exists (select 1 from public.companies);

update public.clients
set company_id = (select id from public.companies order by created_at limit 1)
where company_id is null;

insert into public.user_companies (user_id, company_id)
select u.id, (select id from public.companies order by created_at limit 1)
from auth.users u
on conflict (user_id, company_id) do nothing;

-- Conferencia: as duas primeiras contagens tem que dar zero.
select
  (select count(*) from public.clients where company_id is null) as clientes_sem_empresa,
  (select count(*) from auth.users u
    where not exists (select 1 from public.user_companies uc where uc.user_id = u.id)) as usuarios_sem_empresa,
  (select count(*) from public.companies) as empresas;
