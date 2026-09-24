import { ReactNode } from "react";
import { Link } from "react-router-dom";

interface LegalPageProps {
  title: string;
  updatedAt: string;
  children: ReactNode;
}

export function LegalPage({ title, updatedAt, children }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
          <Link to="/" className="text-lg font-bold tracking-tight">
            Scale <span className="text-primary">Ads</span>
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link to="/privacidade" className="transition-colors hover:text-foreground">Privacidade</Link>
            <Link to="/termos" className="transition-colors hover:text-foreground">Termos</Link>
            <Link to="/exclusao-de-dados" className="transition-colors hover:text-foreground">Excluir dados</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: {updatedAt}</p>
        <div className="mt-10 space-y-8">{children}</div>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        Scale Ads · contato@marketproads.com
      </footer>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}
