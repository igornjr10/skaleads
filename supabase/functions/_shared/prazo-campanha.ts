// Gemea de src/lib/prazo-campanha.ts: as duas precisam andar juntas.

export const STATUS_CONCLUIDA = "COMPLETED";

const PODE_CONCLUIR = new Set(["ACTIVE", "PAUSED"]);

/**
 * Na Meta a data de fim costuma morar no conjunto (orcamento vitalicio), nao na
 * campanha. Sem `stop_time`, a campanha so termina quando todos os conjuntos
 * tem fim: basta um sem data para ela seguir rodando.
 */
export function fimDaCampanha(stopTime: string | null | undefined, fimDosConjuntos: (string | null | undefined)[]): string | null {
  if (stopTime) return stopTime;
  if (!fimDosConjuntos.length || fimDosConjuntos.some((f) => !f)) return null;
  return fimDosConjuntos.reduce<string>((maior, f) => (Date.parse(f!) > Date.parse(maior) ? f! : maior), fimDosConjuntos[0]!);
}

export function statusComPrazo(status: string, fim: string | null | undefined, agora = new Date()): string {
  if (!fim || !PODE_CONCLUIR.has(status)) return status;
  return Date.parse(fim) <= agora.getTime() ? STATUS_CONCLUIDA : status;
}
