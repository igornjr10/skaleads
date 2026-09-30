-- Resumo diario do que o cliente falou no grupo de WhatsApp.
--
-- O gestor abre 20 e poucos grupos por dia para descobrir se sobrou pedido sem
-- resposta. O que ele precisa nao e a conversa: e a lista do que foi pedido, do
-- que foi prometido e do que ficou no ar. Este e o lugar onde essa lista mora.
--
-- Uma linha por cliente por dia. Regerar o mesmo dia sobrescreve em vez de
-- empilhar (`unique (client_id, dia)`), senao o botao "resumir de novo" criaria
-- historico falso de dias repetidos.

create table if not exists public.grupo_resumos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  group_jid text not null,
  dia date not null,

  mensagens integer not null default 0,
  -- Quantos participantes distintos falaram: conversa de um lado so tem peso
  -- diferente de conversa com o cliente junto.
  participantes integer not null default 0,

  -- Uma linha de texto: o que aconteceu, para ler na listagem sem abrir.
  resumo text,
  -- [{ "quem": "Adrielly", "o_que": "...", "quando": "2026-09-18T12:26:00Z" }]
  pendencias jsonb not null default '[]'::jsonb,
  prometido jsonb not null default '[]'::jsonb,

  -- Horas desde a ultima mensagem do CLIENTE que ninguem da agencia respondeu.
  -- null quando nao ha nada pendente de resposta.
  horas_sem_resposta numeric,
  -- 'ok' | 'atencao' | 'urgente' — ordena a listagem por quem precisa de gestor.
  atencao text not null default 'ok',

  modelo text,
  tokens jsonb,
  gerado_em timestamptz not null default now(),

  unique (client_id, dia)
);

create index if not exists grupo_resumos_dia_idx on public.grupo_resumos (dia desc);
create index if not exists grupo_resumos_atencao_idx on public.grupo_resumos (atencao, dia desc);

comment on table public.grupo_resumos is
  'Resumo diario, gerado por IA, das conversas nos grupos de WhatsApp dos clientes. Fonte: uazapi /message/find. Uma linha por cliente por dia.';

alter table public.grupo_resumos enable row level security;

-- Leitura para quem esta logado, mesma regra dos outros dados de cliente.
-- Escrita so pela Edge Function, que usa service_role e ignora RLS: nao existe
-- caminho do navegador que grave resumo, entao nao ha policy de insert.
drop policy if exists "Authenticated le resumos de grupo" on public.grupo_resumos;
create policy "Authenticated le resumos de grupo" on public.grupo_resumos
  for select to authenticated
  using (true);

drop policy if exists "Admin apaga resumos de grupo" on public.grupo_resumos;
create policy "Admin apaga resumos de grupo" on public.grupo_resumos
  for delete to authenticated
  using (public.is_admin_or_owner(auth.uid()));

grant select on public.grupo_resumos to authenticated;
grant select, insert, update, delete on public.grupo_resumos to service_role;

notify pgrst, 'reload schema';
