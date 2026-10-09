import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

afterEach(() => vi.restoreAllMocks());

it("preserva a navegação, mostra o erro e permite tentar novamente", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let fail = true;
  function Report() {
    if (fail) throw new RangeError("Invalid time value");
    return <p>Relatório disponível</p>;
  }
  render(<><nav>Menu</nav><ErrorBoundary><Report /></ErrorBoundary></>);
  expect(screen.getByRole("navigation")).toHaveTextContent("Menu");
  expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível mostrar esta página");
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(screen.getByText("Relatório disponível")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
