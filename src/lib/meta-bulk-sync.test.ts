import { beforeEach, describe, expect, it, vi } from "vitest";
import { MetaRequestError } from "@/lib/meta-fetch";

const syncClientData = vi.fn();
vi.mock("@/lib/meta-api", () => ({ syncClientData: (...args: unknown[]) => syncClientData(...args) }));

const { syncClientsSequentially, selecionarParaGravar, precisaReconectar } =
  await import("@/lib/meta-bulk-sync");
type BulkConnectClient = import("@/lib/meta-bulk-sync").BulkConnectClient;

function alvos(quantidade: number) {
  return Array.from({ length: quantidade }, (_, index) => ({
    id: `id-${index}`,
    name: `Cliente ${index}`,
    meta_ad_account_id: `100${index}`,
    meta_access_token: "token",
  }));
}

describe("syncClientsSequentially", () => {
  // Corpo em bloco de proposito: um hook que devolve funcao vira teardown no
  // Vitest, e ele chamaria o proprio mock depois do teste.
  beforeEach(() => {
    syncClientData.mockReset();
  });

  it("sincroniza todos quando nada falha", async () => {
    syncClientData.mockResolvedValue(undefined);
    const report = await syncClientsSequentially(alvos(5));

    expect(report.outcomes).toHaveLength(5);
    expect(report.outcomes.every((item) => item.ok)).toBe(true);
    expect(report.abortedReason).toBeNull();
  });

  it("falha isolada nao derruba o lote", async () => {
    syncClientData
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => { throw new Error("conta sem cargo"); })
      .mockImplementation(async () => undefined);

    const report = await syncClientsSequentially(alvos(5));

    expect(syncClientData).toHaveBeenCalledTimes(5);
    expect(report.outcomes.filter((item) => item.ok)).toHaveLength(4);
    expect(report.outcomes[1].error).toContain("conta sem cargo");
    expect(report.abortedReason).toBeNull();
  });

  it("para depois de tres falhas seguidas, para nao queimar a taxa de erro", async () => {
    syncClientData.mockImplementation(async () => { throw new Error("(#200) sem permissao"); });
    const report = await syncClientsSequentially(alvos(20));

    expect(syncClientData).toHaveBeenCalledTimes(3);
    expect(report.abortedReason).toMatch(/3 falhas seguidas/);
  });

  it("o contador de falhas seguidas zera a cada sucesso", async () => {
    const falha = async () => { throw new Error("x"); };
    syncClientData
      .mockImplementationOnce(falha)
      .mockImplementationOnce(falha)
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(falha)
      .mockImplementation(async () => undefined);

    const report = await syncClientsSequentially(alvos(6));

    expect(report.abortedReason).toBeNull();
    expect(report.outcomes).toHaveLength(6);
  });

  it("para na hora quando a Meta responde limite de taxa", async () => {
    syncClientData.mockImplementation(async () => {
      throw new MetaRequestError({ code: 17, message: "User request limit reached" }, "x");
    });
    const report = await syncClientsSequentially(alvos(20));

    expect(syncClientData).toHaveBeenCalledTimes(1);
    expect(report.abortedReason).toMatch(/limite de taxa/);
  });
});

describe("selecionarParaGravar", () => {
  const atribuicao = (accountId: string, pageId = "", instagramId = "") => ({
    accountId,
    pageId,
    instagramId,
  });

  const cliente = (over: Partial<BulkConnectClient> & { id: string }): BulkConnectClient => ({
    meta_ad_account_id: null,
    meta_page_id: null,
    meta_instagram_account_id: null,
    meta_sync_status: null,
    ...over,
  });

  it("grava quem ainda nao tinha conta", () => {
    const clients = [cliente({ id: "a" })];
    const escolhidos = selecionarParaGravar(clients, { a: atribuicao("111") });
    expect(escolhidos.map((c) => c.id)).toEqual(["a"]);
  });

  it("nao regrava vinculo saudavel que nao mudou", () => {
    const clients = [
      cliente({ id: "a", meta_ad_account_id: "111", meta_sync_status: "healthy" }),
    ];
    expect(selecionarParaGravar(clients, { a: atribuicao("111") })).toHaveLength(0);
  });

  // O caso que motivou a mudanca: 15 contas com vinculo certo e token podre.
  // Sem esta regra o login novo rodava e nao consertava ninguem, em silencio.
  it("regrava conta quebrada mesmo com o vinculo identico", () => {
    const clients = [
      cliente({ id: "a", meta_ad_account_id: "111", meta_sync_status: "error" }),
      cliente({ id: "b", meta_ad_account_id: "222", meta_sync_status: "expired" }),
      cliente({ id: "c", meta_ad_account_id: "333", meta_sync_status: "healthy" }),
    ];

    const escolhidos = selecionarParaGravar(clients, {
      a: atribuicao("111"),
      b: atribuicao("222"),
      c: atribuicao("333"),
    });

    expect(escolhidos.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("ignora conta que o login novo nao enxerga", () => {
    const clients = [
      cliente({ id: "a", meta_ad_account_id: "111", meta_sync_status: "error" }),
    ];
    // Sem accountId a Meta nao devolveu essa conta para quem logou agora.
    expect(selecionarParaGravar(clients, { a: atribuicao("") })).toHaveLength(0);
    expect(selecionarParaGravar(clients, {})).toHaveLength(0);
  });

  it("grava quando so a pagina ou o Instagram mudou", () => {
    const clients = [
      cliente({ id: "a", meta_ad_account_id: "111", meta_page_id: "p1", meta_sync_status: "healthy" }),
    ];
    expect(selecionarParaGravar(clients, { a: atribuicao("111", "p2") })).toHaveLength(1);
    expect(selecionarParaGravar(clients, { a: atribuicao("111", "p1", "ig9") })).toHaveLength(1);
  });
});

describe("precisaReconectar", () => {
  it("so aponta status que um login novo resolve", () => {
    expect(precisaReconectar({ meta_sync_status: "error" })).toBe(true);
    expect(precisaReconectar({ meta_sync_status: "expired" })).toBe(true);
    expect(precisaReconectar({ meta_sync_status: "healthy" })).toBe(false);
    expect(precisaReconectar({ meta_sync_status: "syncing" })).toBe(false);
    // `warning` e limite de taxa da Meta: passa sozinho, reconectar nao ajuda.
    expect(precisaReconectar({ meta_sync_status: "warning" })).toBe(false);
    expect(precisaReconectar({ meta_sync_status: null })).toBe(false);
  });
});
