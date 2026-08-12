import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ScaleAdsLogo } from "@/components/ScaleAdsLogo";

export function LegalShell({
  titulo,
  atualizadoEm,
  children,
}: {
  titulo: string;
  atualizadoEm: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-gradient-glow" />

      <div className="relative mx-auto w-full max-w-3xl px-5 py-10 md:px-8 md:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>

        <div className="mt-8 flex items-center gap-2.5">
          <ScaleAdsLogo size={30} className="rounded-lg" />
          <span className="text-[15px] font-extrabold tracking-tight">
            Scale <span className="text-emerald-400">Ads</span>
          </span>
        </div>

        <h1 className="mt-6 text-[28px] font-extrabold tracking-tight md:text-[36px]">{titulo}</h1>
        <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground/60">
          Atualizado em {atualizadoEm}
        </p>

        <div className="prose-scale mt-10 space-y-8">{children}</div>
      </div>
    </div>
  );
}

export function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[17px] font-bold tracking-tight">{titulo}</h2>
      <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}
