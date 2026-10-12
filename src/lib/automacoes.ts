// Catalogo da Central de Automacoes. Os padroes sao gemeos de
// supabase/functions/_shared/automacoes.ts (quem aplica a regra e o servidor);
// o teste automacoes-regras.test.ts compara os dois.

export type ChaveAutomacao =
  | "prazo_proximo"
  | "atrasadas"
  | "criativos_pendentes"
  | "parada"
  | "aguardando_cliente"
  | "sobrecarga"
  | "reunioes"
  | "metas"
  | "resumo_diario"
  | "onboarding"
  | "rotinas";

export interface ConfigAutomacao {
  ativa: boolean;
  whatsapp: boolean;
  config: Record<string, unknown>;
}

export const FASES_ONBOARDING = [
  { id: "acessos", label: "Acessos" },
  { id: "rastreamento", label: "Rastreamento" },
  { id: "estrategia", label: "Estratégia" },
  { id: "operacao", label: "Operação" },
] as const;

export const PADROES_AUTOMACAO: Record<ChaveAutomacao, ConfigAutomacao> = {
  prazo_proximo: { ativa: true, whatsapp: false, config: { antecedencia_horas: 2, aviso_vespera: true, copiar_para: [] } },
  atrasadas: { ativa: true, whatsapp: false, config: { avisar_solicitante: true, copiar_para: [] } },
  criativos_pendentes: { ativa: true, whatsapp: false, config: { dias_antes: 1 } },
  parada: { ativa: true, whatsapp: false, config: { dias: 3 } },
  aguardando_cliente: { ativa: true, whatsapp: false, config: { dias: 2 } },
  sobrecarga: { ativa: true, whatsapp: false, config: { limite_abertas: 12, limite_atrasadas: 3, destinatarios: [] } },
  reunioes: { ativa: true, whatsapp: false, config: { antecedencia_min: 60, pedir_registro: true } },
  metas: { ativa: true, whatsapp: false, config: { periodicidade: "semanal", destinatarios: [] } },
  resumo_diario: { ativa: true, whatsapp: false, config: { hora: 8, resumo_gestao: true, destinatarios: [] } },
  onboarding: {
    ativa: false,
    whatsapp: false,
    config: { responsaveis: {}, prazos: { acessos: 2, rastreamento: 5, estrategia: 7, operacao: 10 }, exigir_aprovacao: true },
  },
  rotinas: { ativa: true, whatsapp: false, config: {} },
};

export type Campo =
  | { tipo: "numero"; chave: string; rotulo: string; sufixo?: string; min?: number; max?: number }
  | { tipo: "sim_nao"; chave: string; rotulo: string }
  | { tipo: "opcoes"; chave: string; rotulo: string; opcoes: { valor: string; rotulo: string }[] }
  | { tipo: "pessoas"; chave: string; rotulo: string; vazio: string }
  | { tipo: "onboarding" };

export interface ItemCatalogo {
  chave: ChaveAutomacao;
  grupo: "Demandas" | "Equipe" | "Clientes" | "Rotina";
  titulo: string;
  descricao: string;
  /** Quem recebe, em linguagem de gente. */
  quem: string;
  quando: string;
  campos: Campo[];
  /** Pode mandar no WhatsApp do colaborador (numero em Configuracoes > Equipe). */
  whatsapp: boolean;
  /** Mexe em dado (responsavel, prazo): pode exigir aprovacao. */
  alteraDados?: boolean;
}

export const CATALOGO: ItemCatalogo[] = [
  {
    chave: "prazo_proximo",
    grupo: "Demandas",
    titulo: "Aviso de prazo",
    descricao: "Lembra o responsável na véspera, no dia e algumas horas antes do horário de entrega.",
    quem: "Responsável pela demanda",
    quando: "Véspera, manhã do dia e X horas antes do horário",
    campos: [
      { tipo: "numero", chave: "antecedencia_horas", rotulo: "Avisar antes do horário", sufixo: "horas", min: 0, max: 24 },
      { tipo: "sim_nao", chave: "aviso_vespera", rotulo: "Avisar também na véspera" },
      { tipo: "pessoas", chave: "copiar_para", rotulo: "Também avisar", vazio: "Ninguém além do responsável" },
    ],
    whatsapp: true,
  },
  {
    chave: "atrasadas",
    grupo: "Demandas",
    titulo: "Demanda atrasada",
    descricao: "Quando o prazo passa sem entrega, avisa uma vez e a demanda fica destacada na Visão da agência.",
    quem: "Responsável e quem pediu",
    quando: "Assim que o prazo (ou o horário) passa",
    campos: [
      { tipo: "sim_nao", chave: "avisar_solicitante", rotulo: "Avisar também quem pediu" },
      { tipo: "pessoas", chave: "copiar_para", rotulo: "Também avisar", vazio: "Ninguém além deles" },
    ],
    whatsapp: true,
  },
  {
    chave: "criativos_pendentes",
    grupo: "Demandas",
    titulo: "Criativo pendente",
    descricao: "Arte ou vídeo perto do prazo que ainda não foi para revisão: quem pediu fica sabendo antes de virar atraso.",
    quem: "Quem pediu o material",
    quando: "X dias antes do prazo, se ainda não entregue",
    campos: [{ tipo: "numero", chave: "dias_antes", rotulo: "Avisar com antecedência de", sufixo: "dias", min: 0, max: 7 }],
    whatsapp: true,
  },
  {
    chave: "parada",
    grupo: "Demandas",
    titulo: "Demanda parada",
    descricao: "Demanda sem nenhuma atualização há dias. Se está em revisão, cobra quem precisa aprovar.",
    quem: "Responsável (ou quem pediu, se está em revisão)",
    quando: "Depois de X dias sem atualização",
    campos: [{ tipo: "numero", chave: "dias", rotulo: "Considerar parada após", sufixo: "dias", min: 1, max: 30 }],
    whatsapp: true,
  },
  {
    chave: "aguardando_cliente",
    grupo: "Clientes",
    titulo: "Material do cliente",
    descricao: "Entrega marcada como \"aguardando o cliente\" há dias: lembra de cobrar o material.",
    quem: "Responsável e quem pediu",
    quando: "Depois de X dias aguardando",
    campos: [{ tipo: "numero", chave: "dias", rotulo: "Cobrar após", sufixo: "dias", min: 1, max: 30 }],
    whatsapp: true,
  },
  {
    chave: "sobrecarga",
    grupo: "Equipe",
    titulo: "Equipe sobrecarregada",
    descricao: "Sinaliza colaborador com demandas demais ou atrasos acumulados, para redistribuir antes de estourar.",
    quem: "Gestão",
    quando: "Uma vez por dia, por pessoa acima do limite",
    campos: [
      { tipo: "numero", chave: "limite_abertas", rotulo: "Mais de", sufixo: "demandas abertas", min: 1, max: 100 },
      { tipo: "numero", chave: "limite_atrasadas", rotulo: "Ou a partir de", sufixo: "atrasadas", min: 1, max: 50 },
      { tipo: "pessoas", chave: "destinatarios", rotulo: "Quem recebe", vazio: "Todos os ADMs" },
    ],
    whatsapp: true,
  },
  {
    chave: "reunioes",
    grupo: "Equipe",
    titulo: "Reuniões",
    descricao: "Lembra a reunião antes do horário e, depois de concluída, pede para registrar as tarefas do alinhamento.",
    quem: "Responsável e quem marcou",
    quando: "X minutos antes; e logo após concluir",
    campos: [
      { tipo: "numero", chave: "antecedencia_min", rotulo: "Lembrar antes", sufixo: "minutos", min: 5, max: 600 },
      { tipo: "sim_nao", chave: "pedir_registro", rotulo: "Pedir registro das tarefas depois" },
    ],
    whatsapp: true,
  },
  {
    chave: "metas",
    grupo: "Clientes",
    titulo: "Metas de campanha",
    descricao: "Cliente com projeção de resultados ou custo por resultado fora da meta cadastrada, com sugestão de correção.",
    quem: "Gestores da carteira do cliente (ou a gestão)",
    quando: "Uma vez por semana ou por dia",
    campos: [
      { tipo: "opcoes", chave: "periodicidade", rotulo: "Frequência", opcoes: [{ valor: "semanal", rotulo: "Semanal" }, { valor: "diaria", rotulo: "Diária" }] },
      { tipo: "pessoas", chave: "destinatarios", rotulo: "Cliente sem gestor: avisar", vazio: "Todos os ADMs" },
    ],
    whatsapp: true,
  },
  {
    chave: "resumo_diario",
    grupo: "Equipe",
    titulo: "Resumo diário",
    descricao: "Cada pessoa recebe o que vence hoje, o que atrasou e o que espera revisão dela. A gestão recebe o panorama.",
    quem: "Toda a equipe + gestão",
    quando: "Uma vez por dia, no horário escolhido",
    campos: [
      { tipo: "numero", chave: "hora", rotulo: "Enviar a partir das", sufixo: "h", min: 8, max: 19 },
      { tipo: "sim_nao", chave: "resumo_gestao", rotulo: "Mandar o panorama da operação para a gestão" },
      { tipo: "pessoas", chave: "destinatarios", rotulo: "Panorama vai para", vazio: "Todos os ADMs" },
    ],
    whatsapp: true,
  },
  {
    chave: "onboarding",
    grupo: "Clientes",
    titulo: "Entrada de clientes",
    descricao: "Cliente novo ganha responsável padrão em cada etapa do onboarding (vira demanda na fila) e prazo contado do cadastro.",
    quem: "Responsáveis das etapas",
    quando: "Nos 30 primeiros dias do cliente",
    campos: [{ tipo: "onboarding" }, { tipo: "sim_nao", chave: "exigir_aprovacao", rotulo: "Exigir aprovação de um ADM antes de aplicar" }],
    whatsapp: false,
    alteraDados: true,
  },
  {
    chave: "rotinas",
    grupo: "Rotina",
    titulo: "Rotinas do dia",
    descricao: "Já existia: todo dia às 8h gera as demandas fixas da Rotina e avisa cada responsável no sino.",
    quem: "Responsável de cada rotina",
    quando: "Todo dia às 8h",
    campos: [],
    whatsapp: false,
  },
];

export function configEfetiva(linha: Partial<ConfigAutomacao> | undefined, chave: ChaveAutomacao): ConfigAutomacao {
  const padrao = PADROES_AUTOMACAO[chave];
  if (!linha) return padrao;
  return { ativa: linha.ativa ?? padrao.ativa, whatsapp: linha.whatsapp ?? padrao.whatsapp, config: { ...padrao.config, ...(linha.config ?? {}) } };
}

export const ROTULO_AUTOMACAO: Record<string, string> = Object.fromEntries(CATALOGO.map(c => [c.chave, c.titulo]));
