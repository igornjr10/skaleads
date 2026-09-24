-- Larisse Ribeiro entra como gestora selecionavel; sem WhatsApp por enquanto,
-- entao ela nao aparece nos destinos de envio, so na atribuicao de contas.

insert into public.managers (name, whatsapp_number, is_active)
select 'Larisse Ribeiro', null, true
where not exists (
  select 1 from public.managers where lower(name) like '%larisse%'
);
