import { Bloco, LegalShell } from "@/components/LegalShell";

// ATENCAO: revise com quem cuida do juridico antes de divulgar. Os campos entre
// colchetes precisam dos dados reais da empresa — a Meta rejeita politica
// generica ou de terceiros na revisao do app.
const EMPRESA = "[RAZÃO SOCIAL]";
const CNPJ = "[CNPJ]";
const EMAIL = "[email de contato]";

export default function Privacidade() {
  return (
    <LegalShell titulo="Política de Privacidade" atualizadoEm="12 de agosto de 2026">
      <Bloco titulo="Quem somos">
        <p>
          O Scale Ads é uma plataforma de gestão de campanhas de anúncios da Meta (Facebook e Instagram), operada por{" "}
          {EMPRESA}, inscrita no CNPJ {CNPJ}. Esta política explica quais dados tratamos, para quê, e o que você pode
          exigir de nós.
        </p>
      </Bloco>

      <Bloco titulo="Dados que coletamos">
        <p>
          <strong className="text-foreground">Da sua conta:</strong> nome, e-mail e senha (armazenada com hash pelo
          nosso provedor de autenticação, nunca em texto puro).
        </p>
        <p>
          <strong className="text-foreground">Dos clientes que você cadastra:</strong> nome, segmento, cidade, verba
          mensal, telefone de contato e identificadores das contas de anúncios.
        </p>
        <p>
          <strong className="text-foreground">Da Meta, via API Oficial:</strong> quando você conecta uma conta de
          anúncios, buscamos campanhas, conjuntos, anúncios, criativos e métricas de desempenho (gasto, impressões,
          cliques, alcance, conversões), além de dados públicos da Página e do perfil do Instagram vinculados. Não
          acessamos mensagens privadas, lista de contatos nem dados pessoais dos usuários que viram seus anúncios.
        </p>
        <p>
          <strong className="text-foreground">Credenciais de acesso à Meta:</strong> o token de acesso fornecido por
          você é armazenado de forma isolada no servidor, sem qualquer permissão de leitura pela aplicação no navegador.
        </p>
      </Bloco>

      <Bloco titulo="Para que usamos">
        <p>
          Exclusivamente para operar o serviço: exibir painéis, sincronizar dados da Meta, auditar contas de anúncios,
          disparar alertas configurados por você e gerar relatórios. Não vendemos, alugamos nem cedemos dados a
          terceiros para publicidade.
        </p>
      </Bloco>

      <Bloco titulo="Inteligência artificial">
        <p>
          Algumas funções (assistente, resumo de período, sugestão de criativos) enviam trechos das métricas da conta
          para um provedor de modelo de linguagem, com a finalidade única de gerar aquela resposta. Não enviamos suas
          credenciais nem dados pessoais dos clientes finais nesse processo.
        </p>
      </Bloco>

      <Bloco titulo="Com quem compartilhamos">
        <p>
          Apenas com os provedores necessários para a operação: infraestrutura e banco de dados, envio de e-mails,
          envio de mensagens por WhatsApp e o provedor de IA citado acima. Cada um recebe somente o dado indispensável à
          sua função.
        </p>
      </Bloco>

      <Bloco titulo="Por quanto tempo guardamos">
        <p>
          Enquanto a sua conta existir. Ao desconectar uma conta de anúncios, a credencial correspondente é apagada
          imediatamente. Ao encerrar a conta, os dados são removidos em até 30 dias, salvo obrigação legal de retenção.
        </p>
      </Bloco>

      <Bloco titulo="Exclusão de dados">
        <p>
          Você pode pedir a exclusão total dos seus dados a qualquer momento, escrevendo para {EMAIL} com o assunto
          "Exclusão de dados" e o e-mail cadastrado. Confirmamos o atendimento em até 30 dias.
        </p>
        <p>
          Para revogar o acesso do Scale Ads à sua conta da Meta sem apagar o histórico, use as Configurações de
          integrações comerciais do Facebook. A revogação interrompe novas sincronizações na hora.
        </p>
      </Bloco>

      <Bloco titulo="Seus direitos (LGPD)">
        <p>
          Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade e exclusão dos
          seus dados, além de revogar consentimento. O canal para todos esses pedidos é {EMAIL}.
        </p>
      </Bloco>

      <Bloco titulo="Segurança">
        <p>
          Tráfego cifrado em trânsito, isolamento por equipe no banco de dados (cada carteira só é visível para quem
          pertence a ela) e credenciais da Meta fora do alcance do navegador. Nenhum sistema é infalível: se
          identificarmos incidente com risco relevante, comunicaremos os afetados e a ANPD.
        </p>
      </Bloco>

      <Bloco titulo="Contato">
        <p>
          Dúvidas sobre esta política ou sobre o tratamento dos seus dados: {EMAIL}.
        </p>
      </Bloco>
    </LegalShell>
  );
}
