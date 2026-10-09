import { describe, expect, it } from "vitest";
import { formatReportDate } from "./report-date";

describe("formatReportDate", () => {
  it.each([null, undefined, "", "invalid", "2026-99-99", {}, 123])("aceita data inválida %j sem derrubar a tela", (value) => {
    expect(formatReportDate(value)).toBe("Data indisponível");
  });

  it("formata uma data válida", () => {
    expect(formatReportDate("2026-10-09T09:20:00")).toBe("09/10/2026 09:20");
  });
});
