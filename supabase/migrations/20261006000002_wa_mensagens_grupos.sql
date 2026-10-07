-- Mensagens de grupo entram na caixa: o grupo e a conversa (chave = JID do
-- grupo) e cada mensagem precisa dizer quem falou.
alter table public.wa_mensagens add column if not exists remetente text;
