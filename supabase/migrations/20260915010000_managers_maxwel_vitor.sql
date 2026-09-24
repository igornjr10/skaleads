-- Larisse Ribeiro sai da equipe; Maxwel e Vitor Hugo entram como gestores.
-- Iarine Alves ganha o WhatsApp que faltava.

-- Numeros conferidos no perfil do WhatsApp de cada um, em 15/09/2026. Todos
-- sao DDD 99 e o proprio WhatsApp os mostra com 8 digitos, sem o nono. O JID
-- brasileiro so carrega o nono digito ate o DDD 30; de 31 para cima ele nao
-- existe. A Edge Function manda o campo `number` cru para a Evolution, entao
-- vale o que o WhatsApp mostra, nao o formato de 11 digitos do discador.
begin;

with entrada(nome, numero) as (
  values
    ('Maxwel',          '559982348772'),
    ('Vitor Hugo Nass', '559984666711')
)
insert into public.managers (name, whatsapp_number, is_active)
select e.nome, e.numero, true
from entrada e
where not exists (
  select 1 from public.managers m where lower(m.name) = lower(e.nome)
);

update public.managers
set whatsapp_number = '559984237057'
where lower(name) like '%iarine%';

-- As 25 contas da carteira dela caem para manager_id nulo pelo
-- "on delete set null" da FK, para redistribuir depois pela tela de Clientes.
delete from public.managers where lower(name) like '%larisse%';

commit;

-- Conferencia: rode junto.
select name, coalesce(whatsapp_number, 'sem WhatsApp') as whatsapp, is_active
from public.managers
order by name;

select count(*) as contas_sem_gestor from public.clients where manager_id is null;
