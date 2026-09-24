import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { email: "gestor@marketproads.com" },
    session: null,
    role: "owner",
    loading: false,
    signOut: vi.fn(),
  }),
}));

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
      "/", "/clients", "/rotina", "/tarefas", "/planner", "/producao",
      "/campaigns", "/nichos", "/alerts", "/report-schedules",
      "/whatsapp-scheduled", "/automations", "/chat", "/cerebro", "/settings",
    ]) {
      expect(destinos).toContain(url);
    }
  });
});
