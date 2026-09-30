-- Meta de resultado do cliente. Nao e a verba (monthly_budget saiu em 17/09
-- por ser promessa, nao fato): e o que o gestor combinou entregar no mes.
-- "alvo_" e nao "meta_" porque meta_* ja sao as colunas da conta Meta.
-- Resultado = mensagens + ligacoes + rotas + leads, a mesma soma do resto do app.
alter table public.clients
  add column if not exists alvo_resultados_mes integer
    check (alvo_resultados_mes is null or alvo_resultados_mes > 0),
  add column if not exists alvo_custo_resultado numeric(12, 2)
    check (alvo_custo_resultado is null or alvo_custo_resultado > 0);

-- Quem gere o cliente define a meta. A policy de clients so deixa ADM
-- alterar a linha; esta funcao abre os dois campos, e so eles, para quem tem o
-- cliente na carteira (a mesma regra de user_can_access_client).
create or replace function public.definir_metas_cliente(
  p_client_id uuid,
  p_resultados_mes integer,
  p_custo_resultado numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.user_can_access_client(auth.uid(), p_client_id)
     or coalesce(public.get_my_role()::text, '') not in ('owner', 'admin', 'analyst') then
    raise exception 'Sem permissao para definir a meta deste cliente';
  end if;

  update public.clients
     set alvo_resultados_mes = p_resultados_mes,
         alvo_custo_resultado = p_custo_resultado
   where id = p_client_id;
end;
$$;

revoke execute on function public.definir_metas_cliente(uuid, integer, numeric) from public, anon;
grant execute on function public.definir_metas_cliente(uuid, integer, numeric) to authenticated;
