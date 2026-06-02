export interface ReportData {
  generatedAt: string;
  client: {
    name: string;
    adAccountLabel?: string;
    logoUrl?: string | null;
  };
  period: { start: string; end: string; label: string };
  summary: {
    spend: number;
    revenue: number;
    roas: number;
    conversions: number;
    purchases?: number;
    purchaseValue?: number;
    costPerPurchase?: number;
    messagesStarted?: number;
    instagramProfileVisits?: number;
    phoneCalls?: number;
    directions?: number;
    leads?: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
    reach?: number;
    frequency?: number;
  };
  socialPresence?: {
    enabled: boolean;
    profileName: string;
    logoUrl?: string | null;
    sourceLabels: string[];
    metrics: Array<{
      key: "followers" | "profileViews" | "reach" | "engagement";
      label: string;
      value: number | null;
      source: string;
    }>;
  };
  topCampaigns: Array<{
    name: string;
    spend: number;
    revenue: number;
    roas: number;
    conversions: number;
    impressions?: number;
    clicks?: number;
    ctr?: number;
    status: string;
  }>;
  topAds: Array<{
    name: string;
    spend: number;
    impressions: number;
    clicks: number;
    previewUrl: string | null;
    creativeType: string;
    ctr: number;
    cpc: number;
    cpm: number;
    status: string;
  }>;
  metricPreferences?: Array<
    | "spend"
    | "impressions"
    | "clicks"
    | "messagesStarted"
    | "instagramProfileVisits"
    | "phoneCalls"
    | "directions"
    | "leads"
    | "purchaseValue"
    | "purchases"
    | "costPerPurchase"
    | "roas"
    | "revenue"
    | "ctr"
    | "cpc"
    | "cpm"
    | "reach"
    | "frequency"
  >;
  branding: { primaryColor: string; agencyName: string };
}
