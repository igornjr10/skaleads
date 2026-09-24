import { LegalPage, Section } from "@/components/legal/LegalPage";

export default function Privacidade() {
  return (
    <LegalPage title="Política de Privacidade" updatedAt="16 de setembro de 2026">
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Esta política descreve como a Scale Ads trata os dados usados no Ad Campaign Hub,
        a plataforma interna de gestão de tráfego pago disponível em manager.marketprosystem.com.
        O responsável pelo tratamento é a Scale Ads (CNPJ [PREENCHER]), que pode ser
        contatada em contato@marketproads.com.
      </p>

      <Section title="1. Quem usa a plataforma">
        O Ad Campaign Hub é usado pela equipe da Scale Ads e pelos clientes da agência que
        autorizam o acompanhamento das próprias contas de anúncio. Não há cadastro aberto ao
        público: todo acesso é criado e controlado pela agência.
      </Section>

      <Section title="2. Dados que coletamos">
        <p><strong className="text-foreground">Dados de conta:</strong> nome, e-mail e perfil de acesso de cada usuário da plataforma.</p>
        <p>
          <strong className="text-foreground">Dados da Meta:</strong> quando você conecta uma conta do Facebook,
          armazenamos o token de acesso gerado pela Meta e os dados que ele autoriza — identificador e nome
          da conta de anúncios, da Página do Facebook e do perfil do Instagram vinculado, além de campanhas,
          conjuntos de anúncios, anúncios, criativos, públicos e métricas diárias de desempenho
          (impressões, cliques, investimento, conversões e resultados equivalentes).
        </p>
        <p>
          <strong className="text-foreground">Dados operacionais:</strong> informações cadastrais dos clientes
          da agência, verbas, tarefas, anotações e o número de WhatsApp usado para receber relatórios e alertas.
        </p>
        <p>
          Não coletamos dados de pessoas que visualizaram ou interagiram com os anúncios. Nenhuma informação
          pessoal do público das campanhas é lida, armazenada ou processada pela plataforma.
        </p>
      </Section>

      <Section title="3. Para que usamos">
        <p>Os dados obtidos da Meta são usados exclusivamente para:</p>
        <p>
          • exibir o desempenho das campanhas em painéis e relatórios para o cliente dono da conta;<br />
          • gerar auditorias e recomendações de otimização sobre a própria conta;<br />
          • disparar alertas de desempenho para o gestor responsável pela conta;<br />
          • enviar o relatório periódico ao cliente por WhatsApp ou link de dashboard.
        </p>
        <p>
          Não vendemos, alugamos nem cedemos dados da Meta a terceiros, e não os usamos para
          publicidade própria, enriquecimento de base, criação de públicos fora da conta de origem
          ou qualquer finalidade alheia à gestão contratada.
        </p>
      </Section>

      <Section title="4. Permissões da Meta que solicitamos">
        <p>
          <strong className="text-foreground">ads_read</strong> — ler campanhas, anúncios e métricas da conta
          para montar relatórios, painéis e auditorias.
        </p>
        <p>
          <strong className="text-foreground">ads_management</strong> — ler a estrutura completa da conta e aplicar,
          quando o cliente autoriza, as otimizações acordadas.
        </p>
        <p>
          <strong className="text-foreground">business_management</strong> — localizar as contas de anúncio e ativos
          aos quais o usuário tem acesso no Gerenciador de Negócios.
        </p>
        <p>
          <strong className="text-foreground">pages_show_list</strong> e <strong className="text-foreground">pages_read_engagement</strong> —
          identificar a Página vinculada à conta e ler suas métricas de alcance e engajamento.
        </p>
        <p>
          <strong className="text-foreground">instagram_basic</strong> e <strong className="text-foreground">instagram_manage_insights</strong> —
          identificar o perfil do Instagram vinculado e ler seus insights para o relatório.
        </p>
      </Section>

      <Section title="5. Onde os dados ficam e como são protegidos">
        <p>
          Os dados ficam em um banco PostgreSQL gerenciado pelo Supabase, com criptografia em trânsito (HTTPS)
          e em repouso. O acesso é restrito por autenticação e por políticas de segurança em nível de linha
          (RLS), de modo que cada usuário só enxerga os clientes da própria empresa.
        </p>
        <p>
          O token da Meta é guardado apenas para manter a sincronização automática funcionando e nunca é
          exibido, compartilhado ou exportado.
        </p>
      </Section>

      <Section title="6. Compartilhamento com terceiros">
        <p>Usamos os seguintes operadores, todos limitados ao necessário para a plataforma funcionar:</p>
        <p>
          • <strong className="text-foreground">Supabase</strong> — banco de dados, autenticação e funções de servidor;<br />
          • <strong className="text-foreground">Vercel</strong> — hospedagem da aplicação;<br />
          • <strong className="text-foreground">Anthropic (Claude)</strong> — geração de análises em texto a partir de métricas agregadas;<br />
          • <strong className="text-foreground">uazapi</strong> — envio dos relatórios e alertas por WhatsApp.
        </p>
        <p>
          Nenhum desses operadores recebe o token de acesso da Meta, e nenhum é autorizado a usar os dados
          para finalidade própria.
        </p>
      </Section>

      <Section title="7. Por quanto tempo guardamos">
        <p>
          Métricas e histórico de campanhas ficam guardados enquanto durar a relação comercial, porque o
          valor do relatório está justamente na comparação com períodos anteriores. Encerrado o contrato,
          os dados da conta são apagados em até 30 dias, salvo o que a lei exigir manter.
        </p>
        <p>
          A desconexão da conta Meta apaga o token imediatamente e interrompe qualquer nova coleta.
        </p>
      </Section>

      <Section title="8. Seus direitos">
        <p>
          Conforme a LGPD (Lei 13.709/2018), você pode pedir confirmação de tratamento, acesso, correção,
          portabilidade, anonimização ou exclusão dos seus dados, além de revogar o consentimento a
          qualquer momento. Basta escrever para contato@marketproads.com — respondemos em até 15 dias.
        </p>
        <p>
          Para apagar especificamente os dados vindos do Facebook e do Instagram, veja as instruções em{" "}
          <a href="/exclusao-de-dados" className="text-primary underline underline-offset-4">Exclusão de dados</a>.
        </p>
      </Section>

      <Section title="9. Mudanças nesta política">
        Se esta política mudar, a data de atualização no topo da página muda junto, e avisamos os usuários
        ativos por e-mail antes de a alteração passar a valer.
      </Section>
    </LegalPage>
  );
}
