export const AUTOMACOES_OPERACIONAIS = [
  {
    id: "prazo",
    nome: "Vencimento de demandas",
    descricao: "Avisar no dia anterior ou duas horas antes do horário limite.",
  },
  {
    id: "atraso",
    nome: "Demandas atrasadas",
    descricao: "Avisar sobre entregas que ultrapassaram a data limite.",
  },
  {
    id: "criativo",
    nome: "Criativos pendentes",
    descricao: "Avisar sobre artes, vídeos e copies atrasados.",
  },
  {
    id: "parada",
    nome: "Demandas sem atualização",
    descricao: "Sinalizar pendências sem movimentação por vários dias.",
  },
  {
    id: "carga",
    nome: "Carga de trabalho",
    descricao:
      "Avisar quando a quantidade de pendências exceder o limite configurado.",
  },
  {
    id: "reuniao",
    nome: "Lembretes de reuniões",
    descricao:
      "Usar as demandas de reunião e seus prazos para lembrar os responsáveis.",
  },
  {
    id: "resumo",
    nome: "Resumo diário",
    descricao:
      "Consolidar as pendências, entregas da semana e prioridades dos destinatários.",
  },
] as const;
export type TipoAutomacao = (typeof AUTOMACOES_OPERACIONAIS)[number]["id"];
export interface RegraOperacional {
  company_id: string;
  tipo: TipoAutomacao;
  ativa: boolean;
  horario: string;
  antecedencia_horas: number;
  dias_parada: number;
  limite_carga: number;
  destinatarios: string[];
  whatsapp: boolean;
  updated_at: string;
}
export interface AvisoOperacional {
  id: string;
  company_id: string;
  autor_id: string;
  tipo: string;
  texto: string;
  resolvido_at: string | null;
  created_at: string;
}
export interface ExecucaoOperacional {
  id: string;
  company_id: string;
  tipo: string;
  chave: string;
  destinatario: string;
  titulo: string;
  mensagem: string;
  created_at: string;
  whatsapp_status: string;
  erro: string | null;
}
export function regraPadrao(
  company_id: string,
  tipo: TipoAutomacao,
): RegraOperacional {
  return {
    company_id,
    tipo,
    ativa: false,
    horario: "08:00",
    antecedencia_horas: 24,
    dias_parada: 3,
    limite_carga: 10,
    destinatarios: [],
    whatsapp: false,
    updated_at: "",
  };
}
