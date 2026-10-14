// Catalogo da Central de Automacoes. Os padroes e a normalizacao sao gemeos de
// supabase/functions/_shared/automacoes.ts (quem aplica a regra e o servidor);
// o teste automacoes-regras.test.ts compara os dois.

export type ChaveAutomacao =
  | "nova_demanda"
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
  | "rotinas"
  | "rotina_atrasada";

export type Papel = "responsavel" | "corresponsavel" | "solicitante" | "gestor" | "adm" | "pessoa";
export type Canal = "nao" | "sino" | "whatsapp";

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

const COPIA = { copiar_para: [], copiar_canal: "sino" };

export const PADROES_AUTOMACAO: Record<ChaveAutomacao, ConfigAutomacao> = {
  nova_demanda: {
    ativa: false, whatsapp: true,
    config: { destinos: { responsavel: "whatsapp", corresponsavel: "whatsapp", solicitante: "nao" }, copiar_para: [], copiar_canal: "whatsapp" },
  },
  prazo_proximo: {
    ativa: true, whatsapp: false,
    config: { antecedencia_horas: 2, aviso_vespera: true, destinos: { responsavel: "sino", corresponsavel: "nao", solicitante: "nao", gestor: "nao" }, ...COPIA },
  },
  atrasadas: {
    ativa: true, whatsapp: false,
    config: { repetir_horas: 0, destinos: { responsavel: "sino", corresponsavel: "nao", solicitante: "sino", gestor: "nao", adm: "nao" }, ...COPIA },
  },
  criativos_pendentes: {
    ativa: true, whatsapp: false,
    config: { antecedencia_horas: 24, destinos: { solicitante: "sino", responsavel: "nao", gestor: "nao" }, ...COPIA },
  },
  parada: {
    ativa: true, whatsapp: false,
    config: { horas: 72, destinos: { responsavel: "sino", solicitante: "nao", gestor: "nao", adm: "nao" }, ...COPIA },
  },
  aguardando_cliente: {
    ativa: true, whatsapp: false,
    config: { horas: 48, destinos: { responsavel: "sino", solicitante: "sino", gestor: "nao" }, ...COPIA },
  },
  sobrecarga: {
    ativa: true, whatsapp: false,
    config: { limite_abertas: 12, limite_atrasadas: 3, destinos: { adm: "sino", pessoa: "nao" }, ...COPIA },
  },
  reunioes: {
    ativa: true, whatsapp: false,
    config: { antecedencia_min: 60, pedir_registro: true, destinos: { responsavel: "sino", solicitante: "sino" }, ...COPIA },
  },
  metas: {
    ativa: true, whatsapp: false,
    config: { periodicidade: "semanal", destinos: { gestor: "sino", adm: "nao" }, ...COPIA },
  },
  resumo_diario: {
    ativa: true, whatsapp: false,
    config: { hora: 8, destinos: { pessoa: "sino", adm: "sino" }, ...COPIA },
  },
  onboarding: {
    ativa: false,
    whatsapp: false,
    config: { responsaveis: {}, prazos: { acessos: 2, rastreamento: 5, estrategia: 7, operacao: 10 }, exigir_aprovacao: true },
  },
  rotinas: { ativa: true, whatsapp: false, config: {} },
  rotina_atrasada: {
    ativa: true, whatsapp: false,
    config: { tolerancia_horas: 0, hora_sem_limite: 18, destinos: { responsavel: "sino", gestor: "nao", adm: "nao" }, ...COPIA },
  },
};

export type Campo =
  | { tipo: "numero"; chave: string; rotulo: string; sufixo?: string; min?: number; max?: number; dica?: string }
  /** Guardado em horas; a tela deixa escolher horas ou dias. */
  | { tipo: "duracao"; chave: string; rotulo: string; maxHoras: number; dica?: string; podeZero?: boolean }
  | { tipo: "sim_nao"; chave: string; rotulo: string }
  | { tipo: "opcoes"; chave: string; rotulo: string; opcoes: { valor: string; rotulo: string }[] }
  | { tipo: "onboarding" };

export interface Destino {
  papel: Papel;
  rotulo: string;
  dica?: string;
}

export interface ItemCatalogo {
  chave: ChaveAutomacao;
  grupo: "Demandas" | "Equipe" | "Clientes" | "Rotina";
  titulo: string;
  descricao: string;
  quando: string;
  campos: Campo[];
  /** Quem pode receber. Vazio = a automacao nao manda aviso configuravel. */
  destinos: Destino[];
  /** Canais oferecidos. Padrao: nao, sino, WhatsApp. */
  canais?: Canal[];
  /** Exemplo de como o aviso chega, para ninguem ligar no escuro. */
  exemplo?: { titulo: string; corpo: string };
  /** Usa dados da Rotina para dar contexto. */
  usaRotina?: boolean;
  /** Mexe em dado (responsavel, prazo): pode exigir aprovacao. */
  alteraDados?: boolean;
  /** Texto fixo para automacao sem destinos configuraveis. */
  quemFixo?: string;
}

const RESPONSAVEL: Destino = { papel: "responsavel", rotulo: "Responsável pela demanda" };
const CORRESP: Destino = { papel: "corresponsavel", rotulo: "Corresponsáveis" };
const SOLICITANTE: Destino = { papel: "solicitante", rotulo: "Quem pediu" };
const GESTOR: Destino = { papel: "gestor", rotulo: "Gestor do cliente", dica: "Quem tem o cliente na carteira. Sem gestor, vai para os ADMs." };
const ADM: Destino = { papel: "adm", rotulo: "ADMs da agência" };

export const CATALOGO: ItemCatalogo[] = [
  {
    chave: "nova_demanda",
    grupo: "Demandas",
    titulo: "Nova demanda",
    descricao: "Quando uma demanda chega para alguém (na criação ou no dia em que a programada libera), avisa no WhatsApp. O sino já sai sozinho.",
    quando: "Assim que a demanda é atribuída ou liberada",
    campos: [],
    destinos: [RESPONSAVEL, CORRESP, { papel: "solicitante", rotulo: "Quem pediu", dica: "Quem criou a demanda nunca é avisado da própria." }],
    canais: ["nao", "whatsapp"],
    exemplo: { titulo: "Nova demanda para você: Carrossel de outubro", corpo: "Prazo 16/10 às 15:00 · pedida por Bia · Loja Exemplo" },
  },
  {
    chave: "prazo_proximo",
    grupo: "Demandas",
    titulo: "Aviso de prazo",
    descricao: "Lembra antes da entrega: na véspera, na manhã do dia e um tempo antes do horário marcado.",
    quando: "Véspera, manhã do dia e o tempo escolhido antes do horário",
    campos: [
      { tipo: "duracao", chave: "antecedencia_horas", rotulo: "Avisar antes do horário de entrega", maxHoras: 72, podeZero: true, dica: "Só para demanda com horário. 0 desliga este aviso." },
      { tipo: "sim_nao", chave: "aviso_vespera", rotulo: "Avisar também na véspera" },
    ],
    destinos: [RESPONSAVEL, CORRESP, SOLICITANTE, GESTOR],
    exemplo: { titulo: "Faltam 2h: Carrossel de outubro", corpo: "Entrega hoje às 15:00 · Loja Exemplo" },
    usaRotina: true,
  },
  {
    chave: "atrasadas",
    grupo: "Demandas",
    titulo: "Demanda atrasada",
    descricao: "Quando o prazo passa sem entrega, avisa e a demanda fica destacada na Visão da agência. Pode cobrar de novo até ser entregue.",
    quando: "Assim que o prazo (ou o horário) passa",
    campos: [
      { tipo: "duracao", chave: "repetir_horas", rotulo: "Cobrar de novo a cada", maxHoras: 168, podeZero: true, dica: "0 = avisa uma vez só." },
    ],
    destinos: [RESPONSAVEL, CORRESP, SOLICITANTE, GESTOR, ADM],
    exemplo: { titulo: "Atrasada: Carrossel de outubro", corpo: "Prazo era 14/10 às 15:00 · com Ana · Loja Exemplo · Ana ainda tem 3 rotinas hoje" },
    usaRotina: true,
  },
  {
    chave: "criativos_pendentes",
    grupo: "Demandas",
    titulo: "Criativo pendente",
    descricao: "Arte ou vídeo perto do prazo que ainda não foi para revisão: fica sabendo antes de virar atraso.",
    quando: "O tempo escolhido antes do prazo, se ainda não entregue",
    campos: [
      { tipo: "duracao", chave: "antecedencia_horas", rotulo: "Avisar com antecedência de", maxHoras: 168, dica: "Demanda sem horário conta em dias (24h = prazo até amanhã)." },
    ],
    destinos: [SOLICITANTE, RESPONSAVEL, GESTOR],
    exemplo: { titulo: "Material ainda não entregue: Vídeo Reels", corpo: "Prazo 15/10 · Ana ainda não mandou para revisão · Loja Exemplo" },
  },
  {
    chave: "parada",
    grupo: "Demandas",
    titulo: "Demanda parada",
    descricao: "Demanda sem nenhuma atualização há um tempo. Se está em revisão, quem precisa agir é quem pediu.",
    quando: "Depois do tempo escolhido sem atualização",
    campos: [{ tipo: "duracao", chave: "horas", rotulo: "Considerar parada após", maxHoras: 720 }],
    destinos: [{ papel: "responsavel", rotulo: "Quem precisa agir", dica: "O responsável; se a demanda está em revisão, quem pediu." }, SOLICITANTE, GESTOR, ADM],
    exemplo: { titulo: "Parada há 3 dias: Landing page", corpo: "Sem nenhuma atualização desde 11/10 · Loja Exemplo" },
    usaRotina: true,
  },
  {
    chave: "aguardando_cliente",
    grupo: "Clientes",
    titulo: "Material do cliente",
    descricao: "Entrega marcada como \"aguardando o cliente\" há um tempo: lembra de cobrar o material.",
    quando: "Depois do tempo escolhido aguardando",
    campos: [{ tipo: "duracao", chave: "horas", rotulo: "Cobrar após", maxHoras: 720 }],
    destinos: [RESPONSAVEL, SOLICITANTE, GESTOR],
    exemplo: { titulo: "Cliente não mandou o material: Fotos do cardápio", corpo: "Travada há 2 dias esperando Loja Exemplo. Vale cobrar no grupo do cliente." },
  },
  {
    chave: "sobrecarga",
    grupo: "Equipe",
    titulo: "Equipe sobrecarregada",
    descricao: "Sinaliza colaborador com demandas demais ou atrasos acumulados, junto com a rotina do dia dele, para redistribuir antes de estourar.",
    quando: "Uma vez por dia, por pessoa acima do limite",
    campos: [
      { tipo: "numero", chave: "limite_abertas", rotulo: "Mais de", sufixo: "demandas abertas", min: 1, max: 100 },
      { tipo: "numero", chave: "limite_atrasadas", rotulo: "Ou a partir de", sufixo: "atrasadas", min: 1, max: 50 },
    ],
    destinos: [ADM, { papel: "pessoa", rotulo: "A própria pessoa sobrecarregada" }],
    exemplo: { titulo: "Ana está sobrecarregado(a)", corpo: "14 demandas abertas, 3 atrasadas e 4 rotinas pendentes hoje. Considere redistribuir ou repriorizar." },
    usaRotina: true,
  },
  {
    chave: "reunioes",
    grupo: "Equipe",
    titulo: "Reuniões",
    descricao: "Lembra a reunião antes do horário e, depois de concluída, pede para registrar as tarefas do alinhamento.",
    quando: "Antes do horário; e logo após concluir",
    campos: [
      { tipo: "numero", chave: "antecedencia_min", rotulo: "Lembrar antes", sufixo: "minutos", min: 5, max: 600 },
      { tipo: "sim_nao", chave: "pedir_registro", rotulo: "Pedir registro das tarefas depois (vai para quem marcou)" },
    ],
    destinos: [{ papel: "responsavel", rotulo: "Participantes (responsável e corresponsáveis)" }, { papel: "solicitante", rotulo: "Quem marcou" }],
    exemplo: { titulo: "Reunião às 14:00: Alinhamento mensal", corpo: "Começa em 60 min · Loja Exemplo" },
  },
  {
    chave: "metas",
    grupo: "Clientes",
    titulo: "Metas de campanha",
    descricao: "Cliente com projeção de resultados ou custo por resultado fora da meta cadastrada, com sugestão de correção.",
    quando: "Uma vez por semana ou por dia",
    campos: [
      { tipo: "opcoes", chave: "periodicidade", rotulo: "Frequência", opcoes: [{ valor: "semanal", rotulo: "Semanal" }, { valor: "diaria", rotulo: "Diária" }] },
    ],
    destinos: [GESTOR, ADM],
    exemplo: { titulo: "Loja Exemplo fora da meta", corpo: "projeção de 180 resultados para meta de 300. Aumente o orçamento dos conjuntos que estão no custo ou renove os criativos." },
  },
  {
    chave: "resumo_diario",
    grupo: "Equipe",
    titulo: "Resumo diário",
    descricao: "Cada pessoa recebe o dia dela: demandas que vencem, atrasos, revisões e as rotinas do dia. A gestão recebe o panorama com a aderência à rotina de ontem.",
    quando: "Uma vez por dia, no horário escolhido",
    campos: [{ tipo: "numero", chave: "hora", rotulo: "Enviar a partir das", sufixo: "h", min: 8, max: 19 }],
    destinos: [{ papel: "pessoa", rotulo: "Cada pessoa: o dia dela" }, { papel: "adm", rotulo: "ADMs: panorama da operação" }],
    exemplo: { titulo: "Seu dia", corpo: "2 vencem hoje · 1 atrasada · 3 rotinas hoje (1ª até 10:00: Checar orçamento) · 8 demandas abertas com você" },
    usaRotina: true,
  },
  {
    chave: "rotina_atrasada",
    grupo: "Rotina",
    titulo: "Rotina não feita",
    descricao: "Rotina do dia que passou do horário limite sem baixa. Mostra junto a fila de demandas da pessoa, para saber se é falta de tempo.",
    quando: "Depois do horário limite (mais a tolerância)",
    campos: [
      { tipo: "duracao", chave: "tolerancia_horas", rotulo: "Tolerância depois do limite", maxHoras: 12, podeZero: true, dica: "0 = cobra assim que o horário passa." },
      { tipo: "numero", chave: "hora_sem_limite", rotulo: "Rotina sem horário: cobrar às", sufixo: "h", min: 9, max: 19 },
    ],
    destinos: [{ papel: "responsavel", rotulo: "Responsável pela rotina" }, GESTOR, ADM],
    exemplo: { titulo: "Rotina não feita: Checar orçamento das campanhas", corpo: "Limite era 10:00 · com Ana · Loja Exemplo · 9 demandas abertas na fila dela(e)" },
    usaRotina: true,
  },
  {
    chave: "rotinas",
    grupo: "Rotina",
    titulo: "Rotinas do dia",
    descricao: "Todo dia às 8h avisa no sino cada responsável das rotinas que caem no dia. O lembrete no WhatsApp é escolhido em cada rotina, na tela Rotina.",
    quando: "Todo dia às 8h",
    campos: [],
    destinos: [],
    quemFixo: "Responsável de cada rotina, no sino",
  },
  {
    chave: "onboarding",
    grupo: "Clientes",
    titulo: "Entrada de clientes",
    descricao: "Cliente novo ganha responsável padrão em cada etapa do onboarding (vira demanda na fila) e prazo contado do cadastro.",
    quando: "Nos 30 primeiros dias do cliente",
    campos: [{ tipo: "onboarding" }, { tipo: "sim_nao", chave: "exigir_aprovacao", rotulo: "Exigir aprovação de um ADM antes de aplicar" }],
    destinos: [],
    quemFixo: "ADMs aprovam; responsáveis das etapas recebem a demanda",
    alteraDados: true,
  },
];

const LEGADO_HORAS: Partial<Record<ChaveAutomacao, [string, string][]>> = {
  criativos_pendentes: [["dias_antes", "antecedencia_horas"]],
  parada: [["dias", "horas"]],
  aguardando_cliente: [["dias", "horas"]],
};

export function temWhatsapp(config: Record<string, unknown>) {
  const destinos = Object.values((config.destinos ?? {}) as Record<string, Canal>);
  return destinos.includes("whatsapp") || (config.copiar_canal === "whatsapp" && ((config.copiar_para as string[] | undefined) ?? []).length > 0);
}

/** Gemea de normalizarConfig do servidor: config de qualquer epoca + padrao. */
export function configEfetiva(linha: Partial<ConfigAutomacao> | undefined, chave: ChaveAutomacao): ConfigAutomacao {
  const padrao = PADROES_AUTOMACAO[chave];
  if (!linha) return padrao;
  const salvo: Record<string, unknown> = { ...(linha.config ?? {}) };
  for (const [velho, novo] of LEGADO_HORAS[chave] ?? []) {
    if (salvo[velho] != null && salvo[novo] == null) salvo[novo] = Number(salvo[velho]) * 24;
  }
  const config: Record<string, unknown> = { ...padrao.config, ...salvo };
  const destinosPadrao = padrao.config.destinos as Record<string, Canal> | undefined;
  if (!destinosPadrao) return { ativa: linha.ativa ?? padrao.ativa, whatsapp: !!linha.whatsapp, config };

  const destinos: Record<string, Canal> = { ...destinosPadrao, ...((salvo.destinos as Record<string, Canal> | undefined) ?? {}) };
  if (!salvo.destinos) {
    if (chave === "atrasadas" && salvo.avisar_solicitante === false) destinos.solicitante = "nao";
    if (chave === "resumo_diario" && salvo.resumo_gestao === false) destinos.adm = "nao";
    if ((chave === "sobrecarga" || chave === "resumo_diario") && Array.isArray(salvo.destinatarios) && salvo.destinatarios.length) {
      config.copiar_para = salvo.destinatarios;
      destinos.adm = "nao";
    }
    if (linha.whatsapp) {
      for (const k of Object.keys(destinos)) if (destinos[k] === "sino") destinos[k] = "whatsapp";
      config.copiar_canal = "whatsapp";
    }
  }
  config.destinos = destinos;
  return { ativa: linha.ativa ?? padrao.ativa, whatsapp: temWhatsapp(config), config };
}

export const ROTULO_AUTOMACAO: Record<string, string> = Object.fromEntries(CATALOGO.map(c => [c.chave, c.titulo]));
