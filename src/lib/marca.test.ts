import { describe, expect, it } from "vitest";
import { aplicarCorDaMarca, hexParaHsl } from "./marca";

describe("hexParaHsl", () => {
  it("converte cores conhecidas", () => {
    expect(hexParaHsl("#ffffff")).toBe("0 0% 100%");
    expect(hexParaHsl("#000000")).toBe("0 0% 0%");
    expect(hexParaHsl("#ff0000")).toBe("0 100% 50%");
    expect(hexParaHsl("#3b82f6")).toBe("217 91% 60%");
  });

  it("aceita maiusculas e espacos nas pontas", () => {
    expect(hexParaHsl(" #3B82F6 ")).toBe("217 91% 60%");
  });

  it("recusa o que nao e #rrggbb", () => {
    expect(hexParaHsl("3b82f6")).toBeNull();
    expect(hexParaHsl("#fff")).toBeNull();
    expect(hexParaHsl("blue")).toBeNull();
  });
});

describe("aplicarCorDaMarca", () => {
  it("grava a cor nas variaveis do tema e remove com null", () => {
    const el = document.createElement("div");
    aplicarCorDaMarca("#ff0000", el);
    expect(el.style.getPropertyValue("--primary")).toBe("0 100% 50%");
    expect(el.style.getPropertyValue("--ring")).toBe("0 100% 50%");

    aplicarCorDaMarca(null, el);
    expect(el.style.getPropertyValue("--primary")).toBe("");
  });
});
