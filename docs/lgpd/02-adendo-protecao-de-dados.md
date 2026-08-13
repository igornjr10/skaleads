# Adendo de Proteção de Dados (DPA)

> **Este é o documento que você assina com cada cliente ou agência.** Ele dá base
> contratual para você tratar os dados da conta de anúncios deles. Sem ele, a
> operação inteira fica sem amparo do art. 39 da LGPD.
>
> **Rascunho para revisão jurídica.** Foi escrito a partir do que o sistema faz de
> fato, mas cláusula contratual precisa de advogado antes de ir para a mesa.

---

**ADENDO DE PROTEÇÃO DE DADOS PESSOAIS**

Anexo ao contrato de prestação de serviços celebrado entre:

**CONTROLADOR:** `[RAZÃO SOCIAL DO CLIENTE]`, CNPJ `[CNPJ]`, doravante CLIENTE.

**OPERADOR:** `[SUA RAZÃO SOCIAL]`, CNPJ `[SEU CNPJ]`, doravante SCALE ADS.

---

### 1. Objeto

Este adendo rege o tratamento de dados pessoais realizado pela SCALE ADS por
conta e ordem do CLIENTE, no âmbito da gestão de campanhas publicitárias na
plataforma Meta (Facebook e Instagram), nos termos da Lei 13.709/2018.

### 2. Papéis

O CLIENTE é o **controlador**: decide as finalidades e os meios do tratamento dos
dados de sua conta de anúncios. A SCALE ADS é a **operadora**: trata os dados
exclusivamente conforme as instruções do CLIENTE e este adendo.

### 3. Objeto do tratamento

**Natureza e finalidade:** coleta, armazenamento, organização e análise de dados
de desempenho publicitário, para produzir painéis, auditorias, alertas e
relatórios ao CLIENTE.

**Dados tratados:**

- credencial de acesso à conta de anúncios fornecida pelo CLIENTE;
- dados de campanhas, conjuntos, anúncios, criativos e métricas de desempenho;
- dados públicos da Página do Facebook e do perfil do Instagram vinculados;
- dados cadastrais e de contato fornecidos pelo CLIENTE.

**Não são tratados:** mensagens privadas, listas de contatos, nem dados pessoais
identificáveis de usuários que visualizaram ou interagiram com os anúncios.

**Duração:** enquanto vigente o contrato principal.

### 4. Obrigações da SCALE ADS

4.1 Tratar os dados apenas conforme as instruções documentadas do CLIENTE,
comunicando-o caso entenda que uma instrução viola a LGPD.

4.2 Manter as credenciais de acesso em ambiente segregado, sem exposição à
aplicação executada no navegador nem a outros clientes.

4.3 Garantir isolamento lógico entre clientes, de modo que nenhum tenha acesso
aos dados de outro.

4.4 Impor dever de confidencialidade a todos que tenham acesso aos dados.

4.5 Auxiliar o CLIENTE no atendimento a pedidos de titulares e a requisições da
ANPD, dentro dos prazos legais.

4.6 Comunicar ao CLIENTE, **sem demora injustificada** e em até `[PRAZO — sugestão: 48 horas]`
da ciência, qualquer incidente de segurança que possa acarretar risco aos
titulares, informando os dados atingidos, os riscos e as medidas adotadas.

4.7 Ao término do contrato, **eliminar ou devolver** os dados, à escolha do
CLIENTE, em até `[PRAZO — sugestão: 30 dias]`, ressalvada a guarda exigida por
obrigação legal.

4.8 Manter registro das operações de tratamento e disponibilizá-lo ao CLIENTE
mediante solicitação motivada.

### 5. Obrigações do CLIENTE

5.1 Declarar que possui base legal e autorização para conceder à SCALE ADS acesso
à conta de anúncios e aos dados dela decorrentes.

5.2 Fornecer instruções lícitas e responder pelas finalidades que determinar.

5.3 Manter sua própria política de privacidade compatível com o tratamento aqui
descrito.

### 6. Suboperadores

6.1 O CLIENTE autoriza a SCALE ADS a contratar suboperadores para infraestrutura,
comunicação e processamento analítico, listados no Anexo I.

6.2 A SCALE ADS responde perante o CLIENTE pelos atos de seus suboperadores.

6.3 Alterações relevantes na lista serão comunicadas com antecedência de
`[PRAZO — sugestão: 30 dias]`, cabendo ao CLIENTE opor-se de forma fundamentada.

### 7. Transferência internacional

Parte dos suboperadores está sediada fora do Brasil, conforme o Anexo I. As
transferências ocorrem com base em `[BASE — cláusulas contratuais padrão do
fornecedor / garantias contratuais equivalentes]`, nos termos do art. 33 da LGPD.

### 8. Segurança

A SCALE ADS adota, no mínimo: criptografia em trânsito, isolamento de dados por
cliente com controle no banco de dados, segregação de credenciais fora do alcance
da aplicação cliente, controle de acesso por perfil e registro de autoria das
operações sensíveis.

### 9. Auditoria

Mediante aviso prévio de `[PRAZO — sugestão: 15 dias]` e no máximo uma vez por
ano, o CLIENTE pode solicitar evidências documentais das medidas de segurança
aqui previstas.

### 10. Vigência

Este adendo acompanha a vigência do contrato principal e prevalece sobre ele em
caso de conflito quanto a proteção de dados.

---

`[CIDADE]`, `[DATA]`

_______________________________  _______________________________
CONTROLADOR (CLIENTE)             OPERADOR (SCALE ADS)

---

## Anexo I — Suboperadores

| Suboperador | Finalidade | País |
|---|---|---|
| Supabase | banco de dados, autenticação e execução de funções | EUA |
| Vercel | hospedagem da aplicação | EUA |
| Meta Platforms | origem dos dados de campanha (API Oficial) | EUA |
| Anthropic | análise assistida de criativos e auditoria | EUA |
| Groq | assistente de análise por linguagem natural | EUA |
| Resend | envio de e-mails de alerta | EUA |
| `[provedor de WhatsApp]` | envio de relatórios e cobranças | `[país]` |

## Anexo II — Instruções documentadas do controlador

O CLIENTE instrui a SCALE ADS a:

1. conectar-se à sua conta de anúncios pela API Oficial da Meta e sincronizar
   dados de campanha na periodicidade configurada;
2. executar auditorias automatizadas de configuração da conta;
3. gerar e enviar relatórios de desempenho pelos canais que indicar;
4. emitir avisos de vencimento e cobrança, quando contratado;
5. submeter métricas agregadas a provedores de inteligência artificial para
   produzir análises de apoio, vedado o envio de credenciais e de dados pessoais
   de terceiros.

Qualquer tratamento fora desta lista depende de instrução adicional por escrito.
