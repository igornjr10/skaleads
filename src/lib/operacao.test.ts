import { describe, expect, it } from "vitest";
import { analisarOperacao } from "./operacao";
import type { Demanda } from "./demandas";
const agora = new Date(2026, 9, 11, 12);
const tarefa = (id: string, extra: Partial<Demanda> = {}): Demanda => ({
  id,
  titulo: id,
  descricao: null,
  client_id: null,
  status: "a_fazer",
  prioridade: "media",
  categoria: "outro",
  checklist: [],
  prazo: null,
  assigned_to: "pessoa",
  created_by: null,
  company_id: "empresa",
  concluida_at: null,
  created_at: "2026-10-11T09:00:00-03:00",
  ...extra,
});
describe("análise da operação", () => {
  it("deduplica por id e não conta entregas concluídas como atraso", () => {
    const aberta = tarefa("a", { prazo: "2026-10-10" });
    const a = analisarOperacao(
      [
        aberta,
        aberta,
        tarefa("b", {
          prazo: "2026-10-01",
          status: "concluida",
          concluida_at: "2026-10-08T10:00:00-03:00",
        }),
      ],
      agora,
    );
    expect(a.demandas).toHaveLength(2);
    expect(a.atrasadas).toHaveLength(1);
    expect(a.concluidasSemana).toHaveLength(1);
  });
  it("usa data de conclusão e semana de segunda a domingo", () => {
    const a = analisarOperacao(
      [
        tarefa("antiga", {
          status: "concluida",
          concluida_at: "2026-10-04T10:00:00-03:00",
        }),
        tarefa("futura", {
          status: "concluida",
          concluida_at: "2026-10-12T10:00:00-03:00",
        }),
      ],
      agora,
    );
    expect(a.concluidasSemana).toHaveLength(0);
  });
  it("distingue atrasos de vencimentos próximos e mantém sem prazo na fila", () => {
    const a = analisarOperacao(
      [
        tarefa("hoje", { prazo: "2026-10-11" }),
        tarefa("depois", { prazo: "2026-10-14" }),
        tarefa("sem"),
        tarefa("atraso", { prazo: "2026-10-10" }),
      ],
      agora,
    );
    expect(a.proximas.map((d) => d.id)).toEqual(["hoje"]);
    expect(a.prioridades[0].id).toBe("atraso");
    expect(a.prioridades[a.prioridades.length - 1]?.id).toBe("sem");
  });
  it("identifica material atrasado, tarefa parada e falta de responsável sem inferir bloqueios", () => {
    const a = analisarOperacao(
      [
        tarefa("arte", {
          categoria: "criativo",
          prazo: "2026-10-10",
          client_id: "cliente",
          updated_at: "2026-10-01T10:00:00-03:00",
          assigned_to: null,
        }),
      ],
      agora,
    );
    expect(a.gargalos.map((g) => g.id)).toEqual([
      "sem-responsavel",
      "criativo:cliente",
      "parada:arte",
    ]);
    expect(a.gargalos.every((g) => g.impacto && g.sugestao)).toBe(true);
  });
  it("aplica limite de carga e exclui reuniões entregues", () => {
    const a = analisarOperacao(
      [
        tarefa("a"),
        tarefa("b"),
        tarefa("c", { categoria: "reuniao", prazo: "2026-10-12" }),
        tarefa("d", {
          categoria: "reuniao",
          prazo: "2026-10-12",
          status: "concluida",
        }),
      ],
      agora,
      3,
    );
    expect(a.carga[0].sobrecarga).toBe(true);
    expect(a.reunioes.map((d) => d.id)).toEqual(["c"]);
  });
});
