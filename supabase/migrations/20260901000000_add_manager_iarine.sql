-- Iarine entra como gestora selecionavel e assume a carteira dela. Sem
-- WhatsApp por enquanto, entao ela nao aparece nos destinos de envio.

insert into public.managers (name, whatsapp_number, is_active)
select 'Iarine Alves', null, true
where not exists (
  select 1 from public.managers where lower(name) like '%iarine%'
);

-- Os nomes vieram abreviados, entao o casamento e por trecho:
--   larifitness  -> tira o espaco, cobre "LARI FITNESS" e "LARIFITNESS"
--   magn_fica    -> o _ cobre a acentuacao de "MAGNIFICA"/"MAGNIFICA"
--   coxinha      -> mais seguro que "donna", que tambem casaria com "DONNAS"
with iarine as (
  select id from public.managers
  where lower(name) like '%iarine%'
  order by created_at
  limit 1
)
update public.clients c
set manager_id = (select id from iarine)
where lower(c.name) like '%pratos%'
   or lower(c.name) like '%coxinha%'
   or lower(c.name) like '%xandy%'
   or replace(lower(c.name), ' ', '') like '%larifitness%'
   or lower(c.name) like '%magn_fica%';

-- Conferencia: tem que listar os 5. Cliente cujo nome no banco nao bateu com
-- os trechos acima simplesmente nao aparece — se vier menos de 5, e isso.
select m.name as gestor, c.name as cliente
from public.clients c
join public.managers m on m.id = c.manager_id
where lower(m.name) like '%iarine%'
order by 2;
