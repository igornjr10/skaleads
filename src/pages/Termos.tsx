import { Bloco, LegalShell } from "@/components/LegalShell";

// ATENCAO: revise com quem cuida do juridico antes de divulgar.
const EMPRESA = "[RAZÃO SOCIAL]";
const EMAIL = "[email de contato]";

export default function Termos() {
  return (
    <LegalShell titulo="Termos de Uso" atualizadoEm="12 de agosto de 2026">
      <Bloco titulo="O serviço">
        <p>
          O Scale Ads, operado por {EMPRESA}, é uma plataforma de gestão de campanhas de anúncios da Meta. Ao criar uma
          conta, você concorda com estes termos.
        </p>
      </Bloco>

      <Bloco titulo="Sua conta">
        <p>
          Você é responsável pelas credenciais de acesso e por tudo que for feito através da sua conta. Avise-nos em{" "}
          {EMAIL} se suspeitar de uso indevido.
        </p>
        <p>
          Cada equipe enxerga apenas a própria carteira de clientes. Ao convidar alguém para a sua equipe, você autoriza
          essa pessoa a ver e gerenciar os clientes daquela carteira.
        </p>
      </Bloco>

      <Bloco titulo="Conexão com a Meta">
        <p>
          Para funcionar, o sistema precisa de um token de acesso às contas de anúncios que você administra. Você declara
          ter autorização dos seus clientes para conectar essas contas e consultar os dados delas.
        </p>
        <p>
          O uso da API da Meta segue as políticas da própria Meta. Mudanças, indisponibilidades ou restrições impostas
          por ela podem afetar funções do serviço, sem que isso configure descumprimento da nossa parte.
        </p>
      </Bloco>

      <Bloco titulo="Uso aceitável">
        <p>
          Não é permitido usar a plataforma para atividade ilegal, para acessar contas sem autorização do titular, para
          tentar burlar limites técnicos, nem para revender acesso sem contrato específico conosco.
        </p>
      </Bloco>

      <Bloco titulo="Disponibilidade">
        <p>
          Trabalhamos para manter o serviço no ar, mas ele é fornecido "como está". Pode haver manutenção, indisponibilidade
          de provedores externos ou falha de sincronização com a Meta. Sempre que possível, avisamos com antecedência.
        </p>
      </Bloco>

      <Bloco titulo="Dados e relatórios">
        <p>
          Os números exibidos vêm da API da Meta e refletem o que ela reporta no momento da sincronização. A Meta
          reprocessa dados de atribuição, então valores podem variar entre consultas. Decisões de investimento tomadas
          com base nos relatórios são de responsabilidade de quem as toma.
        </p>
      </Bloco>

      <Bloco titulo="Encerramento">
        <p>
          Você pode encerrar sua conta quando quiser, pelo canal {EMAIL}. Podemos suspender contas que violem estes
          termos, com aviso prévio sempre que a situação permitir.
        </p>
      </Bloco>

      <Bloco titulo="Alterações">
        <p>
          Estes termos podem mudar. Alterações relevantes serão comunicadas por e-mail ou dentro do sistema antes de
          entrarem em vigor.
        </p>
      </Bloco>

      <Bloco titulo="Foro">
        <p>
          Aplica-se a legislação brasileira. Fica eleito o foro do domicílio do contratante para dirimir controvérsias.
        </p>
      </Bloco>
    </LegalShell>
  );
}
