// Shared Claude Service for all AI Edge Functions
// Features: retry, caching, rate limiting, token logging
// Com OPENAI_API_KEY configurada, as chamadas vao para a OpenAI.
import { erroDoProvedor, limiteDeTokens, provedorLLM } from "./llm.ts";

interface CacheEntry {
  data: string;
  timestamp: number;
  tokens: { input: number; output: number };
}

const CACHE_TTL = 3600000; // 1 hour
const cache = new Map<string, CacheEntry>();
const RATE_LIMITS = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_PER_TENANT = 100; // requests per hour
const RATE_LIMIT_WINDOW = 3600000; // 1 hour

// Token pricing (Claude 3.5 Sonnet as of April 2026)
const TOKEN_COST = {
  input: 0.000003, // $0.003 per 1M input tokens
  output: 0.000015, // $0.015 per 1M output tokens
};

function generateCacheKey(prompt: string, context?: string): string {
  const combined = `${prompt}${context || ''}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `cache_${Math.abs(hash)}`;
}

function checkRateLimit(tenantId: string): boolean {
  const now = Date.now();
  const limit = RATE_LIMITS.get(tenantId);
  
  if (!limit || now > limit.resetTime) {
    RATE_LIMITS.set(tenantId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (limit.count >= RATE_LIMIT_PER_TENANT) {
    return false;
  }
  
  limit.count++;
  return true;
}

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeResponse {
  content: string;
  tokens: { input: number; output: number };
  cost: number;
  cached: boolean;
}

async function callOpenAI(
  prompt: string,
  systemPrompt?: string,
  messages?: ClaudeMessage[]
): Promise<{ content: string; tokens: { input: number; output: number } }> {
  const ia = provedorLLM();
  const response = await fetch(ia.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${ia.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ia.model,
      ...limiteDeTokens(ia, 4096),
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        ...(messages ?? []),
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) throw await erroDoProvedor(ia, response);
  const data = await response.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error(`${ia.nome} respondeu sem texto`);
  return {
    content,
    tokens: { input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0 },
  };
}

async function callClaudeWithRetry(
  prompt: string,
  systemPrompt?: string,
  messages?: ClaudeMessage[],
  maxRetries = 3,
  retryDelay = 1000
): Promise<{ content: string; tokens: { input: number; output: number } }> {
  if (Deno.env.get("OPENAI_API_KEY")) return callOpenAI(prompt, systemPrompt, messages);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurado");

  const url = "https://api.anthropic.com/v1/messages";
  const headers = {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };

  const finalMessages: ClaudeMessage[] = messages
    ? [...messages, { role: "user", content: prompt }]
    : [{ role: "user", content: prompt }];

  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: finalMessages,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        // Rate limit error - wait and retry
        if (response.status === 429) {
          const waitTime = Math.pow(2, attempt) * retryDelay;
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        }
        throw new Error(`Claude API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      // Recusa por seguranca volta com HTTP 200 e `content` vazio: sem esta
      // checagem, `content[0].text` estoura com TypeError e o motivo real da
      // recusa, que vem em `stop_details`, se perde.
      if (data.stop_reason === "refusal") {
        throw new Error(`Claude recusou a requisicao (${data.stop_details?.category ?? "sem categoria"})`);
      }
      return {
        content: data.content[0].text,
        tokens: {
          input: data.usage.input_tokens,
          output: data.usage.output_tokens,
        },
      };
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * retryDelay;
        await new Promise(r => setTimeout(r, waitTime));
      }
    }
  }

  throw lastError || new Error("Falha ao chamar Claude após retries");
}

export async function prioritizeAuditActions(
  tenantId: string,
  auditResults: Array<{ id: string; name: string; status: string; severity: string; details?: string }>,
  context?: string
): Promise<ClaudeResponse> {
  if (!checkRateLimit(tenantId)) {
    throw new Error(`Taxa limite excedida para tenant ${tenantId}`);
  }

  const resultsText = auditResults
    .map(r => `- [${r.severity}] ${r.name} (${r.status})${r.details ? `: ${r.details}` : ''}`)
    .join("\n");

  const prompt = `Priorize as seguintes ações de auditoria Meta Ads considerando esforço × impacto:

${resultsText}

Para cada problema crítico ou alerta, avalie:
1. Facilidade de implementação (1-5, sendo 5 = muito fácil)
2. Impacto esperado (1-5, sendo 5 = muito alto)
3. Dependências de outras ações

Retorne uma lista priorizada (não é apenas por severidade!) com:
- Ação a tomar
- Por que é importante
- Estimativa de esforço
- Impacto esperado

Formato: use markdown com subtítulos (##) para cada ação.`;

  const cacheKey = generateCacheKey(prompt, context);
  
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return {
      content: cached.data,
      tokens: cached.tokens,
      cost: (cached.tokens.input * TOKEN_COST.input) + (cached.tokens.output * TOKEN_COST.output),
      cached: true,
    };
  }

  const systemPrompt = `Você é um especialista em otimização de contas Meta Ads.
Priorize ações baseado em ROI (retorno sobre investimento em tempo).
Considere que nem sempre o mais crítico é o mais urgente — às vezes vale mais fazer algo menor e fácil que libera o maior.`;

  const result = await callClaudeWithRetry(prompt, systemPrompt);
  
  cache.set(cacheKey, {
    data: result.content,
    timestamp: Date.now(),
    tokens: result.tokens,
  });

  const cost = (result.tokens.input * TOKEN_COST.input) + (result.tokens.output * TOKEN_COST.output);
  return {
    content: result.content,
    tokens: result.tokens,
    cost,
    cached: false,
  };
}

export async function logTokenUsage(
  tenantId: string,
  featureName: string,
  tokens: { input: number; output: number }
): Promise<void> {
  const cost = (tokens.input * TOKEN_COST.input) + (tokens.output * TOKEN_COST.output);
  
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    tenantId,
    feature: featureName,
    input_tokens: tokens.input,
    output_tokens: tokens.output,
    cost_usd: cost.toFixed(6),
  }));
}

