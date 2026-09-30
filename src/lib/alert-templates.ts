import type { AlertRule } from "./alert-engine";

export interface AlertTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  rule: AlertRule;
  cooldownMinutes: number;
  enableWhatsapp?: boolean;
}

export const ALERT_TEMPLATES: AlertTemplate[] = [
  {
    id: "balance_low",
    name: "Saldo baixo na conta Meta",
    description: "Avisa o gestor quando o saldo da conta cai abaixo de R$ 50 — conta zerada para a entrega sem aviso",
    icon: "🪫",
    rule: {
      conditions: [{ metric: "balance", comparator: "lt", value: 50, period: "1d", entityType: "CLIENT" }],
      logic: "AND",
    },
    cooldownMinutes: 720,
    enableWhatsapp: true,
  },
  {
    id: "cpa_high",
    name: "CPA acima da meta",
    description: "Alerta quando o custo por aquisição ultrapassa o limite definido por 3 dias consecutivos",
    icon: "💰",
    rule: {
      conditions: [{ metric: "cpa", comparator: "gt", value: 50, period: "3d", entityType: "CAMPAIGN" }],
      logic: "AND",
    },
    cooldownMinutes: 1440,
  },
  {
    id: "frequency_fatigue",
    name: "Frequência alta com queda de CTR",
    description: "Detecta fadiga quando frequência alta coincide com CTR em queda",
    icon: "🔁",
    rule: {
      conditions: [
        { metric: "frequency", comparator: "gt", value: 3.5, period: "3d", entityType: "CLIENT" },
        { metric: "ctr", comparator: "change_pct", value: -25, period: "7d", entityType: "CLIENT" },
      ],
      logic: "AND",
    },
    cooldownMinutes: 720,
  },
  {
    id: "roas_low",
    name: "ROAS abaixo de 1 por 7 dias",
    description: "Campanhas gastando mais do que retornam por uma semana inteira",
    icon: "📉",
    rule: {
      conditions: [{ metric: "roas", comparator: "lt", value: 1, period: "7d", entityType: "CLIENT" }],
      logic: "AND",
    },
    cooldownMinutes: 1440,
  },
  {
    id: "spend_acceleration",
    name: "Gasto acima do diário",
    description: "Investimento ultrapassa o limite configurado no período",
    icon: "🚀",
    rule: {
      conditions: [{ metric: "spend", comparator: "gt", value: 500, period: "1d", entityType: "CLIENT" }],
      logic: "AND",
    },
    cooldownMinutes: 240,
  },
  {
    id: "campaign_paused",
    name: "Campanha pausada inesperadamente",
    description: "Detecta quando uma campanha ativa passa para pausada",
    icon: "⏸️",
    rule: {
      conditions: [{ metric: "status", comparator: "eq", value: "PAUSED", period: "1d", entityType: "CAMPAIGN" }],
      logic: "AND",
    },
    cooldownMinutes: 120,
  },
  {
    id: "ctr_low",
    name: "CTR abaixo de 1%",
    description: "Taxa de cliques consistentemente baixa por 3 dias",
    icon: "👆",
    rule: {
      conditions: [{ metric: "ctr", comparator: "lt", value: 1, period: "3d", entityType: "CLIENT" }],
      logic: "AND",
    },
    cooldownMinutes: 720,
  },
  {
    id: "cpm_high",
    name: "CPM alto",
    description: "Custo por mil impressões acima do esperado",
    icon: "👁️",
    rule: {
      conditions: [{ metric: "cpm", comparator: "gt", value: 30, period: "3d", entityType: "CLIENT" }],
      logic: "AND",
    },
    cooldownMinutes: 720,
  },
];
