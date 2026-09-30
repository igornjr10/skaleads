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

async function lerErroDoCorpo(error: unknown): Promise<string | null> {
  const contexto = (error as { context?: unknown } | null)?.context;
  if (!(contexto instanceof Response)) return null;
  try {
    const corpo = await contexto.clone().json();
    return typeof corpo?.error === "string" ? corpo.error : null;
  } catch {
    // Corpo nao-JSON (timeout do gateway, stack trace crua): melhor cair no
    // fallback do que estourar aqui e esconder o erro original.
    return null;
  }
}

async function callEdgeFunction<T>(
  functionName: string,
  payload: Record<string, unknown>
): Promise<{ data: T; tokens: { input: number; output: number }; cost: number; cached: boolean }> {
  const { data: user } = await supabase.auth.getUser();
  if (!user?.user?.id) throw new Error("Usuario nao autenticado");

  const fullPayload = { ...payload, tenantId: user.user.id };

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: fullPayload,
  });

  const response = data as EdgeFunctionResponse<T> | null;

  if (error || !response?.success) {
    // Num status fora do 2xx o supabase-js nao le o corpo: `data` vem null e
    // sobra "Edge Function returned a non-2xx status code", que nao diz nada.
    // A causa real esta no corpo da resposta, guardado em `error.context`.
    const doCorpo = await lerErroDoCorpo(error);
    throw new Error(
      doCorpo || response?.error || error?.message || `Erro ao chamar funcao de IA (${functionName})`
    );
  }

  const inferredKey =
    Object.keys(response).find((key) => !["success", "tokens", "cost_usd", "cached", "error"].includes(key)) || "data";

  return {
    data: (response.data ?? response[inferredKey]) as T,
    tokens: response.tokens || { input: 0, output: 0 },
    cost: parseFloat(response.cost_usd || "0"),
    cached: response.cached || false,
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
    analysis: response.data as string,
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
    copy: response.data as string,
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
    summary: response.data as string,
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

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  clientId?: string
): Promise<{ reply: string; tokens: { input: number; output: number }; cost: number }> {
  const { data: user } = await supabase.auth.getUser();
  if (!user?.user?.id) throw new Error("Usuario nao autenticado");

  const { data, error } = await supabase.functions.invoke("chat-assistant", {
    body: { messages, clientId, tenantId: user.user.id },
  });

  const response = data as { success: boolean; reply: string; tokens: { input: number; output: number }; cost_usd: string; error?: string } | null;

  if (error || !response?.success) {
    throw new Error(response?.error || error?.message || "Erro ao chamar assistente de chat");
  }

  return {
    reply: response.reply,
    tokens: response.tokens,
    cost: parseFloat(response.cost_usd || "0"),
  };
}

export async function prioritizeAuditActions(payload: AuditActionInput): Promise<{
  prioritization: string;
  tokens: { input: number; output: number };
  cost: number;
  cached: boolean;
}> {
  const response = await callEdgeFunction<string>("prioritize-audit", payload);

  return {
    prioritization: response.data as string,
    tokens: response.tokens,
    cost: response.cost,
    cached: response.cached,
  };
}

export interface NicheBriefingPayload {
  segmentLabel: string;
  goalLabel: string;
  benchmark: {
    clientes: number;
    spend: number;
    ctr: number;
    cpm: number;
    cpc: number;
    custoPorResultado: number | null;
    confiavel: boolean;
  };
  creatives: Array<{ title: string; ctr: number; impressions: number; creativeType: string }>;
  formatos: Array<{ creativeType: string; ctr: number; anuncios: number }>;
  /** Presente = briefing de diagnostico deste cliente contra o nicho dele. */
  client?: {
    name: string;
    spend: number;
    ctr: number;
    cpm: number;
    cpc: number;
    custoPorResultado: number | null;
    diasComGasto: number;
    creatives: Array<{ title: string; ctr: number; impressions: number; creativeType: string }>;
  };
}

export async function generateNicheBriefing(payload: NicheBriefingPayload): Promise<{
  briefing: string;
  tokens: { input: number; output: number };
  cost: number;
  cached: boolean;
}> {
  const response = await callEdgeFunction<string>("niche-briefing", { ...payload });

  return {
    briefing: response.data as string,
    tokens: response.tokens,
    cost: response.cost,
    cached: response.cached,
  };
}

export async function gerarPautaDeConteudo(payload: NicheBriefingPayload): Promise<Record<string, unknown>> {
  const { data: user } = await supabase.auth.getUser();
  if (!user?.user?.id) throw new Error("Usuario nao autenticado");

  const { data, error } = await supabase.functions.invoke("niche-briefing", {
    body: { ...payload, modo: "pauta", tenantId: user.user.id },
  });

  const response = data as (EdgeFunctionResponse<unknown> & { pauta?: Record<string, unknown> }) | null;

  if (error || !response?.success) {
    const doCorpo = await lerErroDoCorpo(error);
    throw new Error(doCorpo || response?.error || error?.message || "Erro ao gerar a pauta de conteudo");
  }

  if (!response.pauta) throw new Error("A pauta voltou vazia. Tente gerar de novo.");
  return response.pauta;
}
