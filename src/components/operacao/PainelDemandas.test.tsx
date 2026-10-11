import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PainelDemandas } from "./PainelDemandas";
import { montarVisaoAgencia } from "@/lib/agencia";
import type { Demanda } from "@/lib/demandas";
import type { useDemandas } from "@/hooks/useDemandas";
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ empresa: null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("./CentralOperacional", () => ({
  CentralOperacional: () => <div>Central compartilhada</div>,
}));
vi.mock("@/components/demandas/NovaDemandaDialog", () => ({
  NovaDemandaDialog: () => null,
}));
vi.mock("@/components/demandas/DemandaDetalhe", () => ({
  DemandaDetalhe: ({ demanda }: { demanda: Demanda | null }) =>
    demanda ? <div role="dialog">Detalhe: {demanda.titulo}</div> : null,
}));
const aberta: Demanda = {
  id: "a",
  titulo: "Arte atrasada",
  descricao: null,
  client_id: "c",
  assigned_to: "p",
  created_by: "p",
  company_id: "e",
  categoria: "criativo",
  checklist: [],
  prazo: "2026-10-09",
  status: "a_fazer",
  prioridade: "alta",
  concluida_at: null,
  created_at: "2026-10-10T10:00:00-03:00",
};
function painel(error: Error | null = null) {
  const fonte = {
    demandas: [
      aberta,
      {
        ...aberta,
        id: "b",
        titulo: "Relatório entregue",
        categoria: "relatorio",
        status: "concluida",
        concluida_at: "2026-10-10T11:00:00-03:00",
      },
    ],
    clientePorId: new Map([
      ["c", { id: "c", name: "Cliente A", logo_url: null }],
    ]),
    pessoaPorId: new Map([["p", { id: "p", nome: "Igor", role: "admin" }]]),
    pessoas: [{ id: "p", nome: "Igor", role: "admin" }],
    clientesDaCarteira: [],
    onboarding: [],
    loading: false,
    error,
    recarregar: vi.fn(),
    substituir: vi.fn(),
    remover: vi.fn(),
  } as unknown as ReturnType<typeof useDemandas>;
  const visao = montarVisaoAgencia({
    hoje: "2026-10-11",
    clientes: [],
    demandas: fonte.demandas,
    faturas: [],
    gastos: [],
    relatoriosRecentes: [],
    alertasAbertos: 0,
  });
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <PainelDemandas
          fonte={fonte}
          agora={new Date(2026, 9, 11, 12)}
          visao={visao}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return fonte;
}
describe("painel operacional", () => {
  it("abre o detalhe original e permite consultar concluídas pelo pipeline", () => {
    painel();
    fireEvent.click(
      screen.getAllByRole("button", { name: /Arte atrasada/ })[0],
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Detalhe: Arte atrasada",
    );
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "concluida" },
    });
    const pipeline = document.getElementById("pipeline-demandas")!;
    expect(
      within(pipeline).getByText("Relatório entregue"),
    ).toBeInTheDocument();
    expect(
      within(pipeline).queryByText("Arte atrasada"),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Buscar demandas"), {
      target: { value: "sem resultado" },
    });
    expect(
      within(pipeline).getByText("Nenhuma demanda neste filtro."),
    ).toBeInTheDocument();
  });
  it("mostra falha de atualização e oferece nova tentativa", () => {
    const fonte = painel(new Error("Falha de rede"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Os dados podem estar desatualizados",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(fonte.recarregar).toHaveBeenCalledOnce();
  });
});
