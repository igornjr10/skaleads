-- Ficha cadastral do cliente: o que hoje mora em planilha/Notion e o gestor
-- precisa na mao quando vai emitir nota, cobrar ou falar com o responsavel.
--
-- Estes campos ficam no proprio `clients` de proposito: a RLS de `clients` ja
-- deixa qualquer membro do time ler, e isso aqui e cadastro operacional, nao
-- segredo. Login e senha de Facebook/Instagram NAO entram aqui — vao para
-- `client_acessos`, cifrados e restritos a admin/owner.
--
-- `whatsapp_comercial` e `whatsapp_pessoal` sao do cadastro do cliente e nao
-- se confundem com `whatsapp_number`, que e o numero para onde o hub dispara
-- relatorio e alerta.

alter table public.clients
  add column if not exists cnpj text,
  add column if not exists cpf text,
  add column if not exists email text,
  add column if not exists site text,
  add column if not exists responsavel_nome text,
  add column if not exists whatsapp_comercial text,
  add column if not exists whatsapp_pessoal text,
  add column if not exists metodo_pagamento text;

comment on column public.clients.cnpj is 'CNPJ do cliente, so digitos.';
comment on column public.clients.cpf is 'CPF do responsavel, so digitos. Usado quando o cliente e PF.';
comment on column public.clients.email is 'E-mail de contato do cliente (cobranca, envio de relatorio).';
comment on column public.clients.site is 'Site ou landing page do cliente.';
comment on column public.clients.responsavel_nome is 'Quem decide do lado do cliente.';
comment on column public.clients.whatsapp_comercial is 'WhatsApp comercial do cliente. Cadastro — nao e o numero de disparo (`whatsapp_number`).';
comment on column public.clients.whatsapp_pessoal is 'WhatsApp pessoal do responsavel. Cadastro — nao e o numero de disparo (`whatsapp_number`).';
comment on column public.clients.metodo_pagamento is 'Como o cliente paga a agencia: Pix, boleto, cartao, etc.';

notify pgrst, 'reload schema';
