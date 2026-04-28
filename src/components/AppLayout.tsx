import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { NotificationsBell } from "./NotificationsBell";
import { MarketProLogo } from "./MarketProLogo";

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  "/":            { title: "Dashboard",        subtitle: "Visão geral das campanhas" },
  "/clients":     { title: "Clientes",         subtitle: "Gerencie as contas anunciantes" },
  "/campaigns":   { title: "Campanhas",        subtitle: "Performance de campanhas Meta Ads" },
  "/alerts":      { title: "Alertas",          subtitle: "Monitoramento em tempo real" },
  "/andromeda":   { title: "Andromeda IA",     subtitle: "Motor de inteligência artificial" },
  "/settings":    { title: "Configurações",    subtitle: "Preferências da plataforma" },
};

function getPageMeta(pathname: string) {
  const key = Object.keys(PAGE_TITLES)
    .sort((a, b) => b.length - a.length)
    .find(k => pathname === k || (k !== "/" && pathname.startsWith(k)));
  return key ? PAGE_TITLES[key] : { title: "MarketProAds", subtitle: "" };
}

export function AppLayout() {
  const location = useLocation();
  const meta = getPageMeta(location.pathname);

  return (
    <SidebarProvider>
      <div className="relative flex min-h-screen w-full bg-background">
        {/* Ambient glow */}
        <div className="pointer-events-none fixed inset-0 bg-gradient-glow" />

        <AppSidebar />

        <div className="relative flex min-h-screen flex-1 flex-col">
          {/* ── Top bar ───────────────────────────────────────── */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md">
            <SidebarTrigger className="shrink-0 text-muted-foreground hover:text-foreground" />

            {/* Divider */}
            <div className="h-5 w-px bg-border" />

            {/* Page context */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold text-foreground truncate">{meta.title}</span>
              {meta.subtitle && (
                <>
                  <span className="text-border text-xs">/</span>
                  <span className="text-xs text-muted-foreground truncate hidden sm:block">
                    {meta.subtitle}
                  </span>
                </>
              )}
            </div>

            <div className="flex-1" />

            {/* Right side */}
            <div className="flex items-center gap-2">
              <NotificationsBell />
              {/* Brand mark (shown when sidebar collapsed) */}
              <div className="hidden md:flex items-center gap-1.5 opacity-40 hover:opacity-70 transition-opacity">
                <MarketProLogo size={22} />
              </div>
            </div>
          </header>

          {/* ── Page content ─────────────────────────────────── */}
          <main className="flex-1 p-4 md:p-6 lg:p-8">
            <Outlet />
          </main>

          {/* ── Footer ───────────────────────────────────────── */}
          <footer className="flex items-center justify-between border-t border-border/50 px-6 py-2">
            <span className="text-[10px] text-muted-foreground/40 tracking-wide uppercase">
              MarketProAds © {new Date().getFullYear()}
            </span>
            <span className="text-[10px] text-muted-foreground/40">
              Meta Graph API v21.0
            </span>
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}
