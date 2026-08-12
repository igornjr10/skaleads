import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { NotificationsBell } from "./NotificationsBell";
import { ScaleAdsLogo } from "./ScaleAdsLogo";
import { ClientSwitcher } from "./ClientSwitcher";

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
  return key ? PAGE_TITLES[key] : { title: "Scale Ads", subtitle: "" };
}

export function AppLayout() {
  const location = useLocation();
  const meta = getPageMeta(location.pathname);

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="relative flex min-h-screen w-full bg-background">
        {/* Ambient glow */}
        <div className="pointer-events-none fixed inset-0 bg-gradient-glow" />

        <AppSidebar />

        <div className="relative flex min-h-screen flex-1 flex-col">
          {/* ── Top bar ───────────────────────────────────────── */}
          <header className="sticky top-0 z-30 mx-2 mt-2 flex h-14 items-center gap-3 rounded-2xl border border-white/[0.06] bg-background/65 px-4 shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <SidebarTrigger className="shrink-0 rounded-xl text-muted-foreground hover:bg-white/[0.04] hover:text-foreground" />

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

            <ClientSwitcher />

            {/* Right side */}
            <div className="flex items-center gap-2">
              <NotificationsBell />
              {/* Brand mark (shown when sidebar collapsed) */}
              <div className="hidden md:flex items-center gap-1.5 opacity-40 hover:opacity-70 transition-opacity">
                <ScaleAdsLogo size={22} />
              </div>
            </div>
          </header>

          {/* ── Page content ─────────────────────────────────── */}
          <main className="flex-1 px-4 pb-4 pt-4 md:px-6 md:pb-6 md:pt-5 lg:px-8 lg:pb-8 lg:pt-6">
            <Outlet />
          </main>

          {/* ── Footer ───────────────────────────────────────── */}
          <footer className="mx-2 mb-2 flex items-center justify-between rounded-2xl border border-white/[0.05] bg-background/40 px-6 py-2 backdrop-blur-md">
            <span className="text-[10px] text-muted-foreground/40 tracking-wide uppercase">
              Scale Ads © {new Date().getFullYear()}
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
