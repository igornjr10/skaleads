# Conformidade LGPD — o que existe e o que falta

Três peças. Duas estão prontas para revisão, uma já está publicada no ar.

| Documento | Para quem | Estado |
|---|---|---|
| [Registro de Operações](01-registro-de-tratamento.md) | interno / ANPD / due diligence de cliente | rascunho com campos a preencher |
| [Adendo de Proteção de Dados](02-adendo-protecao-de-dados.md) | assinar com cada cliente ou agência | rascunho para revisão jurídica |
| Política de Privacidade | público | publicada em `/privacidade`, com campos a preencher |
| Termos de Uso | público | publicado em `/termos`, com campos a preencher |

---

## O que só você pode preencher

Aparecem como `[COLCHETES]` nos documentos. Sem isso nenhum deles vale:

1. **Razão social, CNPJ e endereço**
2. **Encarregado de dados (DPO)** — nome e e-mail públicos. A LGPD exige indicação, e pode ser você mesmo.
3. **E-mail do canal do titular** — pode ser o mesmo do DPO
4. **Prazos de retenção** — quanto tempo guardar dado de cliente encerrado. Sugestão comum: 5 anos para o que tem efeito fiscal, o mínimo necessário para o resto.
5. **Onde está hospedado o provedor de WhatsApp** (Evolution/Uazapi) e **o que o Manus faz** — não consegui responder pelo código, e os dois aparecem no registro como suboperadores.

## O que só um advogado deve decidir

- se o adendo cobre o seu modelo de contrato
- a base de transferência internacional (todos os seus suboperadores relevantes estão nos EUA)
- prazos contratuais de notificação de incidente e de auditoria

Eu escrevi como rascunho sério, com o que o sistema faz de verdade. Não é parecer.

## As três pendências técnicas que atrapalham a conformidade

Estas eu levantei do próprio sistema, e nenhuma é resolvida por documento:

**1. Cadastro público aberto.** Qualquer pessoa com o endereço cria conta. Ela cai numa equipe vazia e não alcança dado de ninguém, mas o controle de acesso deveria começar antes disso. Solução: desligar em Authentication → Providers → Email.

**2. Retenção não automatizada.** Você declara prazo de guarda no documento, mas nada apaga sozinho. Enquanto for manual, o documento promete o que o sistema não cumpre — e isso é pior que não prometer. Posso construir uma rotina de expurgo quando você definir os prazos.

**3. Sem canal automatizado do titular.** Pedido de acesso ou exclusão hoje é atendido por e-mail, na mão. Aceitável no começo; vira problema com volume.

## Ordem sugerida

1. Preencher os colchetes dos quatro documentos
2. Fechar o cadastro público (5 minutos, resolve a pendência mais visível)
3. Levar o adendo ao advogado junto com o contrato principal
4. Publicar a política e os termos com os dados reais
5. Definir prazos de retenção — aí eu automatizo o expurgo
