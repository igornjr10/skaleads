-- Deixa cada cron escolher seu prazo.
--
-- O pg_net corta em 5 segundos por padrao. Para os jobs curtos isso nunca
-- incomodou, mas a coleta do Instagram faz ate 3 chamadas a Meta por cliente e
-- leva ~18s por lote: no prazo padrao a chamada e cortada no meio e a coleta
-- passa a depender de a function sobreviver ao cliente desconectar.
--
-- O padrao continua 5000, entao os cinco crons que ja chamavam com um argumento
-- so continuam se comportando exatamente igual.
drop function if exists public.dispatch_cron_job(text);

create function public.dispatch_cron_job(_function_name text, _timeout_ms integer default 5000)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  base_url text;
  anon_key text;
  secret   text;
  req_id   bigint;
begin
  select value into base_url from public.app_config where key = 'functions_base_url';
  select value into anon_key from public.app_config where key = 'cron_anon_key';
  select value into secret   from public.app_config where key = 'cron_secret';

  if base_url is null or anon_key is null or secret is null then
    raise exception 'app_config incompleto: precisa de functions_base_url, cron_anon_key e cron_secret';
  end if;

  -- A anon key satisfaz o gateway de Edge Functions (que exige JWT valido);
  -- a autorizacao de verdade e o x-cron-secret, checado dentro da function.
  select net.http_post(
    url     := base_url || '/' || _function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'x-cron-secret', secret
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := _timeout_ms
  ) into req_id;

  return req_id;
end;
$function$;

select cron.unschedule('sync-instagram-daily-hourly');
select cron.schedule(
  'sync-instagram-daily-hourly',
  '20 * * * *',
  $$select public.dispatch_cron_job('sync-instagram-daily', 120000);$$
);
