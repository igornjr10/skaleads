import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Megaphone, Bell, Settings, Brain, LogOut, MessageSquare, MessageCircle } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { MarketProLogo } from "./MarketProLogo";

const items = [
  { title: "Dashboard",      url: "/",           icon: LayoutDashboard },
  { title: "Clientes",       url: "/clients",    icon: Users },
  { title: "Campanhas",      url: "/campaigns",  icon: Megaphone },
  { title: "Alertas",        url: "/alerts",     icon: Bell },
  { title: "Msgs WhatsApp",  url: "/whatsapp-scheduled", icon: MessageCircle },
  { title: "Assistente IA",  url: "/chat",       icon: MessageSquare },
  { title: "Andromeda IA",   url: "/andromeda",  icon: Brain },
  { title: "Configurações",  url: "/settings",   icon: Settings },
];

export function AppSidebar() {
  const { state, setOpen, isMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, signOut, role } = useAuth();

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      className="top-2 bottom-2 left-2 h-[calc(100svh-1rem)]"
      onMouseEnter={() => {
        if (!isMobile) setOpen(true);
      }}
      onMouseLeave={() => {
        if (!isMobile) setOpen(false);
      }}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <SidebarHeader className="relative overflow-hidden border-b border-sidebar-border/70 bg-gradient-to-b from-[#151515] via-[#101010] to-[#0b0b0b]">
        <div className="pointer-events-none absolute inset-x-4 top-0 h-20 rounded-full bg-orange-500/10 blur-2xl" />
        {collapsed ? (
          <div className="flex items-center justify-center py-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-orange-500/20 blur-md" />
              <MarketProLogo size={36} className="relative shrink-0 rounded-xl ring-1 ring-orange-500/30" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-3 py-5">
            {/* Logo com glow */}
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-orange-500/25 blur-lg scale-110" />
              <MarketProLogo
                size={64}
                className="relative shrink-0 rounded-2xl ring-1 ring-orange-500/40 shadow-[0_0_24px_rgba(249,115,22,0.25)]"
              />
            </div>

            {/* Brand name */}
            <div className="flex flex-col items-center gap-0.5 text-center">
              <span className="text-[17px] font-extrabold tracking-tight text-white leading-none">
                MarketPro<span className="text-orange-400">Ads</span>
              </span>
              <span className="text-[10px] font-medium tracking-[0.22em] uppercase text-orange-500/80">
                Manager
              </span>
            </div>

            {/* Linha decorativa */}
            <div className="h-px w-full bg-gradient-to-r from-transparent via-orange-500/40 to-transparent" />
          </div>
        )}
      </SidebarHeader>

      {/* ── Nav ────────────────────────────────────────────── */}
      <SidebarContent>
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-3 mb-1">
              Navegação
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    size="lg"
                    isActive={isActive(item.url)}
                    className={
                      isActive(item.url)
                        ? "relative translate-x-0.5 rounded-2xl bg-gradient-to-r from-orange-500/18 via-orange-500/10 to-transparent text-primary font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_24px_rgba(249,115,22,0.10)] before:absolute before:left-0 before:inset-y-2 before:w-[3px] before:rounded-full before:bg-primary"
                        : "rounded-2xl text-sidebar-foreground/75 hover:translate-x-0.5 hover:text-sidebar-foreground hover:bg-sidebar-accent/70"
                    }
                  >
                    <NavLink to={item.url} end={item.url === "/"}>
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${isActive(item.url) ? "border-orange-500/30 bg-orange-500/12 text-orange-300" : "border-sidebar-border/60 bg-white/[0.03] text-sidebar-foreground/80 group-hover:border-orange-500/20 group-hover:text-sidebar-foreground"}`}>
                        <item.icon className="h-5 w-5 shrink-0" />
                      </span>
                      {!collapsed && <span className="text-[15px] font-semibold tracking-[-0.01em]">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer ─────────────────────────────────────────── */}
      <SidebarFooter className="border-t border-sidebar-border">
        {!collapsed ? (
          <div className="flex flex-col gap-2 p-2">
            <div className="rounded-2xl border border-white/[0.05] bg-white/[0.03] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="flex items-center gap-2 rounded-xl bg-sidebar-accent/70 px-2 py-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                {user?.email?.[0]?.toUpperCase() ?? "U"}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[11px] font-medium text-sidebar-foreground">
                    {user?.email}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
                    {role}
                  </span>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-11 justify-start gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
              onClick={signOut}
            >
              <LogOut className="h-4.5 w-4.5" />
              Sair
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="mx-auto my-2 text-muted-foreground hover:text-foreground"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
