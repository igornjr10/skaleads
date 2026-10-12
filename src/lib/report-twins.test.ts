import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// A Edge Function nao importa de src/: as regras de periodo, frequencia e
// metricas vivem em copia la. Este teste falha se uma das copias mudar sozinha.
const PARES = [
  ["src/lib/report-metricas.ts", "supabase/functions/run-report-schedules/metricas.ts"],
  ["src/lib/report-periodo.ts", "supabase/functions/run-report-schedules/periodo.ts"],
  ["src/lib/report-agendamento.ts", "supabase/functions/run-report-schedules/agendamento.ts"],
] as const;

function ler(caminho: string) {
  return readFileSync(resolve(process.cwd(), caminho), "utf-8").replace(/\r\n/g, "\n");
}

describe("gemeos do envio agendado", () => {
  it.each(PARES)("%s e %s sao identicos", (app, funcao) => {
    expect(ler(funcao)).toBe(ler(app));
  });
});
