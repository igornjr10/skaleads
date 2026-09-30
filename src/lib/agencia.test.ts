import { describe, expect, it } from "vitest";
import { type ClienteAgencia, type EntradaVisao, faturaVencida, montarVisaoAgencia } from "./agencia";

function cliente(id: string, parcial: Partial<ClienteAgencia> = {}): ClienteAgencia {
  return {
    id,
    name: id.toUpperCase(),
    status: "active",
    meta_sync_status: "healthy",
    meta_ad_account_id: `act_${id}`,
    meta_balance_cents: 100_000,
    ...parcial,
  };
}

function entrada(parcial: Partial<EntradaVisao>): EntradaVisao {
  return {
    hoje: "2026-09-15",
    clientes: [],
    faturas: [],
    gastos: [],
    demandas: [],
    relatoriosRecentes: [],
    alertasAbertos: 0,
    ...parcial,
  };
}

describe("faturaVencida", () => {
  it("aberta com vencimento passado ja conta como vencida", () => {
    const f = { client_id: "a", due_date: "2026-09-10", amount: 100, status: "aberta", paid_at: null, paid_amount: null };
    expect(faturaVencida(f, "2026-09-15")).toBe(true);
    expect(faturaVencida({ ...f, due_date: "2026-09-15" }, "2026-09-15")).toBe(false);
    expect(faturaVencida({ ...f, status: "paga" }, "2026-09-15")).toBe(false);
  });
});

describe("montarVisaoAgencia", () => {
  it("compara o gasto com o mesmo trecho do mes anterior", () => {
    const v = montarVisaoAgencia(entrada({
      gastos: [
        { client_id: "a", date: "2026-09-01", spend: 100 },
        { client_id: "a", date: "2026-09-15", spend: 100 },
        { client_id: "a", date: "2026-08-10", spend: 100 },
        { client_id: "a", date: "2026-08-20", spend: 999 }, // depois do dia 15: fora da comparacao
      ],
    }));
    expect(v.investimento.mes).toBe(200);
    expect(v.investimento.mesAnterior).toBe(100);
    expect(v.investimento.variacao).toBe(1);
  });

  it("no dia 31 compara com o mes anterior inteiro quando ele e mais curto", () => {
    const v = montarVisaoAgencia(entrada({
      hoje: "2026-10-31",
      gastos: [{ client_id: "a", date: "2026-09-30", spend: 50 }],
    }));
    expect(v.investimento.mesAnterior).toBe(50);
  });

  it("junta os motivos de atencao por cliente e ordena pelos mais graves", () => {
    const v = montarVisaoAgencia(entrada({
      clientes: [
        cliente("a", { meta_balance_cents: 1_000, meta_sync_status: "expired" }),
        cliente("b"),
        cliente("c", { status: "inactive", meta_balance_cents: 0 }),
      ],
      faturas: [
        { client_id: "a", due_date: "2026-09-01", amount: 500, status: "vencida", paid_at: null, paid_amount: null },
        { client_id: "c", due_date: "2026-09-01", amount: 300, status: "aberta", paid_at: null, paid_amount: null },
      ],
      relatoriosRecentes: ["b"],
    }));
    expect(v.atencao.map(a => a.id)).toEqual(["a", "c"]);
    expect(v.atencao[0].motivos).toEqual(["fatura_vencida", "saldo_baixo", "meta_desconectada", "sem_relatorio"]);
    // Inativo: so a divida conta.
    expect(v.atencao[1].motivos).toEqual(["fatura_vencida"]);
    expect(v.financeiro.vencido).toBe(800);
    expect(v.financeiro.clientesInadimplentes).toBe(2);
  });

  it("conta carga por pessoa com atrasadas primeiro", () => {
    const v = montarVisaoAgencia(entrada({
      demandas: [
        { status: "fazendo", prazo: "2026-09-01", assigned_to: "joao" },
        { status: "a_fazer", prazo: null, assigned_to: "pedro" },
        { status: "a_fazer", prazo: null, assigned_to: "pedro" },
        { status: "concluida", prazo: "2026-09-01", assigned_to: "joao" },
        { status: "revisao", prazo: "2026-09-30", assigned_to: null },
      ],
    }));
    expect(v.demandas.abertas).toBe(4);
    expect(v.demandas.atrasadas).toBe(1);
    expect(v.demandas.emRevisao).toBe(1);
    expect(v.demandas.carga[0]).toEqual({ pessoa: "joao", abertas: 1, atrasadas: 1 });
    expect(v.demandas.carga[1]).toEqual({ pessoa: "pedro", abertas: 2, atrasadas: 0 });
  });

  it("recebido usa o valor pago quando existe", () => {
    const v = montarVisaoAgencia(entrada({
      faturas: [{ client_id: "a", due_date: "2026-09-05", amount: 500, status: "paga", paid_at: "2026-09-06T10:00:00Z", paid_amount: 450 }],
    }));
    expect(v.financeiro.recebido).toBe(450);
  });

  it("conta quem esta abaixo da meta e poe na lista de atencao", () => {
    const gastos = Array.from({ length: 15 }, (_, i) => ({
      client_id: "a", date: `2026-09-${String(i + 1).padStart(2, "0")}`, spend: 30, leads: 1,
    }));
    const v = montarVisaoAgencia(entrada({
      clientes: [cliente("a", { alvo_resultados_mes: 100 }), cliente("b")],
      gastos,
      relatoriosRecentes: ["a", "b"],
    }));
    expect(v.metas).toEqual({ comMeta: 1, abaixo: 1 });
    expect(v.atencao.find(c => c.id === "a")?.motivos).toContain("abaixo_da_meta");
  });
});
