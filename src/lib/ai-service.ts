import { supabase } from "@/integrations/supabase/client";

interface EdgeFunctionResponse<T> {
  success: boolean;
  error?: string;
  tokens?: { input: number; output: number };
  cost_usd?: string;
  cached?: boolean;
  data?: T;
  [key: string]: unknown;
}

async function callEdgeFunction<T>(
  functionName: string,
  payload: Record<string, unknown>
): Promise<{ data: T; tokens: { input: number; output: number }; cost: number; cached: boolean }> {
  const { data: user } = await supabase.auth.getUser();
  if (!user?.user?.id) throw new Error("Usuário não autenticado");

  // Add tenant ID to payload
  const fullPayload = { ...payload, tenantId: user.user.id };

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: fullPayload,
  });

  if (error || !data.success) {
    throw new Error(data?.error || "Erro ao chamar função de IA");
  }

  return {
    data: data.data || data[Object.keys(data).find(k => k !== "success" && k !== "tokens" && k !== "cost_usd" && k !== "cached" && k !== "error") || "data"] as T,
    tokens: data.tokens || { input: 0, output: 0 },
    cost: parseFloat(data.cost_usd || "0"),
    cached: data.cached || false,
  };
}

export interface CreativeAnalysisInput {
  creatives: Array<{
    copy: string;
    visual_description: string;
    metrics: Record<string, number>;
  }>;
}

export interface CreativeAnalysisOutput {
  analysis: string;
}

export async function analyzeCreatives(
  creatives: CreativeAnalysisInput["creatives"]
): Promise<{ analysis: string; tokens: { input: number; output: number }; cost: number; cached: boolean }> {
  const response = await callEdgeFunction<string>("analyze-creatives", {
    creatives,
  });

  return {
    analysis: response.data as unknown as string,
    tokens: response.tokens,
    cost: response.cost,
    cached: response.cached,
  };
}

export interface CopyGenerationInput {
  clientInfo: { name: string; industry?: string };
  objective: string;
  tone: "professional" | "casual" | "urgent" | "inspirational";
  briefing: string;
}

export interface CopyGenerationOutput {
  copy: string;
}

export async function generateCopy(payload: CopyGenerationInput): Promise<{
  copy: string;
  tokens: { input: number; output: number };
  cost: number;
  cached: boolean;
}> {
  const response = await callEdgeFunction<string>("generate-copy", payload);

  return {
    copy: response.data as unknown as string,
    tokens: response.tokens,
    cost: response.cost,
    cached: response.cached,
  };
}

export interface ReportSummaryInput {
  period: { start: string; end: string };
  metrics: Record<string, number>;
}

export interface ReportSummaryOutput {
  summary: string;
}

export async function summarizePeriod(payload: ReportSummaryInput): Promise<{
  summary: string;
  tokens: { input: number; output: number };
  cost: number;
  cached: boolean;
}> {
  const response = await callEdgeFunction<string>("summarize-period", payload);

  return {
    summary: response.data as unknown as string,
    tokens: response.tokens,
    cost: response.cost,
    cached: response.cached,
  };
}

export interface AuditActionInput {
  auditResults: Array<{
    id: string;
    name: string;
    status: string;
    severity: string;
    details?: string;
  }>;
}

export interface AuditActionOutput {
  prioritization: string;
}

export async function prioritizeAuditActions(payload: AuditActionInput): Promise<{
  prioritization: string;
  tokens: { input: number; output: number };
  cost: number;
  cached: boolean;
}> {
  const response = await callEdgeFunction<string>("prioritize-audit", payload);

  return {
    prioritization: response.data as unknown as string,
    tokens: response.tokens,
    cost: response.cost,
    cached: response.cached,
  };
}
