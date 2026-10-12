// Comparacao do realizado no mes com cada meta do cliente. A meta de
// resultados/custo por resultado continua em metas.ts (Cerebro usa a gemea);
// aqui entram as metas por indicador.

import { DIAS_MINIMOS, TOLERANCIA } from "./metas";

export interface MetasCliente {
  alvo_custo_mensagem: number | null;
  alvo_mensagens_mes: number | null;
  alvo_visitas_perfil_mes: number | null;
  alvo_cpc: number | null;
  alvo_faturamento_mes: number | null;
  alvo_roas: number | null;
  limite_investimento_mes: number | null;
}

export const METAS_VAZIAS: MetasCliente = {
  alvo_custo_mensagem: null,
  alvo_mensagens_mes: null,
  alvo_visitas_perfil_mes: null,
  alvo_cpc: null,
  alvo_faturamento_mes: null,
  alvo_roas: null,
  limite_investimento_mes: null,
};

export interface RealizadoMes {
  gasto: number;
  mensagens: number;
  visitasPerfil: number;
  cliques: number;
  /** Faturamento informado no financeiro; null quando o cliente nao passou. */
  faturamento: number | null;
}

export type StatusMeta = "ok" | "atencao" | "fora" | "cedo" | "sem_dado";

export interface ComparacaoMeta {
  chave: keyof MetasCliente;
  label: string;
  formato: "moeda" | "numero" | "multiplo";
  alvo: number;
  /** Valor atual (custo, ROAS) ou projetado para o fim do mes (volumes). */
  atual: number | null;
  projetado: boolean;
  /** Distancia da meta em %, positiva = pior que a meta. */
  desvioPct: number | null;
  status: StatusMeta;
  resumo: string;
  sugestoes: string[];
}

type Direcao = "menor" | "maior";

const DEF: Record<keyof MetasCliente, { label: string; formato: ComparacaoMeta["formato"]; direcao: Direcao; volume: boolean }> = {
  alvo_custo_mensagem: { label: "Custo por mensagem", formato: "moeda", direcao: "menor", volume: false },
  alvo_cpc: { label: "Custo por clique", formato: "moeda", direcao: "menor", volume: false },
  alvo_mensagens_mes: { label: "Mensagens no mês", formato: "numero", direcao: "maior", volume: true },
  alvo_visitas_perfil_mes: { label: "Visitas ao perfil no mês", formato: "numero", direcao: "maior", volume: true },
  alvo_faturamento_mes: { label: "Faturamento no mês", formato: "moeda", direcao: "maior", volume: true },
  alvo_roas: { label: "ROAS", formato: "multiplo", direcao: "maior", volume: false },
  limite_investimento_mes: { label: "Limite de investimento", formato: "moeda", direcao: "menor", volume: true },
};

const SUGESTOES: Record<keyof MetasCliente, string[]> = {
  alvo_custo_mensagem: [
    "Frequência alta e CTR caindo indicam criativo saturado: suba variações novas.",
    "Compare o CPM com o mês anterior: leilão mais caro encarece cada conversa.",
    "Revise público e posicionamentos que gastam sem gerar conversa.",
    "Confira se o botão leva direto ao WhatsApp e se a mensagem de boas-vindas está ativa.",
  ],
  alvo_cpc: [
    "CTR baixo pede criativo com gancho mais forte nos 3 primeiros segundos.",
    "CPM alto com público pequeno: amplie a segmentação ou o raio.",
    "Pause anúncios com CPC muito acima da média do conjunto.",
  ],
  alvo_mensagens_mes: [
    "Verifique se o orçamento diário comporta o volume combinado.",
    "Confira campanhas pausadas, reprovadas ou limitadas pelo saldo da conta.",
    "Se o custo por mensagem subiu, o volume cai junto: veja os criativos.",
  ],
  alvo_visitas_perfil_mes: [
    "Visita ao perfil só é contada em anúncios no Instagram: confira os posicionamentos.",
    "Use criativos com chamada para conhecer o perfil e destaque o @ no anúncio.",
    "Avalie uma campanha de tráfego para o perfil, separada das de mensagem.",
  ],
  alvo_faturamento_mes: [
    "Converse com o cliente sobre o atendimento: tempo de resposta e fechamento das conversas.",
    "Verifique se a oferta e o ticket médio continuam competitivos.",
    "Confirme se todo o faturamento vindo dos anúncios está sendo informado.",
  ],
  alvo_roas: [
    "Revise o custo por resultado e corte o que não converte.",
    "Faturamento baixo com muitas conversas aponta para o atendimento, não para a mídia.",
    "Teste oferta ou público com maior ticket médio.",
  ],
  limite_investimento_mes: [
    "Reduza o orçamento diário para fechar o mês dentro do teto.",
    "Pause primeiro os conjuntos com pior custo por resultado.",
  ],
};

function formatar(v: number, formato: ComparacaoMeta["formato"]) {
  if (formato === "moeda") return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (formato === "multiplo") return `${v.toFixed(2).replace(".", ",")}x`;
  return Math.round(v).toLocaleString("pt-BR");
}

export function temAlgumaMeta(m: MetasCliente) {
  return Object.values(m).some(v => v !== null && v !== undefined && Number(v) > 0);
}

/**
 * `diaDoMes`/`diasNoMes` projetam os volumes para o fim do mes. Antes de
 * DIAS_MINIMOS os volumes aparecem como "cedo": um dia fraco no comeco
 * derruba a projecao inteira.
 */
export function compararMetas(metas: MetasCliente, r: RealizadoMes, diaDoMes: number, diasNoMes: number): ComparacaoMeta[] {
  const julga = diaDoMes >= DIAS_MINIMOS;
  const projetar = (v: number) => (v / Math.max(diaDoMes, 1)) * diasNoMes;
  const lista: ComparacaoMeta[] = [];

  for (const chave of Object.keys(DEF) as (keyof MetasCliente)[]) {
    const alvoBruto = metas[chave];
    if (alvoBruto === null || alvoBruto === undefined || !(Number(alvoBruto) > 0)) continue;
    const alvo = Number(alvoBruto);
    const def = DEF[chave];

    let atual: number | null = null;
    switch (chave) {
      case "alvo_custo_mensagem": atual = r.mensagens > 0 ? r.gasto / r.mensagens : null; break;
      case "alvo_cpc": atual = r.cliques > 0 ? r.gasto / r.cliques : null; break;
      case "alvo_mensagens_mes": atual = projetar(r.mensagens); break;
      case "alvo_visitas_perfil_mes": atual = projetar(r.visitasPerfil); break;
      case "alvo_faturamento_mes": atual = r.faturamento === null ? null : projetar(r.faturamento); break;
      case "alvo_roas": atual = r.faturamento !== null && r.gasto > 0 ? r.faturamento / r.gasto : null; break;
      case "limite_investimento_mes": atual = projetar(r.gasto); break;
    }

    const base = { chave, label: def.label, formato: def.formato, alvo, atual, projetado: def.volume };

    if (atual === null) {
      // Custo sem nenhuma conversa: so acusa depois de gastar o equivalente a tres.
      const semConversaCara = chave === "alvo_custo_mensagem" && julga && r.gasto > alvo * 3;
      lista.push({
        ...base,
        desvioPct: null,
        status: semConversaCara ? "fora" : "sem_dado",
        resumo: semConversaCara
          ? `${formatar(r.gasto, "moeda")} investidos sem nenhuma mensagem registrada`
          : chave === "alvo_faturamento_mes" || chave === "alvo_roas"
            ? "Informe o faturamento do mês no financeiro"
            : "Ainda sem dados no mês",
        sugestoes: semConversaCara ? SUGESTOES[chave] : [],
      });
      continue;
    }

    const desvioPct = def.direcao === "menor" ? ((atual - alvo) / alvo) * 100 : ((alvo - atual) / alvo) * 100;
    const status: StatusMeta = def.volume && !julga ? "cedo"
      : desvioPct <= 0 ? "ok"
      : desvioPct <= TOLERANCIA * 100 ? "atencao"
      : "fora";

    const abs = Math.abs(Math.round(desvioPct));
    let resumo: string;
    if (status === "cedo") {
      resumo = `Projeção ${formatar(atual, def.formato)} · cedo para avaliar`;
    } else if (chave === "limite_investimento_mes") {
      resumo = desvioPct > 0
        ? `Projeção de ${formatar(atual, "moeda")}: ${abs}% acima do limite`
        : `Projeção de ${formatar(atual, "moeda")}, dentro do limite`;
    } else if (def.direcao === "menor") {
      resumo = desvioPct > 0 ? `${abs}% acima da meta` : desvioPct < 0 ? `${abs}% abaixo da meta` : "Na meta";
    } else {
      const prefixo = def.volume ? "Projeção " : "";
      resumo = desvioPct > 0 ? `${prefixo}${abs}% abaixo da meta` : desvioPct < 0 ? `${prefixo}${abs}% acima da meta` : "Na meta";
    }

    lista.push({
      ...base,
      desvioPct,
      status,
      resumo,
      sugestoes: status === "fora" || status === "atencao" ? SUGESTOES[chave] : [],
    });
  }
  return lista;
}

export { formatar as formatarMeta };
