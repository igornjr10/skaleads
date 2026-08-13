# Registro de Operações de Tratamento — Scale Ads

> **Documento interno.** Exigido pelo art. 37 da LGPD. É o que a ANPD pede primeiro
> numa fiscalização, e o que uma agência-cliente pede antes de assinar contrato.
>
> **Não é parecer jurídico.** Foi levantado a partir do que o sistema realmente
> faz — cada linha abaixo corresponde a código em produção. Os campos entre
> `[COLCHETES]` dependem de decisão sua e devem ser preenchidos antes de valer.

| | |
|---|---|
| Controlador | `[RAZÃO SOCIAL]`, CNPJ `[CNPJ]` |
| Encarregado (DPO) | `[NOME]` — `[E-MAIL]` |
| Última revisão | 12 de agosto de 2026 |
| Sistema | Scale Ads — gestão de campanhas Meta Ads |

---

## 1. Papéis: quando somos controlador e quando somos operador

Isto é o ponto mais importante do documento, e o que a maioria das agências erra.

**Somos CONTROLADORES** dos dados de quem usa o sistema: nome, e-mail e senha da
conta, papel na equipe, registros de acesso. A finalidade é operar o serviço, e
decidimos sozinhos sobre esses dados.

**Somos OPERADORES** dos dados das contas de anúncios: quem decide o que fazer
com elas é o anunciante (ou a agência que o representa). Nós só executamos o
tratamento em nome dele. Por isso existe o Adendo de Proteção de Dados — sem ele
assinado, esse tratamento não tem base contratual.

---

## 2. Operações de tratamento

### 2.1 Conta de usuário

| | |
|---|---|
| Dados | nome, e-mail, senha (hash), papel, equipe |
| Titulares | operadores da agência |
| Finalidade | autenticação e controle de acesso |
| Base legal | execução de contrato (art. 7º, V) |
| Retenção | enquanto a conta existir + `[PRAZO]` |
| Compartilhamento | Supabase (infraestrutura) |

### 2.2 Cadastro de cliente anunciante

| | |
|---|---|
| Dados | razão social/nome, segmento, cidade, estado, endereço, telefone de WhatsApp, verba mensal, mensalidade contratada |
| Titulares | pessoa jurídica e, quando o cliente é PF, o próprio anunciante |
| Finalidade | organizar a carteira, gerar relatório e cobrança |
| Base legal | execução de contrato (art. 7º, V) e legítimo interesse (art. 7º, IX) para a cobrança |
| Retenção | enquanto o cliente estiver na carteira + `[PRAZO]` |

### 2.3 Credencial de acesso à conta de anúncios

| | |
|---|---|
| Dados | token de acesso da API da Meta |
| Finalidade | consultar as métricas da conta em nome do cliente |
| Base legal | execução de contrato |
| Onde fica | tabela `client_secrets`, sem permissão de leitura para a aplicação no navegador nem para usuários autenticados — apenas o servidor acessa |
| Exclusão | imediata ao desconectar a conta |

### 2.4 Dados de campanha vindos da Meta

| | |
|---|---|
| Dados | campanhas, conjuntos, anúncios, criativos, métricas de gasto, impressões, cliques, alcance, frequência e conversões; dados públicos da Página e do perfil do Instagram vinculados |
| Titulares | não identificam pessoa natural — são agregados de desempenho |
| Finalidade | painéis, auditoria de conta, alertas e relatórios |
| Base legal | execução de contrato |
| Origem | API Oficial da Meta (Graph API v21.0) |
| **Não coletamos** | mensagens privadas, lista de contatos, dados pessoais de quem visualizou ou clicou nos anúncios |

### 2.5 Comunicação com o cliente final

| | |
|---|---|
| Dados | número de WhatsApp ou identificador de grupo, conteúdo das mensagens de relatório e cobrança |
| Finalidade | entrega de relatório e cobrança de mensalidade |
| Base legal | execução de contrato e legítimo interesse |
| Retenção | registro de envio mantido em `invoice_reminders` e `automation_runs` |

### 2.6 Uso de inteligência artificial

| | |
|---|---|
| Dados enviados | métricas agregadas da conta e trechos de texto dos criativos |
| Finalidade | assistente de análise, resumo de período, sugestão de copy, priorização de auditoria |
| **Não enviamos** | credenciais, dados pessoais dos clientes finais, conteúdo de mensagens |
| Decisão automatizada | **não há.** A IA produz texto de apoio; nenhuma decisão com efeito jurídico é tomada por ela (art. 20 não se aplica) |

---

## 3. Suboperadores

Levantado do código em produção, não de memória. Antes de vender para terceiros,
cada um destes precisa de contrato ou termos que assegurem nível de proteção
adequado, e os que ficam fora do Brasil exigem base para transferência
internacional (art. 33).

| Suboperador | Para quê | Dados que recebe | País |
|---|---|---|---|
| Supabase | banco de dados, autenticação e funções | todos os dados do sistema | EUA `[verificar região do projeto]` |
| Vercel | hospedagem do frontend | nenhum dado em repouso; logs de acesso | EUA |
| Meta (Graph API) | origem dos dados de campanha | token e identificadores de conta | EUA |
| Anthropic (Claude) | análise de criativos, resumo, auditoria | métricas agregadas e textos de anúncio | EUA |
| Groq | assistente de chat | métricas agregadas do contexto perguntado | EUA |
| Resend | envio de e-mail de alerta | e-mail do destinatário e conteúdo do alerta | EUA |
| Evolution API / Uazapi | envio de WhatsApp | número de destino e conteúdo da mensagem | `[verificar onde está hospedado]` |
| Manus | `[descrever a finalidade]` | `[verificar]` | `[verificar]` |

> **Ação necessária:** os três `[verificar]` acima não consegui responder pelo
> código. Sem eles, o registro fica incompleto para efeito de fiscalização.

---

## 4. Medidas de segurança em vigor

Estas são verificáveis, não declaratórias:

- **Isolamento por equipe** — Row Level Security no banco: cada equipe só enxerga a própria carteira. Vale inclusive para consultas feitas fora da aplicação.
- **Credencial fora do navegador** — o token da Meta vive em tabela sem concessão de leitura para usuários autenticados; toda chamada à Meta passa por função no servidor.
- **Segredo de automação fora do código-fonte** — as rotinas agendadas leem a credencial de uma tabela restrita, não de texto no repositório.
- **Registro de quem fez o quê** — conclusão de tarefa, baixa de fatura e envio de cobrança gravam autor e data por gatilho no banco, não por confiança no frontend.
- **Tráfego cifrado** em todas as conexões.

### Pendências conhecidas de segurança

Honestidade aqui vale mais que aparência de conformidade:

1. **Cadastro público aberto** — qualquer pessoa com o endereço cria conta. Ela entra numa equipe vazia e não alcança dado de ninguém, mas o cadastro deveria ser controlado.
2. **Retenção não automatizada** — não há rotina que apague dado após o prazo. Hoje a exclusão é manual.
3. **Sem canal automatizado do titular** — pedidos de acesso e exclusão são atendidos por e-mail, na mão.

---

## 5. Direitos do titular — como atendemos

| Direito | Como é atendido hoje |
|---|---|
| Confirmação e acesso | mediante pedido a `[E-MAIL]`, resposta em até 15 dias |
| Correção | pela própria tela de cadastro do cliente, ou mediante pedido |
| Exclusão | mediante pedido; remoção em até 30 dias, ressalvada guarda legal |
| Portabilidade | exportação dos relatórios em PDF; demais dados sob pedido |
| Revogação de acesso à Meta | pelo próprio Facebook, em Configurações de integrações comerciais — interrompe a sincronização na hora |

---

## 6. Incidentes

Em caso de incidente com risco relevante aos titulares: comunicar a ANPD e os
afetados em prazo razoável, descrevendo os dados atingidos, os riscos e as
medidas tomadas. Responsável pela comunicação: o encarregado indicado no topo.

Registro de incidentes: `[onde será mantido]`.
