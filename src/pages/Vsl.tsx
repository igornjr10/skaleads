import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  FileText,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScaleAdsLogo } from "@/components/ScaleAdsLogo";
import { useAuth } from "@/hooks/useAuth";

// Cole aqui o embed da VSL (YouTube: https://www.youtube.com/embed/ID | Vimeo:
// https://player.vimeo.com/video/ID). Vazio mostra o bloco de instrucao no
// lugar do player, em vez de um iframe quebrado.
const VIDEO_EMBED_URL = "";

// Preencha quando tiver preco e garantia definidos. Vazio esconde a secao
// inteira — melhor nao ter oferta na pagina do que ter oferta inventada.
const PRECO = "";
const GARANTIA = "";

const MOTOR = [
  {
    icon: RefreshCw,
    etapa: "Sincroniza",
    texto:
      "Entra em cada conta pela API oficial da Meta e traz campanha, conjunto, anúncio e métrica diária. Na frequência que você definir, por cliente.",
  },
  {
    icon: ShieldCheck,
    etapa: "Audita",
    texto:
      "Mais de 25 verificações: pixel disparando, CAPI, Event Match Quality, fragmentação de conjunto, criativo em fadiga, orçamento acima do ritmo. Com nota de 0 a 100.",
  },
  {
    icon: Bell,
    etapa: "Avisa",
    texto:
      "Você define a condição e o canal. O alerta chega no painel, no e-mail ou no WhatsApp — antes de virar prejuízo no fechamento.",
  },
  {
    icon: FileText,
    etapa: "Reporta",
    texto:
      "Relatório em PDF com a sua marca, pronto no fim do mês. Envio por WhatsApp em um clique e link ao vivo para o cliente ansioso se servir sozinho.",
  },
];

const PARA_DE_FAZER = [
  "Abrir o Gerenciador conta por conta todo dia",
  "Copiar número para planilha",
  "Montar relatório no dia 1º",
  "Tirar print para o grupo do cliente",
  "Descobrir pixel parado no fechamento do mês",
  "Responder \"como foi ontem?\" na mão",
];

const PARA_QUEM_E = [
  "Agência que atende 5 contas de Meta Ads ou mais",
  "Gestor de tráfego que trabalha com carteira de clientes",
  "Quem entrega relatório mensal e perde o primeiro dia útil nisso",
];

const PARA_QUEM_NAO_E = [
  "Quem roda apenas a própria conta de anúncios",
  "Quem quer uma ferramenta para criar campanha — aqui a campanha continua na Meta",
  "Quem procura automação de lance ou robô de otimização",
];

const OBJECOES = [
  {
    p: "Vou ter que migrar minhas campanhas?",
    r: "Não. Elas continuam onde estão, no Gerenciador da Meta. O Scale Ads lê pela API oficial, não substitui a plataforma.",
  },
  {
    p: "É seguro conectar a conta dos meus clientes?",
    r: "O token de cada conta fica guardado no servidor, numa tabela que o navegador não alcança — nem quem usa o sistema consegue extrair. E cada equipe enxerga somente a própria carteira.",
  },
  {
    p: "Minha equipe vai precisar aprender ferramenta nova?",
    r: "Quem faz o trabalho é o sistema. A equipe abre para ver o que ele já produziu: a auditoria rodada, o alerta disparado, o relatório pronto.",
  },
  {
    p: "Funciona com Business Manager de terceiros?",
    r: "Sim. É o caso mais comum: você conecta as contas de anúncios que administra para os seus clientes.",
  },
];

function Secao({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`mx-auto w-full max-w-5xl px-5 md:px-8 ${className}`}>{children}</section>;
}

export default function Vsl() {
  const { user } = useAuth();
  const destino = user ? "/dashboard" : "/auth";
  const rotulo = user ? "Ir para o painel" : "Criar minha conta";

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-gradient-glow" />

      {/* ── Topo enxuto: numa VSL, menu de navegacao so tira o lead do video ── */}
      <header className="relative z-10">
        <Secao className="flex items-center justify-center py-6">
          <Link to="/" className="flex items-center gap-2.5">
            <ScaleAdsLogo size={30} className="rounded-lg" />
            <span className="text-[16px] font-extrabold tracking-tight">
              Scale <span className="text-emerald-400">Ads</span>
            </span>
          </Link>
        </Secao>
      </header>

      {/* ── Promessa + vídeo ────────────────────────────────────────────────── */}
      <Secao className="relative z-10 pb-12 pt-4 text-center md:pt-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] font-semibold tracking-wide text-emerald-400">
            Para agências e gestores com mais de 5 contas
          </span>
        </div>

        <h1 className="mx-auto mt-6 max-w-3xl text-[32px] font-extrabold leading-[1.1] tracking-tight md:text-[50px]">
          Atenda o dobro de clientes
          <br />
          <span className="text-emerald-400">sem contratar mais ninguém.</span>
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          O Scale Ads sincroniza, audita e reporta as contas de Meta Ads da sua carteira — todo dia, sem você abrir o
          Gerenciador.
        </p>

        <div className="mx-auto mt-9 max-w-3xl">
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card/70 shadow-card backdrop-blur-sm">
            {VIDEO_EMBED_URL ? (
              <div className="relative aspect-video w-full">
                <iframe
                  src={VIDEO_EMBED_URL}
                  title="Como o Scale Ads funciona"
                  className="absolute inset-0 h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-black/40 p-6 text-center">
                <PlayCircle className="h-12 w-12 text-emerald-400/70" />
                <p className="text-sm font-semibold">Espaço da VSL</p>
                <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                  Grave o vídeo com o roteiro de <code className="text-emerald-400">marketing/vsl-scale-ads.md</code> e
                  cole a URL de embed em <code className="text-emerald-400">VIDEO_EMBED_URL</code>, no topo de
                  Vsl.tsx.
                </p>
              </div>
            )}
          </div>

          <Button asChild size="lg" className="mt-7 h-13 w-full rounded-xl px-8 py-3.5 text-[16px] font-bold shadow-glow sm:w-auto">
            <Link to={destino}>
              {rotulo}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <p className="mt-3 text-xs text-muted-foreground/70">Conecte o primeiro cliente em minutos.</p>
        </div>
      </Secao>

      {/* ── Mecanismo ───────────────────────────────────────────────────────── */}
      <Secao className="relative z-10 py-14 md:py-20">
        <h2 className="text-center text-[26px] font-bold tracking-tight md:text-[34px]">
          O motor de 4 etapas que roda sem você
        </h2>

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
                {i < MOTOR.length - 1 && <div className="h-full w-px bg-gradient-to-b from-emerald-500/30 to-transparent" />}
              </div>
              <div>
                <h3 className="text-[16px] font-bold tracking-tight">
                  <span className="text-emerald-400">{i + 1}.</span> {etapa}
                </h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{texto}</p>
              </div>
            </div>
          ))}
        </div>
      </Secao>

      {/* ── O que sai da sua rotina ─────────────────────────────────────────── */}
      <Secao className="relative z-10 py-14 md:py-20">
        <div className="rounded-3xl border border-white/[0.06] bg-card/50 p-7 shadow-card backdrop-blur-sm md:p-12">
          <h2 className="text-[24px] font-bold tracking-tight md:text-[30px]">O que você para de fazer</h2>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {PARA_DE_FAZER.map((item) => (
              <div key={item} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-rose-400">
                  <X className="h-3 w-3" />
                </div>
                <span className="text-[14px] leading-relaxed text-muted-foreground line-through decoration-muted-foreground/40">
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Secao>

      {/* ── Para quem é / não é ─────────────────────────────────────────────── */}
      <Secao className="relative z-10 py-14 md:py-20">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-6">
            <h3 className="text-[16px] font-bold tracking-tight">É para você se</h3>
            <ul className="mt-4 space-y-3">
              {PARA_QUEM_E.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[14px] leading-relaxed text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-background/40 p-6">
            <h3 className="text-[16px] font-bold tracking-tight">Não é para você se</h3>
            <ul className="mt-4 space-y-3">
              {PARA_QUEM_NAO_E.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[14px] leading-relaxed text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Secao>

      {/* ── Oferta: so aparece quando houver preco definido ─────────────────── */}
      {PRECO && (
        <Secao className="relative z-10 py-14 md:py-20">
          <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.12] via-card/60 to-transparent p-8 text-center shadow-card md:p-12">
            <h2 className="text-[24px] font-bold tracking-tight md:text-[32px]">O que está incluso</h2>
            <p className="mt-6 text-[42px] font-extrabold tracking-tight text-emerald-400">{PRECO}</p>
            {GARANTIA && <p className="mt-3 text-sm text-muted-foreground">{GARANTIA}</p>}
            <Button asChild size="lg" className="mt-7 h-12 rounded-xl px-8 text-[15px] font-bold shadow-glow">
              <Link to={destino}>
                {rotulo}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </Secao>
      )}

      {/* ── Objeções ────────────────────────────────────────────────────────── */}
      <Secao className="relative z-10 py-14 md:py-20">
        <h2 className="text-[24px] font-bold tracking-tight md:text-[30px]">Antes que você pergunte</h2>
        <div className="mt-7 space-y-3">
          {OBJECOES.map(({ p, r }) => (
            <div key={p} className="rounded-2xl border border-white/[0.06] bg-card/50 p-5 backdrop-blur-sm">
              <h3 className="text-[15px] font-semibold tracking-tight">{p}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{r}</p>
            </div>
          ))}
        </div>
      </Secao>

      {/* ── Chamada final ───────────────────────────────────────────────────── */}
      <Secao className="relative z-10 pb-20 pt-6 text-center md:pb-28">
        <h2 className="mx-auto max-w-2xl text-[26px] font-bold leading-tight tracking-tight md:text-[36px]">
          No mês que vem você monta relatório de novo — ou não.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground md:text-base">
          Crie a conta, conecte um cliente e veja os dados entrarem. Se não mudar a sua rotina, você cancela.
        </p>
        <Button asChild size="lg" className="mt-8 h-12 rounded-xl px-8 text-[15px] font-bold shadow-glow">
          <Link to={destino}>
            {rotulo}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </Secao>

      <footer className="relative z-10 border-t border-white/[0.06]">
        <Secao className="flex flex-col items-center gap-3 py-8 text-center md:flex-row md:justify-between md:text-left">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground/50">
            Scale Ads © {new Date().getFullYear()}
          </span>
          <nav className="flex items-center gap-5 text-[13px] text-muted-foreground">
            <Link to="/privacidade" className="transition-colors hover:text-foreground">
              Privacidade
            </Link>
            <Link to="/termos" className="transition-colors hover:text-foreground">
              Termos
            </Link>
          </nav>
        </Secao>
      </footer>
    </div>
  );
}
