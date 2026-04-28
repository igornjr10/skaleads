import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Megaphone, Bell, Settings, Brain, LogOut } from "lucide-react";
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
  { title: "Andromeda IA",   url: "/andromeda",  icon: Brain },
  { title: "Configurações",  url: "/settings",   icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, signOut, role } = useAuth();

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <Sidebar collapsible="icon">
      {/* ── Header ─────────────────────────────────────────── */}
      <SidebarHeader className="border-b border-sidebar-border bg-gradient-to-b from-[#0a0a0a] to-[#111111]">
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
            <div className="w-full h-px bg-gradient-to-r from-transparent via-orange-500/40 to-transparent" />
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
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    className={
                      isActive(item.url)
                        ? "relative text-primary font-semibold before:absolute before:left-0 before:inset-y-1 before:w-[3px] before:rounded-full before:bg-primary"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                    }
                  >
                    <NavLink to={item.url} end={item.url === "/"}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="text-[13px]">{item.title}</span>}
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
            <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent px-2 py-2">
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
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2 text-muted-foreground hover:text-foreground"
              onClick={signOut}
            >
              <LogOut className="h-3.5 w-3.5" />
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
