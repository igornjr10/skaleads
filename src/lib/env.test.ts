import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MissingEnvError } from "./env-error";
import { renderFatal } from "./fatal-screen";

describe("env", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lanca listando o que faltou quando a variavel nao veio no build", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");

    // `vi.resetModules()` recarrega o `env-error`, entao a classe aqui e outra
    // identidade e `instanceof` nao vale - por isso a checagem e pelo `name`.
    await expect(import("./env")).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error &&
        error.name === "MissingEnvError" &&
        (error as MissingEnvError).missing.includes("VITE_SUPABASE_URL") &&
        (error as MissingEnvError).missing.includes("VITE_SUPABASE_PUBLISHABLE_KEY"),
    );
  });

  it("nao lanca por VITE_META_APP_ID, que so afeta a conexao Meta", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "chave");
    vi.stubEnv("VITE_META_APP_ID", "");

    const env = await import("./env");
    expect(env.META_APP_ID).toBe("");
    expect(env.SUPABASE_URL).toBe("https://exemplo.supabase.co");
  });

  it("trata valor so com espaco como ausente", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "   ");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "chave");

    await expect(import("./env")).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error &&
        error.name === "MissingEnvError" &&
        (error as MissingEnvError).missing.length === 1,
    );
  });
});

describe("renderFatal", () => {
  it("troca a tela branca por uma tela que nomeia as variaveis faltando", () => {
    const root = document.createElement("div");

    renderFatal(root, new MissingEnvError(["VITE_SUPABASE_URL"]));

    expect(root.textContent).toContain("Configuracao do deploy incompleta");
    expect(root.textContent).toContain("VITE_SUPABASE_URL");
    expect(root.textContent).toContain("Environment Variables");
  });

  it("mostra mensagem generica para erro que nao e de env", () => {
    const root = document.createElement("div");

    renderFatal(root, new Error("qualquer outra falha"));

    expect(root.textContent).toContain("Nao foi possivel iniciar o app");
    expect(root.textContent).toContain("qualquer outra falha");
  });
});
