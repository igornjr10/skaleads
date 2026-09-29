-- Quem manda mensagem antes de virar lead fica com a conversa solta. Quando o
-- lead e cadastrado (ou ganha o WhatsApp), a conversa da mesma empresa com a
-- mesma chave passa a ser dele — e some da fila "sem lead".
create or replace function public.vincular_conversas_ao_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.wa_chave is not null
     and (tg_op = 'INSERT' or new.wa_chave is distinct from old.wa_chave) then
    update public.wa_mensagens
    set lead_id = new.id
    where company_id = new.company_id and chave = new.wa_chave and lead_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_leads_vincular_conversas on public.crm_leads;
create trigger trg_crm_leads_vincular_conversas
  after insert or update of whatsapp, telefone on public.crm_leads
  for each row execute function public.vincular_conversas_ao_lead();
