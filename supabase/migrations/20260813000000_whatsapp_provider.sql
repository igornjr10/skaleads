-- Provedor de WhatsApp configuravel (Evolution ou Uazapi).
--
-- Ate aqui as nove Edge Functions liam EVOLUTION_API_URL / EVOLUTION_INSTANCE /
-- EVOLUTION_API_KEY do ambiente, entao trocar de provedor significava mexer no
-- dashboard do Supabase e redeployar tudo. Agora a escolha e as credenciais da
-- Uazapi vivem no app_config, que ja e a tabela fechada usada pelo cron_secret:
-- RLS ligada e sem policy, sem grant para anon nem authenticated. Quem le e
-- escreve e a Edge Function whatsapp-provider-config, com service_role e
-- exigindo papel de owner.
--
-- A Evolution continua lendo os secrets de ambiente. Enquanto whatsapp_provider
-- for 'evolution' nada muda de comportamento.

insert into public.app_config (key, value) values
  ('whatsapp_provider', 'evolution')
on conflict (key) do nothing;

-- As chaves da Uazapi (uazapi_base_url, uazapi_token, uazapi_admin_token) nao
-- sao semeadas de proposito: elas nascem no primeiro cadastro pela tela de
-- Configuracoes, para que nenhum token passe pelo historico do git.
