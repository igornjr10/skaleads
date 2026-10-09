import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReportHistory } from "./useReportHistory";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          order: () => ({ limit: () => ({ abortSignal: (signal: AbortSignal) => request(id, signal) }) }),
        }),
      }),
    }),
  },
}));

beforeEach(() => {
  request.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useReportHistory", () => {
  it("não consulta sem cliente selecionado", () => {
    const { result } = renderHook(() => useReportHistory(""));
    expect(request).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it("exibe erro do banco e permite tentar novamente", async () => {
    request.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });
    request.mockResolvedValueOnce({ data: [{ id: "report-1" }], error: null });
    const { result } = renderHook(() => useReportHistory("client-1"));
    await waitFor(() => expect(result.current.error).toContain("Não foi possível"));
    expect(result.current.loading).toBe(false);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.historico).toEqual([{ id: "report-1" }]));
    expect(result.current.error).toBeNull();
  });

  it("trata rejeição de rede", async () => {
    request.mockRejectedValueOnce(new Error("Network failure"));
    const { result } = renderHook(() => useReportHistory("client-1"));
    await waitFor(() => expect(result.current.error).toContain("Não foi possível"));
    expect(result.current.loading).toBe(false);
  });

  it("ignora a resposta do cliente anterior após trocar de cliente", async () => {
    let finishFirst!: (value: unknown) => void;
    request.mockReturnValueOnce(new Promise(resolve => { finishFirst = resolve; }));
    request.mockResolvedValueOnce({ data: [{ id: "report-2" }], error: null });
    const { result, rerender } = renderHook(({ id }) => useReportHistory(id), { initialProps: { id: "client-1" } });
    const firstSignal = request.mock.calls[0][1] as AbortSignal;
    rerender({ id: "client-2" });
    await waitFor(() => expect(result.current.historico).toEqual([{ id: "report-2" }]));
    await act(async () => { finishFirst({ data: [{ id: "report-1" }], error: null }); });
    expect(firstSignal.aborted).toBe(true);
    expect(result.current.historico).toEqual([{ id: "report-2" }]);
  });

  it("encerra o carregamento quando a requisição não responde", () => {
    vi.useFakeTimers();
    request.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useReportHistory("client-1"));
    act(() => vi.advanceTimersByTime(15_000));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toContain("demorou");
    expect((request.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
  });
});
