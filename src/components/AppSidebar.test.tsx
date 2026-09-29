import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar, navPermitida } from "./AppSidebar";
import { modulosEfetivos, type Modulo } from "@/lib/permissoes";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { email: "gestor@marketproads.com" },
    session: null,
    role: "owner",
    empresa: null,
    modulos: modulosEfetivos("owner", null),
    pode: () => true,
    loading: false,
    signOut: vi.fn(),
  }),
}));

function urls(nav: ReturnType<typeof navPermitida>): string[] {
  return nav.flatMap(n => [
    ...("url" in n && n.url ? [n.url] : []),
    ...("children" in n ? n.children.map(c => c.url) : []),
  ]);
}

function montar(rota = "/") {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("AppSidebar", () => {
  it("mostra os pais e esconde os filhos com os grupos fechados", () => {
    montar();
    expect(screen.getByText("Rotina")).toBeInTheDocument();
    expect(screen.getByText("Envios")).toBeInTheDocument();
    expect(screen.queryByText("Tarefas")).not.toBeInTheDocument();
    expect(screen.queryByText("Msgs WhatsApp")).not.toBeInTheDocument();
  });

  it("abre os filhos ao clicar na setinha, sem sair da pagina", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir Rotina" }));
    expect(screen.getByText("Tarefas")).toBeInTheDocument();
    expect(screen.getByText("Planner")).toBeInTheDocument();
    expect(screen.getByText("Produção")).toBeInTheDocument();
  });

  it("abre o grupo sozinho quando a rota ativa e de um filho", () => {
    montar("/tarefas");
    expect(screen.getByText("Tarefas")).toBeInTheDocument();
  });

  // Grupo sem pagina propria (Envios, Inteligencia) alterna pela linha inteira:
  // nao ha para onde navegar, entao exigir mira na setinha seria so atrito.
  it("alterna o grupo agrupador clicando na linha", () => {
    montar();
    fireEvent.click(screen.getByText("Inteligência"));
    expect(screen.getByText("Cérebro")).toBeInTheDocument();
  });

  it("guarda o que estava aberto entre sessoes", () => {
    const { unmount } = montar();
    fireEvent.click(screen.getByText("Envios"));
    expect(screen.getByText("Automações")).toBeInTheDocument();
    unmount();

    montar();
    expect(screen.getByText("Automações")).toBeInTheDocument();
  });

  it("nao perde nenhum destino: os 15 continuam alcancaveis", () => {
    montar();
    for (const grupo of ["Abrir Rotina", "Abrir Campanhas"]) {
      fireEvent.click(screen.getByRole("button", { name: grupo }));
    }
    fireEvent.click(screen.getByText("Envios"));
    fireEvent.click(screen.getByText("Inteligência"));

    const links = screen.getAllByRole("link");
    const destinos = new Set(links.map(l => l.getAttribute("href")));
    for (const url of [
      "/dashboard", "/clients", "/rotina", "/tarefas", "/planner", "/producao",
      "/campaigns", "/nichos", "/alerts", "/report-schedules",
      "/whatsapp-scheduled", "/automations", "/chat", "/cerebro", "/settings",
    ]) {
      expect(destinos).toContain(url);
    }
  });

  it("designer nao ve financeiro nem campanhas, mas ve producao", () => {
    const liberados = modulosEfetivos("designer", null);
    const destinos = urls(navPermitida((m: Modulo) => liberados.includes(m)));
    expect(destinos).toContain("/producao");
    expect(destinos).not.toContain("/financeiro");
    expect(destinos).not.toContain("/campaigns");
    expect(destinos).toContain("/settings");
  });

  it("grupo com a pagina fechada e filho liberado vira agrupador", () => {
    const nav = navPermitida((m: Modulo) => m === "alertas");
    const campanhas = nav.find(n => n.title === "Campanhas");
    expect(campanhas && "children" in campanhas ? campanhas.url : "x").toBeUndefined();
    expect(urls(nav)).toContain("/alerts");
    expect(urls(nav)).not.toContain("/campaigns");
  });

  it("grupo sem nada liberado some do menu", () => {
    const nav = navPermitida(() => false);
    expect(nav.map(n => n.title)).toEqual(["Configurações"]);
  });
});
