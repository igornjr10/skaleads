-- O link publico de relatorio passa a ser servido pela Edge Function
-- get-shared-report (service role + token validado no servidor).
--
-- A policy antiga era inofensiva na pratica porque anon nunca teve GRANT em
-- reports (o share publico simplesmente nao funcionava, dava 42501). Se
-- alguem "consertasse" adicionando o grant, a policy liberaria TODOS os
-- relatorios com share_token para qualquer anonimo: RLS filtra linha, nao o
-- WHERE que o cliente manda. Removida para nao virar essa armadilha.
drop policy if exists "reports_public_share" on public.reports;

revoke all on public.reports from anon;

-- A RPC de contagem de views so e chamada pela Edge Function agora. Ela e
-- SECURITY DEFINER e escreve, entao tirar o EXECUTE de public (que cobre anon)
-- e o que realmente fecha; o revoke em anon sozinho nao adiantaria.
revoke execute on function public.increment_report_views(text) from public;
revoke execute on function public.increment_report_views(text) from anon;
grant execute on function public.increment_report_views(text) to service_role;
