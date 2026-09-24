-- Aposenta a metrica `budget_pct`: ela inflava o consumo.
--
-- A conta era gasto do mes dividido pelo APORTE do mes. O que ficou de fora e o
-- saldo que veio virado do mes anterior — e e justamente ele que paga boa parte
-- da entrega no comeco do mes.
--
-- Conferido em 18/09/2026, com o saldo lido da propria Meta:
--
--   FM VEICULOS     aportou 1.500,00  gastou 1.550,02  ->  103,3%  e tem R$ 820,83 em caixa
--   MAGNIFICAT      aportou   350,00  gastou   347,99  ->   99,4%  e tem R$ 304,15 em caixa
--
-- Quem estourou a verba nao termina o mes com saldo sobrando. Somando o saldo
-- inicial (derivavel por `saldo_hoje + gasto_do_mes - aportes_do_mes`) a FM cai
-- para 65,4% e a Magnificat para 53,4%.
--
-- Nao corrigimos o denominador porque o proprio dado nao sustenta a conta: em
-- varios clientes esse saldo inicial derivado da NEGATIVO (PLANNER -62,23,
-- ABREU -78,14, ALAN DUTRA -70,80), o que so acontece se faltar aporte na base
-- ou se houver defasagem entre o saldo lido e o gasto contabilizado — a Meta
-- cobra pela manha o gasto da vespera. Tres numeros com atrasos diferentes nao
-- fazem uma porcentagem confiavel.
--
-- Fica no lugar a metrica `balance`: saldo e fato medido, nao derivado, e
-- responde a pergunta que importa — "esse cliente vai parar de entregar?". O
-- ritmo de queima continua visivel no card do cliente, com projecao do mes.
--
-- Idempotente: pode rodar de novo sem efeito.

-- Desativar, nao apagar: o alerta guarda o limite e os canais que alguem
-- escolheu, e apagar obrigaria a refazer tudo se a metrica voltar. Desativado
-- ele para de mentir e continua recuperavel.
update public.alerts
set is_active = false,
    description = coalesce(nullif(btrim(description), '') || ' ', '') ||
      '[Desativado em 18/09/2026: a metrica de verba ignorava o saldo do mes anterior e acusava estouro em conta com caixa. Use o alerta de saldo baixo.]'
where rule_json->'conditions' @> '[{"metric": "budget_pct"}]'::jsonb
  and is_active;

notify pgrst, 'reload schema';
