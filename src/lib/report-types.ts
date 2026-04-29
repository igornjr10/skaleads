export interface ReportData {
  generatedAt: string;
  client: {
    name: string;
    adAccountLabel?: string;
  };
  period: { start: string; end: string; label: string };
  summary: {
    spend: number;
    revenue: number;
    roas: number;
    conversions: number;
    messagesStarted?: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
  };
  topCampaigns: Array<{
    name: string;
    spend: number;
    revenue: number;
    roas: number;
    conversions: number;
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
  recommendations: string;
  branding: { primaryColor: string; agencyName: string };
}
