import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { credencialDaPagina, credencialDoCliente, MetaRequestError, metaGet, metaGetAll } from "./meta-fetch";

const ID = "3f2b8c1e-9a4d-4e21-b6f0-1c2d3e4f5a6b";
const BASE = "https://graph.facebook.com/v23.0";

afterEach(() => {
  invoke.mockReset();
  vi.unstubAllGlobals();
});

describe("chamada com credencial do cofre", () => {
  it("vai pelo meta-proxy e nunca chama a Graph API do browser", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    invoke.mockResolvedValue({ data: { id: "act_1" }, error: null });

    await metaGet(BASE, "act_1", { fields: "id", access_token: credencialDoCliente(ID) });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("meta-proxy", {
      body: { clientId: ID, tipo: "conta", versao: "v23.0", path: "act_1", params: { fields: "id" }, mode: "object" },
    });
  });

  it("lista pagina no servidor e usa o token da Pagina quando pedido", async () => {
    invoke.mockResolvedValue({ data: { data: [{ id: "a" }, { id: "b" }] }, error: null });
    const itens = await metaGetAll(BASE, "123/insights", { access_token: credencialDaPagina(ID) });
    expect(itens).toEqual([{ id: "a" }, { id: "b" }]);
    expect(invoke.mock.calls[0][1].body).toMatchObject({ tipo: "pagina", mode: "list" });
  });

  it("devolve o erro da Meta com o codigo, para o retry por volume funcionar", async () => {
    const resposta = new Response(JSON.stringify({ error: "x", metaError: { message: "Please reduce the amount of data", code: 1 } }));
    invoke.mockResolvedValue({ data: null, error: { message: "Edge Function returned a non-2xx status code", context: resposta } });
    const erro = await metaGet(BASE, "act_1", { access_token: credencialDoCliente(ID) }).catch(e => e);
    expect(erro).toBeInstanceOf(MetaRequestError);
    expect(erro.code).toBe(1);
    expect(erro.retryable).toBe(true);
  });
});

describe("token cru (fluxo de conexao)", () => {
  it("continua chamando a Graph API direto", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "me" })));
    vi.stubGlobal("fetch", fetchSpy);
    await metaGet(BASE, "me", { access_token: "EAAtokencru" });
    expect(invoke).not.toHaveBeenCalled();
    expect(fetchSpy.mock.calls[0][0]).toContain("access_token=EAAtokencru");
  });
});
