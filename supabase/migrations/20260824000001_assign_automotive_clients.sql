-- Carteira automotiva (lojas de veiculos, motos, concessionarias) sob
-- responsabilidade do Igor Ruan.

insert into public.managers (name, whatsapp_number, is_active)
select 'Igor Ruan', null, true
where not exists (select 1 from public.managers where lower(name) like '%igor%');

with igor as (
  select id from public.managers
  where lower(name) like '%igor%'
  order by created_at
  limit 1
)
update public.clients c
set manager_id = (select id from igor)
where c.manager_id is null
  and (
    c.business_segment = 'automotivo'
    or lower(c.name) ~ '(ve[ií]cul|autom[oó]tiv|auto ?center|auto ?pe[cç]|seminov|semi.novos|multimarca|concession|revenda|garagem|moto|import|chevrolet|volkswagen|hyundai|toyota|honda|yamaha|renault|nissan|peugeot|citroen|mitsubishi|ford|fiat|jeep|bmw|audi|\ycarr?os?\y|\ycars?\y)'
  );

-- Conferencia: rode junto para ver o que ficou com cada gestor.
select coalesce(m.name, 'sem gestor') as gestor, c.name as cliente, c.business_segment
from public.clients c
left join public.managers m on m.id = c.manager_id
order by 1, 2;
