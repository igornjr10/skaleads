import { LegalPage, Section } from "@/components/legal/LegalPage";

export default function ExclusaoDeDados() {
  return (
    <LegalPage title="Exclusão de dados" updatedAt="16 de setembro de 2026">
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Esta página explica como apagar os dados que o Ad Campaign Hub guardou sobre você e sobre
        as contas do Facebook e do Instagram conectadas à plataforma.
      </p>

      <Section title="Opção 1 — desconectar dentro da plataforma">
        <p>
          É o caminho mais rápido e não depende de ninguém da agência:
        </p>
        <p>
          1. Entre em manager.marketprosystem.com com seu login;<br />
          2. abra a aba <strong className="text-foreground">Clientes</strong>;<br />
          3. localize o cliente e clique em <strong className="text-foreground">Desconectar Meta</strong>.
        </p>
        <p>
          A desconexão apaga imediatamente o token de acesso, o identificador da conta de anúncios,
          a Página e o perfil do Instagram vinculados, e interrompe qualquer nova coleta de dados.
        </p>
      </Section>

      <Section title="Opção 2 — remover o app pelo Facebook">
        <p>
          Você também pode cortar o acesso pelo lado da Meta, sem entrar na plataforma:
        </p>
        <p>
          1. Acesse <a href="https://www.facebook.com/settings?tab=applications" className="text-primary underline underline-offset-4" target="_blank" rel="noreferrer">Configurações do Facebook → Apps e sites</a>;<br />
          2. encontre <strong className="text-foreground">Scale Ads</strong> na lista;<br />
          3. clique em <strong className="text-foreground">Remover</strong> e confirme.
        </p>
        <p>
          Isso revoga o token na hora. Os registros já sincronizados continuam no nosso banco até você
          pedir a exclusão pela Opção 3.
        </p>
      </Section>

      <Section title="Opção 3 — pedir a exclusão completa">
        <p>
          Para apagar todo o histórico já coletado — campanhas, anúncios, métricas diárias, relatórios
          gerados e dados de cadastro —, escreva para{" "}
          <a href="mailto:contato@marketproads.com?subject=Exclusao%20de%20dados" className="text-primary underline underline-offset-4">contato@marketproads.com</a>{" "}
          com o assunto <strong className="text-foreground">Exclusão de dados</strong>, informando o nome da
          empresa e a conta de anúncios envolvida.
        </p>
        <p>
          Confirmamos o recebimento em até 2 dias úteis e concluímos a exclusão em até 30 dias, enviando
          a confirmação por e-mail quando terminar.
        </p>
      </Section>

      <Section title="O que não é apagado">
        <p>
          Registros que a legislação obriga a manter — como documentos fiscais da relação comercial —
          permanecem guardados pelo prazo legal, isolados e sem uso para qualquer outra finalidade.
          Nada disso inclui dados obtidos da Meta.
        </p>
      </Section>
    </LegalPage>
  );
}
