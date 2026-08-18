import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  CalendarCheck,
  Check,
  ClipboardList,
  FileText,
  Image as ImageIcon,
  Link2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScaleAdsLogo } from "@/components/ScaleAdsLogo";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { useAuth } from "@/hooks/useAuth";

// Destino do CTA primario: Calendly, Cal.com ou link direto de WhatsApp.
// Vazio faz o botao cair no cadastro — melhor que apontar para lugar nenhum.
const LINK_DEMONSTRACAO = "";

// Vazio esconde a secao de planos inteira. Oferta inventada derruba a conversao
// no momento em que o lead confere.
const PRECO_ENTRADA = "R$ 147/mês";
const GARANTIA =
  "7 dias. Se não fizer sentido para a sua operação, você cancela e recebe de volta — sem burocracia.";

// Imagens reais do produto (arquivos em /public). Vazio mostra um bloco dizendo
// o que falta, em vez de um <img> quebrado.
const IMAGEM_AUDITORIA = "";
const IMAGEM_MOTOR = "";

// Rodape institucional: em venda B2B a ausencia disso pesa na avaliacao do
// comprador economico. Vazio simplesmente nao renderiza.
const RAZAO_SOCIAL = "";
const CNPJ = "";

const FALAS = [
  "Descobrir no fechamento que o pixel parou de disparar há doze dias — e que você gastou verba do cliente otimizando para um evento que não chegava.",
  "É dia 1º e você tem sete relatórios pra montar.",
  "É o cliente perguntando “e aí, como foi ontem?” e você tendo que parar tudo pra abrir o Gerenciador.",
];

const TENTATIVAS = [
  {
    titulo: "Planilha",
    texto:
      "Funciona até o quinto cliente. Depois disso você vira operador de planilha, e ela está desatualizada no exato momento em que o cliente pergunta.",
  },
  {
    titulo: "Dashboard (Looker Studio e afins)",
    texto:
      "Conecta e mostra os números. Mas dashboard não avisa de nada: ele espera você lembrar de olhar. E ninguém lembra de abrir sete contas todo dia.",
  },
  {
    titulo: "Estagiário ou mais gente",
    texto: "O custo volta, e o erro humano entra junto.",
  },
];

const MOTOR = [
  {
    icon: RefreshCw,
    etapa: "Sincroniza",
    texto:
      "O sistema entra na sua conta pela API oficial da Meta e mantém os dados atualizados sozinho, sem você exportar nada.",
  },
  {
    icon: ShieldCheck,
    etapa: "Audita",
    texto:
      "Roda mais de 25 verificações técnicas reais — pixel, estrutura de campanha, criativo, orçamento, qualidade da conta — e devolve uma nota de 0 a 100 com o que fazer em cada item, não só o número.",
  },
  {
    icon: Bell,
    etapa: "Avisa",
    texto:
      "Só te procura quando alguma condição sai do esperado. Sem alerta, sem interrupção — você trabalha em paz.",
  },
  {
    icon: FileText,
    etapa: "Reporta",
    texto:
      "No fechamento, o relatório em PDF com a marca da sua agência já está pronto, e cada cliente tem um link ao vivo pra se servir sozinho.",
  },
];

const DESTRAVA = [
  {
    icon: FileText,
    titulo: "Relatório pronto no fechamento, não montado na correria",
    texto:
      "O PDF com a marca da sua agência sai direto do dado já sincronizado. Acabou o dia 1º inteiro copiando número de conta em conta.",
  },
  {
    icon: Link2,
    titulo: "Cliente se serve sozinho, sem te interromper",
    texto:
      "Link público, com dados ao vivo, sem login. Quando ele quiser saber “como foi ontem”, ele mesmo confere — e você pode vender isso como diferencial de atendimento da sua agência.",
  },
  {
    icon: WhatsAppIcon,
    titulo: "Alerta no canal que você realmente olha",
    texto:
      "Aviso direto no WhatsApp quando algo sai do esperado — não um e-mail que fica quinze dias sem abrir.",
  },
  {
    icon: ClipboardList,
    titulo: "Onboarding de cliente novo sem pular etapa",
    texto:
      "Checklist guiado — acesso, rastreamento, estratégia, operação — pra você não subir verba de cliente novo antes do pixel estar validado. É na entrada que um erro de setup custa mais caro, porque é quando ele ainda está decidindo se confia em você.",
  },
];

const NAO_SUBSTITUI = [
  {
    titulo: "Não tem migração",
    texto:
      "Suas campanhas continuam onde estão, no Gerenciador da Meta. O Scale Ads lê pela API oficial — não substitui, não move nada.",
  },
  {
    titulo: "Sua equipe não aprende ferramenta nova",
    texto:
      "Quem faz o trabalho é o sistema. A equipe só olha o que ele já produziu: auditoria rodada, alerta disparado, relatório pronto.",
  },
  {
    titulo: "Funciona com Business Manager de terceiros",
    texto:
      "É o caso de uso mais comum do produto: gerenciar conta de cliente via acesso de parceiro, não conta própria.",
  },
];

const PARA_QUEM = [
  "Administra uma carteira de 5 ou mais contas de anúncio da Meta em nome de terceiros — não é pra quem roda só a própria conta.",
  "Sente que crescer a carteira significa trabalhar mais horas, não ganhar mais margem por hora.",
  "Já foi pego de surpresa descobrindo um problema técnico (pixel, evento, orçamento) só no fechamento, quando a verba já tinha ido embora.",
  "Passa parte do mês montando relatório manualmente ou sendo interrompido pra dizer “como foi ontem” pro cliente.",
];

const INCLUSO = [
  "Auditoria completa (25+ verificações) em todas as contas conectadas",
  "Alertas automáticos por WhatsApp e e-mail",
  "Relatório em PDF com a marca da sua agência",
  "Link ao vivo por cliente",
  "Onboarding guiado de cliente novo",
];

const FAQ = [
  {
    p: "Vou ter que migrar minhas campanhas?",
    r: "Não. O Scale Ads lê suas contas pela API oficial da Meta — as campanhas continuam exatamente onde estão, no Gerenciador. Não existe processo de migração.",
  },
  {
    p: "É seguro dar acesso às contas dos meus clientes?",
    r: "Sim. O token de acesso fica numa camada isolada, sem exposição direta, e cada equipe só enxerga a própria carteira. Detalhamos a arquitetura na demonstração.",
  },
  {
    p: "Minha equipe vai ter que aprender uma ferramenta nova?",
    r: "O sistema roda sozinho — sincroniza, audita, avisa e monta o relatório. Sua equipe consome o resultado, não precisa operar o motor.",
  },
  {
    p: "Funciona com Business Manager de terceiros?",
    r: "Sim — é o cenário mais comum entre quem usa o Scale Ads: gerenciar contas de cliente via acesso de parceiro.",
  },
  {
    p: "E se eu tiver poucos clientes, menos de 5?",
    r: "Aí talvez não seja o momento certo pra você ainda. Prefiro que volte quando fizer sentido do que assine e cancele no segundo mês.",
  },
  {
    p: "Como funciona a cobrança?",
    r: "Mensal, sem fidelidade. O valor escala com o tamanho da carteira conectada. Valores para carteiras grandes são combinados na demonstração.",
  },
  {
    p: "Tem suporte em português?",
    r: "Sim.",
  },
];

function Secao({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`mx-auto w-full max-w-6xl px-5 md:px-8 ${className}`}>{children}</section>;
}

function Midia({ src, titulo, nota }: { src: string; titulo: string; nota: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt={titulo}
        className="w-full rounded-2xl border border-white/[0.08] shadow-card"
        loading="lazy"
      />
    );
  }
  return (
    <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/[0.12] bg-card/40 p-6 text-center">
      <ImageIcon className="h-8 w-8 text-emerald-400/50" />
      <p className="text-sm font-semibold">{titulo}</p>
      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{nota}</p>
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();

  // A landing continua acessivel com sessao aberta — o que muda e o destino dos
  // botoes. Redirecionar quem esta logado impediria ate de revisar a pagina.
  const destinoCadastro = user ? "/dashboard" : "/auth";
  const rotuloSecundario = user ? "Ir para o painel" : "Rodar auditoria numa conta";

  function CtaDemo({ className = "" }: { className?: string }) {
    const classes = `h-12 rounded-xl px-7 text-[15px] font-bold shadow-glow ${className}`;
    return LINK_DEMONSTRACAO ? (
      <Button asChild size="lg" className={classes}>
        <a href={LINK_DEMONSTRACAO} target="_blank" rel="noreferrer">
          Agendar demonstração
          <CalendarCheck className="ml-2 h-4 w-4" />
        </a>
      </Button>
    ) : (
      <Button asChild size="lg" className={classes}>
        <Link to={destinoCadastro}>
          Agendar demonstração
          <CalendarCheck className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    );
  }

  function CtaAuditoria({ className = "" }: { className?: string }) {
    return (
      <Button
        asChild
        size="lg"
        variant="outline"
        className={`h-12 rounded-xl px-7 text-[15px] font-semibold ${className}`}
      >
        <Link to={destinoCadastro}>{rotuloSecundario}</Link>
      </Button>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-gradient-glow" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "linear-gradient(to bottom, black, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
        }}
      />

      {/* ── Topo ──────────────────────────────────────────────────────────── */}
      <header className="relative z-10">
        <Secao className="flex items-center justify-between py-5">
          <div className="flex items-center gap-2.5">
            <ScaleAdsLogo size={34} className="rounded-xl" />
            <span className="text-[17px] font-extrabold tracking-tight">
              Scale <span className="text-emerald-400">Ads</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <Button asChild className="rounded-xl font-semibold">
                <Link to="/dashboard">Ir para o painel</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" className="text-muted-foreground hover:text-foreground">
                  <Link to="/auth">Entrar</Link>
                </Button>
                <Button asChild className="rounded-xl font-semibold">
                  <Link to="/auth">Criar conta</Link>
                </Button>
              </>
            )}
          </div>
        </Secao>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <Secao className="relative z-10 pb-14 pt-12 md:pb-20 md:pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-semibold tracking-wide text-emerald-400">
                Para agências e gestores com 5 contas ou mais
              </span>
            </div>

            <h1 className="mt-6 text-balance text-[32px] font-extrabold leading-[1.1] tracking-tight md:text-[50px]">
              Atenda o dobro de clientes sem contratar mais ninguém
              <span className="text-emerald-400"> — e sem migrar uma única campanha.</span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              O Scale Ads sincroniza, audita, avisa e reporta por cima da sua carteira inteira — para você parar de ser
              a última pessoa a saber que algo quebrou na conta de um cliente.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <CtaDemo />
              <CtaAuditoria />
            </div>

            <p className="mt-4 text-xs text-muted-foreground/70">
              Sem cartão de crédito. Suas campanhas continuam onde estão.
              {GARANTIA ? " 7 dias de garantia." : ""}
            </p>
          </div>

          <Midia
            src={IMAGEM_AUDITORIA}
            titulo="Print da tela de auditoria"
            nota="Coloque aqui a captura da auditoria com a nota de 0 a 100 e os achados — é o elemento visual mais forte do produto hoje. Preencha IMAGEM_AUDITORIA no topo de Landing.tsx."
          />
        </div>
      </Secao>

      {/* ── Transparencia: ocupa o lugar da prova social que ainda nao existe ─ */}
      <Secao className="relative z-10 py-10 md:py-14">
        <div className="rounded-3xl border border-white/[0.06] bg-card/50 p-7 shadow-card backdrop-blur-sm md:p-10">
          <h2 className="text-balance text-[20px] font-bold tracking-tight md:text-[26px]">
            Sendo direto: o Scale Ads é novo. Ainda não temos case pra te mostrar.
          </h2>
          <p className="mt-4 max-w-3xl text-[14px] leading-relaxed text-muted-foreground md:text-[15px]">
            O que você vai ver na demonstração não é um vídeo institucional — é a auditoria rodando numa conta real,{" "}
            <span className="text-foreground">a sua se você quiser</span>, com o resultado na tela. Preferimos te
            mostrar o motor funcionando a te prometer algo que não podemos provar ainda.
          </p>
        </div>
      </Secao>

      {/* ── O problema ────────────────────────────────────────────────────── */}
      <Secao className="relative z-10 py-14 md:py-20">
        <h2 className="max-w-3xl text-balance text-[26px] font-bold leading-tight tracking-tight md:text-[34px]">
          O gargalo da sua agência não é vender mais — é aguentar operacionalmente o que você já vendeu.
        </h2>
        <p className="mt-4 text-sm text-muted-foreground md:text-base">Você reconhece isso:</p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {FALAS.map((fala) => (
            <blockquote
              key={fala}
              className="rounded-2xl border border-white/[0.06] border-l-2 border-l-emerald-500/50 bg-card/60 p-5 shadow-card backdrop-blur-sm"
            >
              <p className="text-[14px] leading-relaxed text-muted-foreground">{fala}</p>
            </blockquote>
          ))}
        </div>

        <p className="mt-8 max-w-3xl text-[15px] leading-relaxed text-muted-foreground md:text-base">
          E o custo disso não é só tempo:{" "}
          <span className="font-semibold text-foreground">
            cada cliente novo que você fecha custa a mesma hora que o primeiro custou
          </span>
          . Por isso a margem não sobe com o tamanho da carteira — você vende mais, trabalha mais, e o resultado por
          hora fica igual.
        </p>
      </Secao>

      {/* ── Por que o que ja tentaram nao resolveu ─────────────────────────── */}
      <Secao className="relative z-10 py-14 md:py-20">
        <div className="rounded-3xl border border-white/[0.06] bg-card/50 p-7 shadow-card backdrop-blur-sm md:p-12">
          <h2 className="text-balance text-[24px] font-bold tracking-tight md:text-[32px]">
            Por que o que você já tentou não resolveu
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
            Você provavelmente já tentou pelo menos uma dessas três saídas — e todas falham pelo mesmo motivo
            estrutural.
          </p>

          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {TENTATIVAS.map(({ titulo, texto }) => (
              <div key={titulo} className="rounded-2xl border border-white/[0.06] bg-background/40 p-5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400">
                  <X className="h-4 w-4" />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{titulo}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{texto}</p>
              </div>
            ))}
          </div>

          <p className="mt-8 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
            O ponto em comum: todas dependem de alguém lembrar de olhar. O Scale Ads inverte isso —{" "}
            <span className="font-semibold text-foreground">quem olha é o sistema</span>, e ele só te chama quando tem
            algo que exige decisão sua.
          </p>
        </div>
      </Secao>

      {/* ── Motor: a numeracao e sequencia real, nao enfeite ───────────────── */}
      <Secao className="relative z-10 py-14 md:py-20">
        <div id="como-funciona" className="scroll-mt-24">
          <h2 className="text-[26px] font-bold tracking-tight md:text-[34px]">O motor de 4 etapas</h2>

          <div className="mt-10 space-y-3">
            {MOTOR.map(({ icon: Icon, etapa, texto }, i) => (
              <div
                key={etapa}
                className="flex gap-4 rounded-2xl border border-white/[0.06] bg-card/60 p-5 shadow-card backdrop-blur-sm md:gap-5 md:p-6"
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  {i < MOTOR.length - 1 && (
                    <div className="h-full w-px bg-gradient-to-b from-emerald-500/30 to-transparent" />
                  )}
                </div>
                <div>
                  <h3 className="text-[16px] font-bold tracking-tight">
                    <span className="tabular-nums text-emerald-400">{String(i + 1).padStart(2, "0")}</span> {etapa}
                  </h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{texto}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 text-[15px] font-semibold italic text-foreground/90">
            Em vez de você olhar as contas, o sistema olha — e só te chama quando precisa.
          </p>

          <div className="mt-8">
            <Midia
              src={IMAGEM_MOTOR}
              titulo="GIF do motor rodando"
              nota="15 a 20 segundos mostrando as 4 etapas em sequência na interface real. Preencha IMAGEM_MOTOR no topo de Landing.tsx."
            />
          </div>
        </div>
      </Secao>

      {/* ── Auditoria como prova ──────────────────────────────────────────── */}
      <Secao className="relative z-10 py-14 md:py-20">
        <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.10] via-card/60 to-transparent p-7 shadow-card backdrop-blur-sm md:p-12">
          <h2 className="max-w-3xl text-balance text-[24px] font-bold leading-tight tracking-tight md:text-[32px]">
            Não é um painel que mostra número. É uma auditoria que diz o que fazer com ele.
          </h2>
          <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-muted-foreground md:text-base">
            Um dashboard mostra CTR, CPC, CPA — qualquer ferramenta mostra isso. A auditoria do Scale Ads interpreta o
            dado com a régua técnica certa: EMQ mínimo, frequência de anúncio, regra dos 20% entre ajustes, meta de
            conversões pra sair da fase de aprendizado. É o conhecimento que um gestor júnior não tem e um gestor
            sênior não tem tempo de aplicar em sete contas todo dia.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <CtaAuditoria className="shadow-glow" />
            <p className="text-xs text-muted-foreground/70">
              Crie a conta, conecte uma conta de anúncios e a auditoria roda em minutos. Sem cartão.
            </p>
          </div>
        </div>
      </Secao>

      {/* ── O que destrava na rotina ──────────────────────────────────────── */}
      <Secao className="relative z-10 py-14 md:py-20">
        <h2 className="text-[26px] font-bold tracking-tight md:text-[34px]">O que isso destrava na sua rotina</h2>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {DESTRAVA.map(({ icon: Icon, titulo, texto }) => (
            <div
              key={titulo}
              className="card-hover rounded-2xl border border-white/[0.06] bg-card/70 p-5 shadow-card backdrop-blur-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{titulo}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{texto}</p>
            </div>
          ))}
        </div>
      </Secao>

      {/* ── Seguranca ─────────────────────────────────────────────────────── */}
      <Secao className="relative z-10 py-14 md:py-20">
        <div className="grid gap-8 rounded-3xl border border-white/[0.06] bg-card/50 p-7 shadow-card backdrop-blur-sm md:grid-cols-[auto_1fr] md:p-12">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-balance text-[24px] font-bold leading-tight tracking-tight md:text-[30px]">
              O token do seu cliente fica fora do alcance até de quem usa o sistema.
            </h2>
            <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
              Você está dando acesso a contas que não são suas — são dos seus clientes. O Scale Ads guarda o token de
              acesso numa camada isolada, sem acesso direto de usuário nenhum, e toda chamada à API da Meta passa por
              um intermediário que nunca expõe a credencial no navegador. Cada equipe só enxerga a própria carteira.
            </p>
            <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
              Isso não é discurso — é como o sistema foi construído. Na demonstração, mostramos a arquitetura, não só
              afirmamos que é segura.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-background/40 p-4">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span className="text-[13px] leading-relaxed text-muted-foreground">
                  Credencial guardada no servidor, fora do alcance do navegador
                </span>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-background/40 p-4">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span className="text-[13px] leading-relaxed text-muted-foreground">
                  Cada equipe enxerga apenas a própria carteira
                </span>
              </div>
            </div>
          </div>
        </div>
      </Secao>

      {/* ── Nao substitui o Gerenciador ───────────────────────────────────── */}
      <Secao className="relative z-10 py-14 md:py-20">
        <h2 className="text-[26px] font-bold tracking-tight md:text-[34px]">
          O Scale Ads não substitui seu Gerenciador
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
          Três coisas que costumam travar decisão antes mesmo de você conhecer o produto.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {NAO_SUBSTITUI.map(({ titulo, texto }) => (
            <div key={titulo} className="rounded-2xl border border-white/[0.06] bg-background/40 p-5 backdrop-blur-sm">
              <Check className="h-5 w-5 text-emerald-400" />
              <h3 className="mt-3 text-[15px] font-semibold tracking-tight">{titulo}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{texto}</p>
            </div>
          ))}
        </div>
      </Secao>

      {/* ── Pra quem e ────────────────────────────────────────────────────── */}
      <Secao className="relative z-10 py-14 md:py-20">
        <div className="rounded-3xl border border-white/[0.06] bg-card/50 p-7 shadow-card backdrop-blur-sm md:p-12">
          <h2 className="text-[24px] font-bold tracking-tight md:text-[32px]">O Scale Ads é pra você que...</h2>

          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {PARA_QUEM.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span className="text-[14px] leading-relaxed text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>

          <p className="mt-8 flex items-start gap-3 border-t border-white/[0.06] pt-6 text-[14px] leading-relaxed text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
            <span>
              Se você tem menos de 5 contas, talvez ainda não seja o momento — prefiro que você volte quando fizer
              sentido do que assine agora e cancele no segundo mês.
            </span>
          </p>
        </div>
      </Secao>

      {/* ── Planos: some inteiro se o preco nao estiver definido ───────────── */}
      {PRECO_ENTRADA && (
        <Secao className="relative z-10 py-14 md:py-20">
          <div id="planos" className="scroll-mt-24">
            <h2 className="text-[26px] font-bold tracking-tight md:text-[34px]">Planos</h2>

            <div className="mt-10 grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.12] via-card/60 to-transparent p-7 shadow-card backdrop-blur-sm md:p-10">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">Entrada</span>
                <p className="mt-4 text-[15px] text-muted-foreground">A partir de</p>
                <p className="mt-1 text-[42px] font-extrabold tracking-tight text-emerald-400">{PRECO_ENTRADA}</p>
                <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
                  O valor escala junto com o tamanho da sua carteira de clientes conectados — carteira maior, mais
                  contas monitoradas, mais valor.
                </p>

                <ul className="mt-7 space-y-3">
                  {INCLUSO.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-[14px] leading-relaxed text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      {item}
                    </li>
                  ))}
                </ul>

                <CtaDemo className="mt-8 w-full sm:w-auto" />
              </div>

              <div className="flex flex-col justify-between gap-6 rounded-3xl border border-white/[0.06] bg-card/50 p-7 shadow-card backdrop-blur-sm md:p-10">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Carteira grande
                  </span>
                  <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                    Se você administra um volume grande de contas, o preço e o onboarding fazem mais sentido
                    conversados diretamente.
                  </p>

                  <div className="mt-7 rounded-2xl border border-white/[0.06] bg-background/40 p-5">
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      <span className="font-semibold text-foreground">A matemática rápida:</span> {PRECO_ENTRADA} é
                      menos do que uma hora do seu tempo cobrada como serviço de agência — e menos do que o custo de
                      perder o dia inteiro do fechamento montando relatório na mão, todo mês, em todos os clientes.
                    </p>
                  </div>
                </div>

                <CtaDemo className="w-full sm:w-auto" />
              </div>
            </div>

            {GARANTIA && (
              <p className="mt-6 flex items-start gap-3 text-[14px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>
                  <span className="font-semibold text-foreground">Garantia:</span> {GARANTIA}
                </span>
              </p>
            )}
          </div>
        </Secao>
      )}

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <Secao className="relative z-10 py-14 md:py-20">
        <h2 className="text-[26px] font-bold tracking-tight md:text-[34px]">Perguntas frequentes</h2>

        <div className="mt-9 grid gap-3 md:grid-cols-2">
          {FAQ.map(({ p, r }) => (
            <div key={p} className="rounded-2xl border border-white/[0.06] bg-card/50 p-5 backdrop-blur-sm">
              <h3 className="text-[15px] font-semibold tracking-tight">{p}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{r}</p>
            </div>
          ))}
        </div>
      </Secao>

      {/* ── Chamada final ─────────────────────────────────────────────────── */}
      <Secao className="relative z-10 pb-20 pt-6 md:pb-28">
        <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.12] via-card/60 to-transparent p-8 text-center shadow-card md:p-14">
          <div className="pointer-events-none absolute inset-x-10 -top-16 h-40 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-balance text-[26px] font-bold leading-tight tracking-tight md:text-[36px]">
              Pare de ser a última pessoa a saber que algo quebrou na conta de um cliente.
            </h2>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <CtaDemo />
              <CtaAuditoria />
            </div>

            <p className="mt-5 text-xs text-muted-foreground/70">
              Sem cartão de crédito. Suas campanhas continuam no Gerenciador da Meta.
              {GARANTIA ? " 7 dias de garantia." : ""}
            </p>
          </div>
        </div>
      </Secao>

      {/* ── Rodape ────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.06]">
        <Secao className="flex flex-col gap-4 py-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5">
            <ScaleAdsLogo size={26} className="rounded-lg" />
            <span className="text-sm font-bold tracking-tight">
              Scale <span className="text-emerald-400">Ads</span>
            </span>
          </div>

          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
            <a href="#como-funciona" className="transition-colors hover:text-foreground">
              Produto
            </a>
            {PRECO_ENTRADA && (
              <a href="#planos" className="transition-colors hover:text-foreground">
                Preço
              </a>
            )}
            <Link to="/privacidade" className="transition-colors hover:text-foreground">
              Privacidade
            </Link>
            <Link to="/termos" className="transition-colors hover:text-foreground">
              Termos de uso
            </Link>
            <span className="inline-flex items-center gap-1.5">
              <WhatsAppIcon className="h-3.5 w-3.5" />
              Suporte por WhatsApp
            </span>
          </nav>

          <div className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-muted-foreground/50 md:text-right">
            {RAZAO_SOCIAL && <span className="normal-case tracking-normal">{RAZAO_SOCIAL}</span>}
            {CNPJ && <span className="normal-case tracking-normal">CNPJ {CNPJ}</span>}
            <span>Scale Ads © {new Date().getFullYear()}</span>
          </div>
        </Secao>
      </footer>
    </div>
  );
}
