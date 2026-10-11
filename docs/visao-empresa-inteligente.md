# Visão da Empresa inteligente

A rota `/agencia` passa a mostrar as demandas da mesma fonte da Central de Demandas. O pipeline de rotinas permanece separado, pois suas ocorrências têm identidade e regras próprias.

## Comportamento

- Demandas paginadas, deduplicadas por ID e atualizadas por Realtime, ao retornar à janela e a cada 30 segundos.
- Cliente, responsável, data e horário limite visíveis; abertura do detalhe original e filtros por setor, pessoa e status.
- Pendências, atrasos, entregas na semana (segunda a domingo), vencimentos em dois dias, reuniões, carga de trabalho e clientes em atenção.
- Recomendações explicam problema, impacto e ação: criativos atrasados, falta de responsável, demanda parada, onboarding incompleto, impedimentos explicitamente registrados e indicadores de campanha já avaliados pelo sistema.
- Alertas, ideias, problemas e avisos compartilhados com a empresa. Autor ou gestão podem resolver/reabrir.
- Central de Automações: ativação, horário, limites, antecedência, gestores destinatários, autorização de WhatsApp e histórico.
- Entrada de clientes: configuração de propostas de responsáveis/prazos por etapa e aprovação ou recusa da gestão. Aprovação sincroniza a mesma demanda e checklist do onboarding existente.

A análise operacional usa regras verificáveis, sem chamada adicional de LLM e sem afirmar que um impedimento existe apenas pela ausência de movimentação.

## Recursos reaproveitados

| Processo | Fonte existente | Integração |
| --- | --- | --- |
| Demandas e detalhes | `tasks`, `task_events`, `DemandaDetalhe` | Uma fonte compartilhada, respeitando RLS |
| Rotinas recorrentes | `rotinas`, `rotina_execucoes`, cron existente | Dias e ativação continuam na Rotina; não gera cópias em `tasks` |
| Entrada de clientes | `client_tasks`, `client_fase_responsaveis` | Checklist existente; defaults geram propostas para aprovação |
| Reuniões | Demandas com categoria `reuniao` | Lembretes e cadastro de tarefas do alinhamento pela gestão |
| Metas de campanhas | `montarVisaoAgencia`, alertas/cron existentes | Exibe os desvios e direciona para as regras existentes |
| Notificações | `notifications` | Avisos no sino do sistema |
| WhatsApp | UAZAPI, `user_companies.whatsapp`, dispatch existente | Envio somente com regra ativa e autorização de canal |

Reuniões registradas apenas como compromisso de ciclo em `client_compromissos` não têm data/hora de agendamento. Os lembretes exigem uma demanda de reunião com prazo. A função não extrai tarefas de áudio ou ata; a equipe registra os encaminhamentos pelo botão de tarefa do alinhamento.

## Instalação

1. Aplicar `supabase/migrations/20261011000000_operacao_inteligente.sql` no projeto Supabase utilizado pelo ambiente. Usar a ferramenta de migrations ou executar o arquivo completo em transação no SQL Editor; o arquivo é uma migration única.
2. Publicar `supabase/functions/operacao-whatsapp/index.ts`, incluindo os módulos `_shared` já existentes. Configuração: `verify_jwt = false`; o handler exige service role ou `x-cron-secret` válido.
3. Confirmar os secrets existentes `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SVC_ROLE_KEY`, a integração UAZAPI e `PUBLIC_SITE_URL`. Não copiar secrets para o frontend.
4. Confirmar `app_config`: `functions_base_url`, `cron_anon_key`, `cron_secret`, já usados por `dispatch_cron_job`.
5. Publicar o frontend após a migration. Sem a migration, a Central mostra erro de instalação e não anuncia sucesso.
6. Em Visão da Empresa → Central de Automações, salvar as regras desejadas. Novas regras começam desativadas, WhatsApp desautorizado e templates de entrada inativos.

O cron operacional roda a cada cinco minutos. Os horários são de Brasília (UTC−3). O aviso de duas horas exige data **e horário limite**; sem horário ele não é enviado. Avisos de atraso usam a data de entrega, mantendo a regra existente: vencimento no dia atual ainda está dentro do prazo.

## Controles e rastreabilidade

RLS isola configurações, avisos e execuções por empresa. Somente ADM/owner salva regras e decide propostas; destinatários adicionais precisam ser gestores da mesma empresa. A leitura de demandas continua seguindo as permissões existentes.

A chave `(empresa, tipo, ocorrência, destinatário)` impede avisos repetidos. A gravação do histórico e a notificação são atômicas. A fila WhatsApp é reclamada com `FOR UPDATE SKIP LOCKED`; falhas são registradas sem repetição automática quando o resultado do envio pode ser incerto. Desativar a regra/canal cancela itens pendentes na próxima execução. O histórico mostra os últimos 50 avisos; as aprovações são carregadas com paginação, incluindo todas as pendentes.

Não existem automações novas que alterem campanhas ou valores. Essas ações permanecem nas telas de origem sob decisão da gestão. Defaults de onboarding que atribuem responsáveis ou prazos exigem aprovação explícita para cada etapa. Ações e histórico de notificações permanecem consultáveis.

## Validação

- `npm run build`
- `npm test`
- `npm run test:operacao:sql`
- ESLint dos módulos alterados

O teste SQL utiliza PostgreSQL embarcado (PGlite), com fixtures das dependências existentes e stub de agendamento. Verifica compilação, execução, deduplicação, reclamação de fila, RLS, bloqueio de destinatários de outra empresa, lembrete de duas horas e aprovação de onboarding. Não chama UAZAPI nem valida secrets, pg_cron ou permissões do ambiente de produção.

O projeto já possui erros de TypeScript fora deste escopo. A saída de `tsc --noEmit -p tsconfig.app.json` foi comparada com o commit base para distinguir regressões.

## Oportunidades adicionais identificadas

- Usar impedimentos registrados para lembretes de cobrança ao cliente, com confirmação do gestor e canal autorizado.
- Unificar data/hora de agendamento entre demandas de reunião, compromissos de ciclo e calendário antes de automatizar lembretes nesses três módulos.
- Adicionar capacidade individual da equipe (horas/esforço), pois quantidade de tarefas sozinha não mede complexidade.
- Conectar metas operacionais de prazo e tempo de ciclo após um período de dados consistentes.
- Implementar ingestão de ata com propostas revisáveis de tarefas, preservando aprovação de responsáveis e prazos.

Os testes de interação do painel verificam abertura dos detalhes, filtros de concluídas e tratamento de erro. A validação visual com Chromium não pôde ser executada: o runtime não disponibilizou o navegador e o download devolveu um arquivo inválido. Validar o layout em desktop e celular no ambiente de preview.
