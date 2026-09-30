-- Tira a IA do resumo de grupos e troca por sinal medido.
--
-- A tabela nasceu hoje esperando resposta de modelo: `resumo` em uma frase,
-- `pendencias` e `prometido` extraidos da conversa. Isso custa por grupo por dia
-- e o usuario decidiu nao pagar. Nenhuma linha chegou a ser gravada — a conta da
-- Anthropic estava sem credito —, entao nao ha dado a migrar.
--
-- O que entra no lugar nao e resumo: e triagem. Quem falou por ultimo, ha quanto
-- tempo o cliente espera, quantas vezes ele repetiu sem resposta, o que ele
-- perguntou (com as palavras dele, nao parafraseadas) e que palavras acenderam
-- luz. Tudo isso e contagem sobre o fluxo de mensagens, sai de graca e pode
-- rodar de 15 em 15 minutos em vez de uma vez por dia.
--
-- O que se perde junto: "a agencia prometeu X e nao confirmou". Compromisso so
-- se reconhece lendo, e regra confunde "ja fiz" com "vou fazer".

alter table public.grupo_resumos
  drop column if exists resumo,
  drop column if exists pendencias,
  drop column if exists prometido,
  drop column if exists modelo,
  drop column if exists tokens;

alter table public.grupo_resumos
  -- A ultima mensagem, com as palavras de quem escreveu. Sem parafrase nao ha
  -- o que sair errado: ou e o texto dele, ou nao e nada.
  add column if not exists ultima_mensagem text,
  add column if not exists ultima_de text,
  add column if not exists ultima_em timestamptz,
  add column if not exists ultima_da_agencia boolean not null default false,

  -- Quantas mensagens o cliente mandou desde a ultima fala da agencia. Tres
  -- seguidas sem resposta e cobranca, independente do que esteja escrito.
  add column if not exists cobrancas integer not null default 0,
  -- As falas dele que terminaram em pergunta e ficaram sem resposta:
  -- [{ "quem": "...", "texto": "...", "quando": "..." }]
  add column if not exists perguntas_abertas jsonb not null default '[]'::jsonb,
  -- Palavras que costumam marcar cliente incomodado: ["cancelar", "cade"].
  add column if not exists sinais jsonb not null default '[]'::jsonb;

-- `horas_sem_resposta` muda de sentido: passa a contar da PRIMEIRA mensagem sem
-- resposta, nao da ultima. Quem escreveu tres vezes desde as 9h espera desde as
-- 9h, e e esse numero que diz o tamanho do problema.
comment on column public.grupo_resumos.horas_sem_resposta is
  'Horas desde a primeira mensagem do cliente que a agencia ainda nao respondeu. null quando a agencia falou por ultimo.';

comment on table public.grupo_resumos is
  'Estado de triagem dos grupos de WhatsApp dos clientes: quem falou por ultimo, ha quanto tempo espera, o que perguntou. Medido do fluxo de mensagens (uazapi /message/find), sem IA. Uma linha por cliente por dia, reescrita a cada rodada.';

notify pgrst, 'reload schema';
