// Gemea de supabase/functions/_shared/prazo-campanha.ts: as duas precisam andar juntas.

export const STATUS_CONCLUIDA = "COMPLETED";

const PODE_CONCLUIR = new Set(["ACTIVE", "PAUSED"]);
const DIA_MS = 86_400_000;

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

export type TomPrazo = "concluida" | "urgente" | "proximo" | "tranquilo" | "sem_data";

export interface Prazo {
  tom: TomPrazo;
  /** "Faltam 2 dias para encerrar", "Encerra hoje", "Encerrada há 3 dias"... */
  aviso: string;
  /** Data de encerramento formatada, ou null sem data definida. */
  data: string | null;
  /** Dias de calendario ate o fim; negativo quando ja passou. */
  dias: number | null;
}

function inicioDoDia(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function plural(n: number, um: string, varios: string) {
  return n === 1 ? `1 ${um}` : `${n} ${varios}`;
}

// Conta dias de calendario, nao blocos de 24h: quem encerra amanha as 8h "falta 1 dia", mesmo faltando 14 horas.
export function prazoDaCampanha(fim: string | null | undefined, status: string, agora = new Date()): Prazo {
  if (!fim) return { tom: "sem_data", aviso: "Sem data de término", data: null, dias: null };

  const fimDate = new Date(fim);
  const data = fimDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    + " às " + fimDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dias = Math.round((inicioDoDia(fimDate) - inicioDoDia(agora)) / DIA_MS);

  if (fimDate.getTime() <= agora.getTime() || status === STATUS_CONCLUIDA) {
    const passou = Math.max(0, -dias);
    const aviso = passou === 0 ? "Encerrada hoje" : passou === 1 ? "Encerrada ontem" : `Encerrada há ${passou} dias`;
    return { tom: "concluida", aviso, data, dias };
  }

  if (dias === 0) {
    const horas = Math.max(1, Math.ceil((fimDate.getTime() - agora.getTime()) / 3_600_000));
    return { tom: "urgente", aviso: `Encerra hoje (${plural(horas, "hora", "horas")})`, data, dias };
  }
  if (dias === 1) return { tom: "urgente", aviso: "Encerra amanhã", data, dias };

  const aviso = `Faltam ${dias} dias para encerrar`;
  return { tom: dias <= 3 ? "urgente" : dias <= 7 ? "proximo" : "tranquilo", aviso, data, dias };
}
