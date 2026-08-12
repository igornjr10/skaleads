-- A policy de insert de notifications era "WITH CHECK (true)": qualquer usuario
-- logado conseguia criar notificacao na caixa de qualquer outro, com titulo e
-- corpo arbitrarios (bom vetor de phishing dentro do proprio app).
--
-- Quem escreve notificacao pelo browser e o alert-engine, e sempre para o
-- proprio usuario da sessao. O run-alerts-cron usa service role, que ignora RLS.

drop policy if exists "System inserts notifications" on public.notifications;

create policy "notifications_insert_self" on public.notifications
  for insert to authenticated
  with check (user_id = auth.uid());
