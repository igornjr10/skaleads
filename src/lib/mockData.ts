// Mock data for dashboard / campaigns until Meta OAuth integration is live.

export interface MockClient {
  id: string;
  name: string;
}

export const mockClients: MockClient[] = [
  { id: "1", name: "Loja Aurora" },
  { id: "2", name: "FitLife Suplementos" },
  { id: "3", name: "Tech Hub Brasil" },
];

export interface MockCampaign {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "DELETED";
  objective: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  client_id: string;
}

export const mockCampaigns: MockCampaign[] = [
  { id: "c1", client_id: "1", name: "Black Friday — Conversões", status: "ACTIVE", objective: "CONVERSIONS", spend: 12450.30, impressions: 482300, clicks: 18420, ctr: 3.82, cpc: 0.68, cpm: 25.81, conversions: 412 },
  { id: "c2", client_id: "1", name: "Remarketing Carrinho", status: "ACTIVE", objective: "CONVERSIONS", spend: 4320.00, impressions: 95400, clicks: 6100, ctr: 6.39, cpc: 0.71, cpm: 45.28, conversions: 198 },
  { id: "c3", client_id: "1", name: "Catálogo Produtos", status: "PAUSED", objective: "CATALOG_SALES", spend: 2100.50, impressions: 78200, clicks: 1840, ctr: 2.35, cpc: 1.14, cpm: 26.86, conversions: 54 },
  { id: "c4", client_id: "2", name: "Lançamento Whey Premium", status: "ACTIVE", objective: "TRAFFIC", spend: 8900.00, impressions: 312000, clicks: 14200, ctr: 4.55, cpc: 0.63, cpm: 28.53, conversions: 287 },
  { id: "c5", client_id: "2", name: "Engajamento Stories", status: "ACTIVE", objective: "ENGAGEMENT", spend: 1850.00, impressions: 145000, clicks: 4200, ctr: 2.90, cpc: 0.44, cpm: 12.76, conversions: 0 },
  { id: "c6", client_id: "3", name: "B2B Leads SaaS", status: "ACTIVE", objective: "LEAD_GENERATION", spend: 15600.00, impressions: 89000, clicks: 3200, ctr: 3.60, cpc: 4.88, cpm: 175.28, conversions: 142 },
  { id: "c7", client_id: "3", name: "Webinar Inscrições", status: "DELETED", objective: "LEAD_GENERATION", spend: 980.00, impressions: 22000, clicks: 540, ctr: 2.45, cpc: 1.81, cpm: 44.55, conversions: 38 },
];

export function generateDailySeries(days = 30, clientId?: string) {
  const filtered = clientId ? mockCampaigns.filter((c) => c.client_id === clientId) : mockCampaigns;
  const totalSpend = filtered.reduce((s, c) => s + c.spend, 0);
  const totalClicks = filtered.reduce((s, c) => s + c.clicks, 0);
  const series = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const wave = Math.sin((days - i) / 4) * 0.25 + 1;
    const noise = 0.85 + Math.random() * 0.3;
    series.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      spend: Math.round((totalSpend / days) * wave * noise * 100) / 100,
      clicks: Math.round((totalClicks / days) * wave * noise),
    });
  }
  return series;
}

export function aggregateMetrics(clientId?: string) {
  const filtered = clientId
    ? mockCampaigns.filter((c) => c.client_id === clientId)
    : mockCampaigns;
  const spend = filtered.reduce((s, c) => s + c.spend, 0);
  const impressions = filtered.reduce((s, c) => s + c.impressions, 0);
  const clicks = filtered.reduce((s, c) => s + c.clicks, 0);
  const ctr = impressions ? (clicks / impressions) * 100 : 0;
  const cpc = clicks ? spend / clicks : 0;
  const cpm = impressions ? (spend / impressions) * 1000 : 0;
  return { spend, impressions, clicks, ctr, cpc, cpm };
}
