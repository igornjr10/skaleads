import { useCallback, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Megaphone, Bell, Settings, LogOut, MessageSquare, Activity, ClipboardList, Clapperboard, Network, CalendarClock, ListTodo, Repeat, Compass, Send, Sparkles, MessagesSquare, ChevronRight, FileSignature, CircleDollarSign, UsersRound, Kanban, type LucideIcon } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { MarketProLogo } from "./MarketProLogo";

type NavIcon = LucideIcon | typeof WhatsAppIcon;
type NavLeaf = { title: string; url: string; icon: NavIcon };
type NavGroup = { title: string; icon: NavIcon; url?: string; children: NavLeaf[] };
type NavNode = NavLeaf | NavGroup;

// Pai com `url` e pagina de verdade E porta do grupo: clicar no nome navega e
// abre; a setinha da direita so abre. Pai sem `url` e so agrupador, e a linha
// inteira alterna.
const NAV: NavNode[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  {
    title: "Clientes", url: "/clients", icon: Users,
    children: [
      { title: "Grupos", url: "/grupos", icon: MessagesSquare },
      { title: "Contratos", url: "/contratos", icon: FileSignature },
      { title: "Financeiro", url: "/financeiro", icon: CircleDollarSign },
    ],
  },
  {
    title: "Rotina", url: "/rotina", icon: Repeat,
    children: [
      { title: "Tarefas", url: "/tarefas", icon: ListTodo },
      { title: "Planner", url: "/planner", icon: ClipboardList },
      { title: "Produção", url: "/producao", icon: Clapperboard },
      { title: "Esteira criativa", url: "/esteira", icon: Kanban },
      { title: "Time", url: "/time", icon: UsersRound },
    ],
  },
  {
    title: "Campanhas", url: "/campaigns", icon: Megaphone,
    children: [
      { title: "Nichos", url: "/nichos", icon: Compass },
      { title: "Alertas", url: "/alerts", icon: Bell },
    ],
  },
  {
    title: "Envios", icon: Send,
    children: [
      { title: "Relatórios", url: "/report-schedules", icon: CalendarClock },
      { title: "Msgs WhatsApp", url: "/whatsapp-scheduled", icon: WhatsAppIcon },
      { title: "Automações", url: "/automations", icon: Activity },
    ],
  },
  {
    title: "Inteligência", icon: Sparkles,
    children: [
      { title: "Assistente IA", url: "/chat", icon: MessageSquare },
      { title: "Cérebro", url: "/cerebro", icon: Network },
    ],
  },
  { title: "Configurações", url: "/settings", icon: Settings },
];

function hasChildren(node: NavNode): node is NavGroup {
  return "children" in node;
}

// No modo icone o shadcn esconde `SidebarMenuSub`, entao filho dentro de grupo
// ficaria inalcancavel. Recolhido a lista volta a ser plana: todo destino
// continua a um clique.
const FLAT: NavLeaf[] = NAV.flatMap(node =>
  hasChildren(node)
    ? [...(node.url ? [{ title: node.title, url: node.url, icon: node.icon }] : []), ...node.children]
    : [node]
);

const GROUPS_KEY = "sidebar:groups";

function readOpenGroups(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  // No mobile o sidebar vira Sheet em largura total, mas `state` continua "collapsed"
  const collapsed = !isMobile && state === "collapsed";
  const location = useLocation();
  const { user, signOut, role } = useAuth();

  // useCallback para o efeito abaixo poder depender dela sem rodar a cada
  // render: so muda quando a rota muda, que e exatamente quando importa.
  const isActive = useCallback(
    (path: string) => (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path)),
    [location.pathname]
  );

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(readOpenGroups);

  // Chegar num filho por link direto ou refresh tem que abrir o grupo dele,
  // senao a pagina ativa nao aparece em lugar nenhum do menu.
  useEffect(() => {
    const dono = NAV.find(n => hasChildren(n) && n.children.some(c => isActive(c.url)));
    if (dono) setOpenGroups(prev => (prev[dono.title] ? prev : { ...prev, [dono.title]: true }));
  }, [isActive]);

  function toggleGroup(title: string) {
    setOpenGroups(prev => {
      const next = { ...prev, [title]: !prev[title] };
      try { localStorage.setItem(GROUPS_KEY, JSON.stringify(next)); } catch { /* modo privado */ }
      return next;
    });
  }

  const fechaNoMobile = () => { if (isMobile) setOpenMobile(false); };

  const linhaAtiva =
    "relative translate-x-0.5 rounded-2xl bg-gradient-to-r from-emerald-500/18 via-emerald-500/10 to-transparent text-primary font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_24px_rgba(16,185,129,0.10)] before:absolute before:left-0 before:inset-y-2 before:w-[3px] before:rounded-full before:bg-primary";
  const linhaInativa =
    "rounded-2xl text-sidebar-foreground/75 hover:translate-x-0.5 hover:text-sidebar-foreground hover:bg-sidebar-accent/70";

  const caixaIcone = (ativo: boolean) =>
    `flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${
      ativo
        ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-300"
        : "border-sidebar-border/60 bg-white/[0.03] text-sidebar-foreground/80 group-hover:border-emerald-500/20 group-hover:text-sidebar-foreground"
    }`;

  function renderLeaf(item: NavLeaf) {
    const ativo = isActive(item.url);
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton asChild size="lg" isActive={ativo} className={ativo ? linhaAtiva : linhaInativa}>
          <NavLink to={item.url} end={item.url === "/"} onClick={fechaNoMobile}>
            <span className={caixaIcone(ativo)}>
              <item.icon className="h-5 w-5 shrink-0" />
            </span>
            {!collapsed && <span className="text-[15px] font-semibold tracking-[-0.01em]">{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  function renderGroup(node: NavGroup) {
    const aberto = !!openGroups[node.title];
    const filhoAtivo = node.children.some(c => isActive(c.url));
    const proprioAtivo = node.url ? isActive(node.url) : false;
    // Grupo fechado com filho ativo herda o destaque: sem isso a pagina aberta
    // nao teria nenhuma marca visivel no menu.
    const destacado = proprioAtivo || (filhoAtivo && !aberto);

    const chevron = (
      <ChevronRight
        className={`h-4 w-4 shrink-0 transition-transform duration-200 ${aberto ? "rotate-90" : ""}`}
      />
    );

    return (
      <Collapsible key={node.title} open={aberto} asChild>
        <SidebarMenuItem>
          {node.url ? (
            <div className="relative">
              <SidebarMenuButton
                asChild
                size="lg"
                isActive={destacado}
                className={destacado ? linhaAtiva : linhaInativa}
              >
                <NavLink
                  to={node.url}
                  onClick={() => {
                    fechaNoMobile();
                    if (!aberto) toggleGroup(node.title);
                  }}
                  className="pr-9"
                >
                  <span className={caixaIcone(destacado)}>
                    <node.icon className="h-5 w-5 shrink-0" />
                  </span>
                  <span className="text-[15px] font-semibold tracking-[-0.01em]">{node.title}</span>
                </NavLink>
              </SidebarMenuButton>
              {/* Botao separado do link: quem quer so espiar o grupo nao deveria
                  ser obrigado a trocar de pagina para isso. */}
              <button
                type="button"
                aria-label={`${aberto ? "Fechar" : "Abrir"} ${node.title}`}
                onClick={() => toggleGroup(node.title)}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-white/[0.06] hover:text-sidebar-foreground"
              >
                {chevron}
              </button>
            </div>
          ) : (
            <SidebarMenuButton
              size="lg"
              isActive={destacado}
              aria-expanded={aberto}
              onClick={() => toggleGroup(node.title)}
              className={destacado ? linhaAtiva : linhaInativa}
            >
              <span className={caixaIcone(destacado)}>
                <node.icon className="h-5 w-5 shrink-0" />
              </span>
              <span className="text-[15px] font-semibold tracking-[-0.01em]">{node.title}</span>
              <span className="ml-auto mr-1 flex items-center text-sidebar-foreground/60">{chevron}</span>
            </SidebarMenuButton>
          )}

          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            <SidebarMenuSub className="mt-1 gap-1 border-sidebar-border/70">
              {node.children.map(child => {
                const ativo = isActive(child.url);
                return (
                  <SidebarMenuSubItem key={child.url}>
                    <SidebarMenuSubButton
                      asChild
                      isActive={ativo}
                      className={`h-9 rounded-xl ${
                        ativo
                          ? "bg-emerald-500/12 font-semibold text-primary"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                      }`}
                    >
                      <NavLink to={child.url} onClick={fechaNoMobile}>
                        <child.icon className="h-4 w-4 shrink-0" />
                        <span className="text-[13.5px] font-medium tracking-[-0.01em]">{child.title}</span>
                      </NavLink>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  }

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      className="top-2 bottom-2 left-2 h-[calc(100svh-1rem)]"
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <SidebarHeader className="relative overflow-hidden border-b border-sidebar-border/70 bg-gradient-to-b from-[#151515] via-[#101010] to-[#0b0b0b]">
        <div className="pointer-events-none absolute inset-x-4 top-0 h-20 rounded-full bg-emerald-500/10 blur-2xl" />
        {collapsed ? (
          <div className="flex items-center justify-center py-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-emerald-500/20 blur-md" />
              <MarketProLogo size={36} className="relative shrink-0 rounded-xl ring-1 ring-emerald-500/30" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-3 py-5">
            {/* Logo com glow */}
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-emerald-500/25 blur-lg scale-110" />
              <MarketProLogo
                size={64}
                className="relative shrink-0 rounded-2xl ring-1 ring-emerald-500/40 shadow-[0_0_24px_rgba(16,185,129,0.25)]"
              />
            </div>

            {/* Brand name */}
            <div className="flex flex-col items-center gap-0.5 text-center">
              <span className="text-[17px] font-extrabold tracking-tight text-white leading-none">
                Scale<span className="text-emerald-400">Ads</span>
              </span>
              <span className="text-[10px] font-medium tracking-[0.22em] uppercase text-emerald-500/80">
                Manager
              </span>
            </div>

            {/* Linha decorativa */}
            <div className="h-px w-full bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
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
              {collapsed
                ? FLAT.map(renderLeaf)
                : NAV.map(node => (hasChildren(node) ? renderGroup(node) : renderLeaf(node)))}
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
