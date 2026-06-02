export interface OptionItem {
  value: string;
  label: string;
}

export const BUSINESS_SEGMENTS: OptionItem[] = [
  { value: "restaurante", label: "Restaurante / Alimentação" },
  { value: "clinica_saude", label: "Clínica / Saúde" },
  { value: "beleza_estetica", label: "Beleza / Estética" },
  { value: "automotivo", label: "Automotivo" },
  { value: "varejo", label: "Varejo / Loja" },
  { value: "servicos", label: "Serviços" },
  { value: "educacao", label: "Educação" },
  { value: "imobiliario", label: "Imobiliário" },
  { value: "outro", label: "Outro" },
];

export type LocalGoal = "messages" | "calls" | "directions" | "leads" | "sales";

export const LOCAL_GOALS: Array<OptionItem & { value: LocalGoal }> = [
  { value: "messages", label: "Conversas (WhatsApp / Direct)" },
  { value: "calls", label: "Ligações telefônicas" },
  { value: "directions", label: "Rotas / Como chegar" },
  { value: "leads", label: "Leads / Cadastros" },
  { value: "sales", label: "Vendas" },
];

export type LocalMetricKey =
  | "messages"
  | "calls"
  | "directions"
  | "leads"
  | "profileVisits";

export const LOCAL_METRIC_LABELS: Record<LocalMetricKey, string> = {
  messages: "Conversas",
  calls: "Ligações",
  directions: "Rotas",
  leads: "Leads",
  profileVisits: "Visitas no perfil",
};

// KPIs em destaque por objetivo principal do negócio local.
// A primeira métrica é o resultado-chave; o custo por resultado deriva dela.
export const GOAL_KPIS: Record<LocalGoal, LocalMetricKey[]> = {
  messages: ["messages", "profileVisits", "directions"],
  calls: ["calls", "messages", "directions"],
  directions: ["directions", "profileVisits", "messages"],
  leads: ["leads", "messages", "calls"],
  sales: ["leads", "messages", "calls"],
};

export function segmentLabel(value?: string | null): string | null {
  if (!value) return null;
  return BUSINESS_SEGMENTS.find((s) => s.value === value)?.label ?? value;
}

export function goalLabel(value?: string | null): string | null {
  if (!value) return null;
  return LOCAL_GOALS.find((g) => g.value === value)?.label ?? value;
}

// Mapa UF -> nome do estado, usado para casar a UF do cliente com o valor
// de "region" retornado pela Meta (que vem como nome completo do estado no Brasil).
export const UF_TO_STATE_NAME: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Verifica se um valor de region/cidade da Meta corresponde à área de atuação
// do cliente (UF ou cidade cadastrada).
export function matchesClientArea(regionValue: string, state?: string | null, city?: string | null): boolean {
  if (!regionValue) return false;
  const value = normalizeText(regionValue);
  if (state) {
    const uf = state.trim().toUpperCase();
    if (value === normalizeText(uf)) return true;
    const stateName = UF_TO_STATE_NAME[uf];
    if (stateName && value === normalizeText(stateName)) return true;
  }
  if (city && value === normalizeText(city)) return true;
  return false;
}

// ── Extração de métricas locais a partir do array `actions` da Meta ──────────

export interface MetaAction {
  action_type?: string;
  value?: string;
}

function sumByPredicate(actions: MetaAction[] | undefined, predicate: (type: string) => boolean): number {
  if (!actions?.length) return 0;
  return actions.reduce((total, action) => {
    const type = (action.action_type ?? "").toLowerCase();
    if (!predicate(type)) return total;
    return total + (parseInt(action.value ?? "0", 10) || 0);
  }, 0);
}

export function extractMessages(actions?: MetaAction[]): number {
  return sumByPredicate(actions, (type) => type.includes("messaging_conversation_started"));
}

export function extractPhoneCalls(actions?: MetaAction[]): number {
  return sumByPredicate(actions, (type) => type.includes("click_to_call") || type.includes("call_confirm"));
}

export function extractDirections(actions?: MetaAction[]): number {
  return sumByPredicate(actions, (type) => type.includes("get_directions") || type.includes("find_location"));
}

export function extractLeads(actions?: MetaAction[]): number {
  return sumByPredicate(actions, (type) => {
    const isMessaging = type.includes("messaging");
    return !isMessaging && (type === "lead" || type.includes("leadgen") || type.includes(".lead"));
  });
}

export function extractProfileVisits(actions?: MetaAction[]): number {
  return sumByPredicate(actions, (type) => {
    const isProfile =
      (type.includes("instagram") || type.includes("ig_") || type.includes(".ig")) &&
      type.includes("profile") &&
      (type.includes("visit") || type.includes("view"));
    return isProfile;
  });
}

export interface LocalActionTotals {
  messages: number;
  calls: number;
  directions: number;
  leads: number;
  profileVisits: number;
}

export function extractLocalActionTotals(actions?: MetaAction[]): LocalActionTotals {
  return {
    messages: extractMessages(actions),
    calls: extractPhoneCalls(actions),
    directions: extractDirections(actions),
    leads: extractLeads(actions),
    profileVisits: extractProfileVisits(actions),
  };
}
