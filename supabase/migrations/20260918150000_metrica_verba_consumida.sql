-- Devolve um alerta de verba ao motor, agora em cima de fato.
--
-- Em 17/09/2026 a migration 20260917140000 aposentou `clients.monthly_budget` e
-- com ela a metrica `budget` do motor de alertas. O alerta "Verba mensal
-- acabando" ficou apontando para uma metrica que nao existe mais: o motor cai no
-- `return 0` final, `0 >= 80` e sempre falso, e ele nunca mais disparou — mas
-- seguia na lista como se estivesse vigiando 36 clientes. Ele foi desativado
-- pela migration e alguem religou depois, o que so deixou o engano mais convincente.
--
-- A metrica nova, `budget_pct`, e gasto do mes dividido pelo APORTE do mes que a
-- Meta registrou (`client_funding_events`, evento `funding_event_successful`) —
-- os dois numeros vem da Meta, nenhum e digitado. Conta sem aporte lido nao tem
-- teto e devolve NaN no motor, entao nao dispara em vez de disparar com
-- porcentagem inventada.
--
-- Idempotente: pode rodar de novo sem efeito.

-- ── 1. Trocar a metrica morta pela nova nas regras salvas ────────────────────
-- Percorre o array de condicoes em vez de sobrescrever tudo: um alerta pode ter
-- ate 3 condicoes e so a de verba deve mudar. O limite (80, 50, o que for) e a
-- escolha de quem criou o alerta e fica intacto.
update public.alerts a
set rule_json = jsonb_set(
      a.rule_json,
      '{conditions}',
      (
        select jsonb_agg(
                 case when cond->>'metric' = 'budget'
                      then jsonb_set(cond, '{metric}', '"budget_pct"')
                      else cond
                 end
                 order by ord
               )
        from jsonb_array_elements(a.rule_json->'conditions') with ordinality as t(cond, ord)
      )
    )
where a.rule_json->'conditions' @> '[{"metric": "budget"}]'::jsonb;

-- ── 2. Limpar a descricao ────────────────────────────────────────────────────
-- Duas mentiras sobraram ali: o aviso de desativado (ele esta ligado e agora
-- funciona) e "verba mensal cadastrada" (nao ha mais nada cadastrado a mao).
update public.alerts
set description = nullif(btrim(
      replace(
        replace(description,
          '[Desativado em 17/09/2026: a verba manual foi aposentada. Use o alerta de saldo baixo.]', ''),
        'verba mensal cadastrada', 'verba do mes (aporte que entrou na conta Meta)')
    ), '')
where rule_json->'conditions' @> '[{"metric": "budget_pct"}]'::jsonb
  and description is not null;
