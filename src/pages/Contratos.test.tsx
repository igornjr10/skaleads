import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import Contratos from "./Contratos";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), invoke: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: "admin" }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from, functions: { invoke: mocks.invoke } },
}));

const connected = { empresa: "company-1", token_configurado: true, webhook_configurado: false };

function rpcResponse(data: unknown, error: unknown = null) {
  return { abortSignal: () => Promise.resolve({ data, error }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation(() => ({
    select: () => ({ order: () => rpcResponse([]) }),
  }));
  mocks.rpc.mockImplementation(function (this: unknown, name: string) {
    if (this !== supabase) throw new TypeError("RPC sem contexto do Supabase");
    return name === "autentique_situacao" ? rpcResponse([connected]) : Promise.resolve({ error: null });
  });
  mocks.invoke.mockResolvedValue({ data: { ok: true, gravados: 0 }, error: null });
});

afterEach(cleanup);

function openConfig() {
  fireEvent.click(screen.getByRole("button", { name: "Configurar Autentique" }));
  return screen.getByRole("dialog");
}

describe("configuração da Autentique", () => {
  it("abre enquanto a consulta está pendente e exibe o formulário quando termina", async () => {
    let finish!: (value: unknown) => void;
    const pending = new Promise(resolve => { finish = resolve; });
    mocks.rpc.mockImplementationOnce(function (this: unknown) {
      expect(this).toBe(supabase);
      return { abortSignal: () => pending };
    });
    render(<Contratos />);
    const dialog = openConfig();
    expect(within(dialog).getByRole("status")).toHaveTextContent("Carregando configuração");
    await act(async () => { finish({ data: [connected], error: null }); });
    expect(within(dialog).getByLabelText(/Token da API/)).toBeInTheDocument();
  });

  it("mostra falha da consulta no diálogo e permite recuperar", async () => {
    mocks.rpc.mockImplementationOnce(() => rpcResponse(null, { message: "permission denied" }));
    render(<Contratos />);
    const dialog = openConfig();
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("Não foi possível consultar"));
    expect(within(dialog).getByRole("button", { name: "Salvar" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(within(dialog).getByLabelText(/Token da API/)).toBeInTheDocument());
  });

  it("explica a falta de empresa ao abrir", async () => {
    mocks.rpc.mockImplementationOnce(() => rpcResponse([{ ...connected, empresa: null }]));
    render(<Contratos />);
    const dialog = openConfig();
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("não está vinculado a uma empresa"));
    expect(within(dialog).getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("salva usando o cliente Supabase e libera o botão após falha de rede", async () => {
    render(<Contratos />);
    const dialog = openConfig();
    await waitFor(() => expect(within(dialog).getByLabelText(/Segredo do webhook/)).toBeInTheDocument());
    fireEvent.change(within(dialog).getByLabelText(/Segredo do webhook/), { target: { value: "segredo-de-teste" } });
    mocks.rpc.mockImplementationOnce(function (this: unknown) {
      expect(this).toBe(supabase);
      return Promise.reject(new Error("Falha de rede"));
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Falha de rede"));
    expect(within(dialog).getByRole("button", { name: "Salvar" })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Autentique configurada"));
    expect(mocks.rpc).toHaveBeenCalledWith("configurar_autentique", { _token: null, _webhook_secret: "segredo-de-teste" });
  });

  it("renderiza o status dos signatários sem confundir com a configuração", async () => {
    mocks.from.mockImplementation((table: string) => ({
      select: () => ({ order: () => rpcResponse(table === "contratos" ? [{
        id: "contract-1", nome: "Contrato teste", status: "pendente", client_id: "client-1",
        signatarios: [{ nome: "Cliente", email: null, visto_em: null, assinado_em: null, recusado_em: null }],
      }] : []) }),
    }));
    render(<Contratos />);
    expect(await screen.findByText("ainda não abriu")).toBeInTheDocument();
    expect(openConfig()).toBeInTheDocument();
  });
});
