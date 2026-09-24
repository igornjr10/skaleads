import { LegalPage, Section } from "@/components/legal/LegalPage";

export default function Termos() {
  return (
    <LegalPage title="Termos de Uso" updatedAt="16 de setembro de 2026">
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Estes termos regem o uso do Ad Campaign Hub, plataforma de gestão de tráfego pago operada pela
        Scale Ads (CNPJ [PREENCHER]) em manager.marketprosystem.com.
      </p>

      <Section title="1. Do que se trata">
        O Ad Campaign Hub centraliza o acompanhamento de campanhas de anúncios da Meta: sincroniza os
        dados da conta, gera relatórios e auditorias, dispara alertas de desempenho e organiza a rotina
        de produção da agência. O acesso é concedido pela Scale Ads a colaboradores e a clientes
        contratantes — não há cadastro aberto.
      </Section>

      <Section title="2. Conta e responsabilidade">
        <p>
          Cada usuário é responsável por manter as credenciais em sigilo e por tudo que for feito com o
          login dele. Avise imediatamente em contato@marketproads.com se suspeitar de acesso indevido.
        </p>
        <p>
          Ao conectar uma conta de anúncios, você declara ter autorização do titular dessa conta para
          compartilhar os dados com a plataforma.
        </p>
      </Section>

      <Section title="3. Uso aceitável">
        <p>Ao usar a plataforma, você concorda em não:</p>
        <p>
          • acessar contas de anúncio sem autorização do titular;<br />
          • extrair dados em massa para uso fora da finalidade contratada;<br />
          • tentar contornar os controles de acesso ou as políticas de segurança do banco;<br />
          • usar a plataforma para violar as políticas de publicidade ou os termos da Meta.
        </p>
      </Section>

      <Section title="4. Dados e privacidade">
        O tratamento de dados pessoais está descrito na{" "}
        <a href="/privacidade" className="text-primary underline underline-offset-4">Política de Privacidade</a>,
        que é parte integrante destes termos. As instruções para apagar seus dados estão em{" "}
        <a href="/exclusao-de-dados" className="text-primary underline underline-offset-4">Exclusão de dados</a>.
      </Section>

      <Section title="5. Dados de terceiros">
        Os números exibidos vêm da Graph API da Meta e refletem o que a plataforma de anúncios reporta.
        Divergências, atrasos de atualização ou indisponibilidade da API da Meta estão fora do nosso
        controle. A plataforma é uma ferramenta de apoio à decisão e não garante resultado de campanha.
      </Section>

      <Section title="6. Disponibilidade e alterações">
        Fazemos o possível para manter o serviço no ar, mas ele pode ficar indisponível para manutenção
        ou por falha de fornecedores. Podemos alterar ou descontinuar funcionalidades, avisando os
        usuários ativos com antecedência razoável quando a mudança for relevante.
      </Section>

      <Section title="7. Encerramento">
        O acesso pode ser encerrado por qualquer das partes, a qualquer momento. Encerrado o acesso,
        os dados são tratados conforme a seção de retenção da Política de Privacidade.
      </Section>

      <Section title="8. Foro e contato">
        Estes termos são regidos pela lei brasileira. Dúvidas e notificações: contato@marketproads.com.
      </Section>
    </LegalPage>
  );
}
