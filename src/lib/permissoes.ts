export type AppRole =
  | "owner"
  | "admin"
  | "analyst"
  | "viewer"
  | "editor"
  | "designer"
  | "sdr"
  | "closer"
  | "social_seller";

export const PAPEIS: { value: AppRole; label: string; descricao: string }[] = [
  { value: "admin", label: "ADM", descricao: "Tudo da empresa: clientes, equipe, financeiro e configurações" },
  { value: "analyst", label: "Gestor de tráfego", descricao: "Campanhas, relatórios e demandas dos clientes atribuídos a ele" },
  { value: "designer", label: "Designer", descricao: "Demandas de criação e produção dos clientes atribuídos" },
  { value: "editor", label: "Editor de vídeo", descricao: "Demandas de produção dos clientes atribuídos" },
  { value: "sdr", label: "SDR", descricao: "Prospecção e agendamento de reuniões" },
  { value: "closer", label: "Closer", descricao: "Reuniões, propostas e fechamentos" },
  { value: "social_seller", label: "Social Seller", descricao: "Prospecção pelas redes sociais" },
  { value: "viewer", label: "Visualizador", descricao: "Só leitura dos clientes atribuídos" },
];

export function rotuloPapel(role: string | null | undefined): string {
  if (role === "owner") return "Dono da plataforma";
  return PAPEIS.find(p => p.value === role)?.label ?? "Sem papel";
}

/** Papeis que enxergam a carteira inteira da empresa; os demais so os clientes atribuidos. */
export function veTodosOsClientes(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export type Modulo =
  | "dashboard"
  | "agencia"
  | "clientes"
  | "contratos"
  | "financeiro"
  | "demandas"
  | "comercial"
  | "rotina"
  | "campanhas"
  | "alertas"
  | "envios"
  | "ia";

export const MODULOS: { key: Modulo; label: string; rotas: string[] }[] = [
  { key: "dashboard", label: "Dashboard de campanhas", rotas: ["/dashboard"] },
  { key: "agencia", label: "Visão da agência", rotas: ["/agencia"] },
  { key: "clientes", label: "Clientes, onboarding e grupos", rotas: ["/clients", "/onboarding", "/grupos"] },
  { key: "contratos", label: "Contratos", rotas: ["/contratos"] },
  { key: "financeiro", label: "Financeiro", rotas: ["/financeiro"] },
  { key: "demandas", label: "Demandas e planner", rotas: ["/demandas", "/planner"] },
  { key: "comercial", label: "Comercial (CRM e prospecção)", rotas: ["/comercial"] },
  { key: "rotina", label: "Rotina", rotas: ["/rotina"] },
  { key: "campanhas", label: "Campanhas e nichos", rotas: ["/campaigns", "/nichos"] },
  { key: "alertas", label: "Alertas", rotas: ["/alerts", "/alert-events"] },
  { key: "envios", label: "Relatórios, WhatsApp e automações", rotas: ["/report-schedules", "/whatsapp-scheduled", "/automations"] },
  { key: "ia", label: "Assistente IA e Cérebro", rotas: ["/chat", "/cerebro", "/andromeda"] },
];

const TODOS = MODULOS.map(m => m.key);

const PADRAO_POR_PAPEL: Record<AppRole, Modulo[]> = {
  owner: TODOS,
  admin: TODOS,
  analyst: ["dashboard", "clientes", "demandas", "comercial", "rotina", "campanhas", "alertas", "envios", "ia"],
  designer: ["demandas", "rotina"],
  editor: ["demandas", "rotina"],
  sdr: ["comercial", "demandas", "rotina"],
  closer: ["comercial", "demandas", "rotina"],
  social_seller: ["comercial", "demandas", "rotina"],
  viewer: ["dashboard", "clientes", "campanhas"],
};

export function modulosPadrao(role: string | null | undefined): Modulo[] {
  return PADRAO_POR_PAPEL[role as AppRole] ?? [];
}

/**
 * O que a pessoa pode abrir. `personalizados` null = padrao do papel. Owner e
 * admin nunca perdem modulo: sao eles que liberam os dos outros, e trancar o
 * proprio admin fora do financeiro nao tem volta pela tela.
 */
export function modulosEfetivos(role: string | null | undefined, personalizados: string[] | null | undefined): Modulo[] {
  if (role === "owner" || role === "admin") return TODOS;
  if (!personalizados) return modulosPadrao(role);
  return TODOS.filter(m => personalizados.includes(m));
}

/** Modulo dono da rota, ou null para rotas livres (configuracoes, raiz). */
export function moduloDaRota(pathname: string): Modulo | null {
  for (const m of MODULOS) {
    if (m.rotas.some(r => pathname === r || pathname.startsWith(`${r}/`))) return m.key;
  }
  return null;
}
