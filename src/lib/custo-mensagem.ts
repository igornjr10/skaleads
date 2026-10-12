// Custo medio por mensagem da agencia: investimento das campanhas de
// mensagens ÷ mensagens que elas geraram. Objetivos diferentes nao entram na
// conta (reconhecimento nao gera conversa e puxaria o custo para cima).

export interface CampanhaCusto {
  client_id: string;
  objective: string | null;
  spend: number;
  messages: number | null;
}

export interface ClienteCusto {
  id: string;
  name: string;
  alvo_custo_mensagem?: number | null;
}

export interface DiaCliente {
  client_id: string;
  date: string;
  spend: number;
  messages: number;
}

const SEM_CONVERSA = new Set([
  "OUTCOME_AWARENESS", "BRAND_AWARENESS", "REACH", "VIDEO_VIEWS", "OUTCOME_APP_PROMOTION", "APP_INSTALLS",
]);

/** Campanha que entra no custo por mensagem. */
export function eCampanhaDeMensagem(c: Pick<CampanhaCusto, "objective" | "messages">) {
  const obj = (c.objective ?? "").toUpperCase();
  if (obj === "MESSAGES") return true;
  return (Number(c.messages) || 0) > 0 && !SEM_CONVERSA.has(obj);
}

export interface LinhaCliente {
  clientId: string;
  nome: string;
  investimento: number;
  mensagens: number;
  custo: number | null;
  meta: number | null;
  /** Distancia da meta em %, positiva = mais caro que a meta. */
  desvioPct: number | null;
  /** Fatia do investimento do cliente que foi para campanhas de mensagem. */
  fatiaMensagens: number;
}

export interface ResumoCustoMensagem {
  investimento: number;
  mensagens: number;
  custoMedio: number | null;
  /** Media simples do custo dos clientes (cada cliente pesa igual). */
  mediaPorCliente: number | null;
  clientes: LinhaCliente[];
  acimaDaMeta: number;
  abaixoDaMeta: number;
  semMeta: number;
}

export function resumirCustoMensagem(campanhas: CampanhaCusto[], clientes: ClienteCusto[]): ResumoCustoMensagem {
  const porCliente = new Map<string, { inv: number; msg: number; total: number }>();
  for (const c of campanhas) {
    const atual = porCliente.get(c.client_id) ?? { inv: 0, msg: 0, total: 0 };
    const gasto = Number(c.spend) || 0;
    atual.total += gasto;
    if (eCampanhaDeMensagem(c)) {
      atual.inv += gasto;
      atual.msg += Number(c.messages) || 0;
    }
    porCliente.set(c.client_id, atual);
  }

  const nomes = new Map(clientes.map(c => [c.id, c]));
  const linhas: LinhaCliente[] = [];
  for (const [clientId, v] of porCliente) {
    const cli = nomes.get(clientId);
    if (!cli || v.inv <= 0) continue;
    const custo = v.msg > 0 ? v.inv / v.msg : null;
    const meta = cli.alvo_custo_mensagem ? Number(cli.alvo_custo_mensagem) : null;
    linhas.push({
      clientId,
      nome: cli.name,
      investimento: v.inv,
      mensagens: v.msg,
      custo,
      meta,
      desvioPct: meta && custo !== null ? ((custo - meta) / meta) * 100 : null,
      fatiaMensagens: v.total > 0 ? v.inv / v.total : 0,
    });
  }
  linhas.sort((a, b) => (b.custo ?? Infinity) - (a.custo ?? Infinity));

  const investimento = linhas.reduce((s, l) => s + l.investimento, 0);
  const mensagens = linhas.reduce((s, l) => s + l.mensagens, 0);
  const comCusto = linhas.filter(l => l.custo !== null);
  return {
    investimento,
    mensagens,
    custoMedio: mensagens > 0 ? investimento / mensagens : null,
    mediaPorCliente: comCusto.length ? comCusto.reduce((s, l) => s + (l.custo as number), 0) / comCusto.length : null,
    clientes: linhas,
    acimaDaMeta: linhas.filter(l => l.desvioPct !== null && l.desvioPct > 0).length,
    abaixoDaMeta: linhas.filter(l => l.desvioPct !== null && l.desvioPct <= 0).length,
    semMeta: linhas.filter(l => l.meta === null).length,
  };
}

/** Clientes cuja conta e quase so mensagem: a serie diaria da conta representa o custo por mensagem. */
export const FATIA_MINIMA_SERIE = 0.8;

export interface PontoSemana {
  semana: string;
  investimento: number;
  mensagens: number;
  custo: number | null;
}

/** Semana (segunda-feira) de uma data yyyy-mm-dd. */
export function segundaDaSemana(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  const dia = (data.getUTCDay() + 6) % 7;
  data.setUTCDate(data.getUTCDate() - dia);
  return data.toISOString().slice(0, 10);
}

export function evolucaoSemanal(dias: DiaCliente[], clientesDaSerie: Set<string>): PontoSemana[] {
  const semanas = new Map<string, { inv: number; msg: number }>();
  for (const d of dias) {
    if (!clientesDaSerie.has(d.client_id)) continue;
    const s = segundaDaSemana(d.date);
    const atual = semanas.get(s) ?? { inv: 0, msg: 0 };
    atual.inv += Number(d.spend) || 0;
    atual.msg += Number(d.messages) || 0;
    semanas.set(s, atual);
  }
  return [...semanas.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([semana, v]) => ({ semana, investimento: v.inv, mensagens: v.msg, custo: v.msg > 0 ? v.inv / v.msg : null }));
}
