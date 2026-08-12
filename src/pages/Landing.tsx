import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Brain,
  FileText,
  Link2,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScaleAdsLogo } from "@/components/ScaleAdsLogo";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { useAuth } from "@/hooks/useAuth";

const RECURSOS = [
  {
    icon: BarChart3,
    titulo: "Painel por cliente e da carteira inteira",
    texto:
      "Gasto, impressões, cliques, CTR, CPC, alcance e frequência de cada conta, com série diária e comparação de período.",
  },
  {
    icon: RefreshCw,
    titulo: "Sincronização automática com a Meta",
    texto:
      "Cada cliente tem a própria frequência de sync. O sistema busca campanhas, conjuntos, anúncios e métricas sem ninguém clicar em nada.",
  },
  {
    icon: ShieldCheck,
    titulo: "Auditoria da conta de anúncios",
    texto:
      "Mais de 25 verificações automáticas de pixel, CAPI, Event Match Quality, estrutura de campanha, criativos e orçamento — com nota e recomendação.",
  },
  {
    icon: Bell,
    titulo: "Alertas que chegam onde você olha",
    texto:
      "Defina a condição (CPC acima de X, gasto sem conversão, campanha parada) e receba no painel, no e-mail ou no WhatsApp.",
  },
  {
    icon: FileText,
    titulo: "Relatório pronto para o cliente",
    texto:
      "PDF com a marca da agência, escolhendo as métricas que importam para aquele cliente. Envio por WhatsApp e link público com dados ao vivo.",
  },
  {
    icon: Brain,
    titulo: "Leitura assistida por IA",
    texto:
      "Assistente que responde sobre os dados reais das campanhas e diagnóstico de prontidão da conta para a nova lógica de entrega da Meta.",
  },
];

const PASSOS = [
  {
    numero: "1",
    titulo: "Conecte a conta de anúncios",
    texto: "Cadastre o cliente e conecte o Business Manager dele. O token fica guardado no servidor, nunca no navegador.",
  },
  {
    numero: "2",
    titulo: "Deixe sincronizar",
    texto: "Campanhas, conjuntos, anúncios e métricas diárias entram sozinhos, na frequência que você definir por cliente.",
  },
  {
    numero: "3",
    titulo: "Acompanhe e entregue",
    texto: "Audite a conta, configure alertas e mande o relatório do mês sem montar planilha nenhuma.",
  },
];

function Secao({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`mx-auto w-full max-w-6xl px-5 md:px-8 ${className}`}>{children}</section>;
}

export default function Landing() {
  const { user } = useAuth();

  // A landing continua acessivel com sessao aberta — o que muda e o destino dos
  // botoes. Redirecionar quem esta logado impediria ate de revisar a pagina.
  const destino = user ? "/dashboard" : "/auth";
  const rotuloPrincipal = user ? "Ir para o painel" : "Começar agora";

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
      <Secao className="relative z-10 pb-16 pt-12 md:pb-24 md:pt-20">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-semibold tracking-wide text-emerald-400">
              Para agências e gestores de tráfego
            </span>
          </div>

          <h1 className="mt-6 text-[34px] font-extrabold leading-[1.1] tracking-tight md:text-[54px]">
            Todos os seus clientes de Meta Ads
            <br />
            <span className="text-emerald-400">num painel só.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            O Scale Ads sincroniza as contas de anúncios da sua carteira, audita a estrutura, avisa quando algo sai da
            linha e entrega o relatório do cliente pronto. Sem planilha, sem abrir o Gerenciador conta por conta.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 rounded-xl px-7 text-[15px] font-bold shadow-glow">
              <Link to={destino}>
                {rotuloPrincipal}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-7 text-[15px] font-semibold">
              <a href="#recursos">Ver o que faz</a>
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground/70">
            Conecte quantas contas de anúncios quiser. Cada equipe enxerga apenas a própria carteira.
          </p>
        </div>
      </Secao>

      {/* ── Recursos ──────────────────────────────────────────────────────── */}
      <Secao className="relative z-10 py-14 md:py-20" >
        <div id="recursos" className="scroll-mt-24">
          <h2 className="text-[26px] font-bold tracking-tight md:text-[34px]">
            O trabalho chato da gestão, automatizado
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
            Tudo que hoje consome sua manhã — puxar número, conferir pixel, montar relatório — o sistema faz sozinho.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {RECURSOS.map(({ icon: Icon, titulo, texto }) => (
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
        </div>
      </Secao>

      {/* ── Como funciona ─────────────────────────────────────────────────── */}
      <Secao className="relative z-10 py-14 md:py-20">
        <div className="rounded-3xl border border-white/[0.06] bg-card/50 p-7 shadow-card backdrop-blur-sm md:p-12">
          <h2 className="text-[26px] font-bold tracking-tight md:text-[32px]">Em três passos</h2>

          <div className="mt-9 grid gap-8 md:grid-cols-3">
            {PASSOS.map(({ numero, titulo, texto }) => (
              <div key={numero}>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-white shadow-glow">
                  {numero}
                </div>
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{titulo}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{texto}</p>
              </div>
            ))}
          </div>
        </div>
      </Secao>

      {/* ── Diferenciais operacionais ─────────────────────────────────────── */}
      <Secao className="relative z-10 py-14 md:py-20">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              titulo: "O token do cliente não fica no navegador",
              texto:
                "As credenciais das contas de anúncios ficam guardadas no servidor, fora do alcance do front. Nem quem usa o sistema consegue extrair.",
            },
            {
              icon: Users,
              titulo: "Cada equipe com a própria carteira",
              texto:
                "Quem entra vê apenas os clientes do time dele. Nada de agência enxergando a conta da outra.",
            },
            {
              icon: Link2,
              titulo: "Link ao vivo para o cliente",
              texto:
                "Cada cliente pode ter um endereço próprio com os números atualizados, sem precisar de login nem de você mandando print.",
            },
          ].map(({ icon: Icon, titulo, texto }) => (
            <div key={titulo} className="rounded-2xl border border-white/[0.06] bg-background/40 p-5 backdrop-blur-sm">
              <Icon className="h-5 w-5 text-emerald-400" />
              <h3 className="mt-3 text-[15px] font-semibold tracking-tight">{titulo}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{texto}</p>
            </div>
          ))}
        </div>
      </Secao>

      {/* ── Chamada final ─────────────────────────────────────────────────── */}
      <Secao className="relative z-10 pb-20 pt-6 md:pb-28">
        <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.12] via-card/60 to-transparent p-8 text-center shadow-card md:p-14">
          <div className="pointer-events-none absolute inset-x-10 -top-16 h-40 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="relative">
            <Activity className="mx-auto h-8 w-8 text-emerald-400" />
            <h2 className="mt-5 text-[26px] font-bold tracking-tight md:text-[34px]">
              Comece pela primeira conta
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
              Crie sua conta, conecte um cliente e veja os dados entrarem. Se fizer sentido, traga o resto da carteira.
            </p>
            <Button asChild size="lg" className="mt-7 h-12 rounded-xl px-8 text-[15px] font-bold shadow-glow">
              <Link to={destino}>
                {user ? "Ir para o painel" : "Criar minha conta"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </Secao>

      {/* ── Rodapé ────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.06]">
        <Secao className="flex flex-col gap-4 py-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5">
            <ScaleAdsLogo size={26} className="rounded-lg" />
            <span className="text-sm font-bold tracking-tight">
              Scale <span className="text-emerald-400">Ads</span>
            </span>
          </div>

          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
            <Link to="/privacidade" className="transition-colors hover:text-foreground">
              Privacidade
            </Link>
            <Link to="/termos" className="transition-colors hover:text-foreground">
              Termos de uso
            </Link>
            <Link to={destino} className="transition-colors hover:text-foreground">
              {user ? "Painel" : "Entrar"}
            </Link>
            <span className="inline-flex items-center gap-1.5">
              <WhatsAppIcon className="h-3.5 w-3.5" />
              Suporte por WhatsApp
            </span>
          </nav>

          <span className="text-[11px] uppercase tracking-wide text-muted-foreground/50">
            Scale Ads © {new Date().getFullYear()}
          </span>
        </Secao>
      </footer>
    </div>
  );
}
