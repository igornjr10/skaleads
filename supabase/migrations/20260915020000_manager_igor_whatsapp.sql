-- Igor Ruan era o ultimo gestor sem WhatsApp cadastrado; agora entra nos envios.

-- Numero informado como 5599984573986 (13 digitos, com o nono). Gravado sem o
-- nono, igual aos outros tres de DDD 99 conferidos no perfil do WhatsApp em
-- 15/09/2026: acima do DDD 30 o JID brasileiro nao carrega esse digito. Se o
-- envio para ele falhar e o dos outros passar, e aqui que se mexe.
update public.managers
set whatsapp_number = '559984573986'
where lower(name) like '%igor%';

select name, coalesce(whatsapp_number, 'sem WhatsApp') as whatsapp
from public.managers
order by name;
