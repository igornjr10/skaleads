// Shared Claude Service for all AI Edge Functions
// Features: retry, caching, rate limiting, token logging

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

async function callClaudeWithRetry(
  prompt: string,
  systemPrompt?: string,
  messages?: ClaudeMessage[],
  maxRetries = 3,
  retryDelay = 1000
): Promise<{ content: string; tokens: { input: number; output: number } }> {
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

export async function analyzeCreatives(
  tenantId: string,
  creatives: { copy: string; visual_description: string; metrics: Record<string, number> }[],
  context?: string
): Promise<ClaudeResponse> {
  if (!checkRateLimit(tenantId)) {
    throw new Error(`Taxa limite excedida para tenant ${tenantId}`);
  }

  const creativesJson = creatives
    .map(c => `- ${c.copy}\n  Descrição visual: ${c.visual_description}\n  Métricas: ${JSON.stringify(c.metrics)}`)
    .join("\n\n");

  const prompt = `Analise os 5 criativos vencedores de anúncios abaixo e identifique padrões:

${creativesJson}

Por favor:
1. Identifique 3 padrões principais (ângulos, ganchos, CTAs)
2. Sugira 3 novos criativos baseados nesses padrões
3. Justifique cada sugestão explicando qual padrão ela segue`;

  const cacheKey = generateCacheKey(prompt, context);
  
  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return {
      content: cached.data,
      tokens: cached.tokens,
      cost: (cached.tokens.input * TOKEN_COST.input) + (cached.tokens.output * TOKEN_COST.output),
      cached: true,
    };
  }

  const systemPrompt = `Você é um especialista em marketing digital e análise criativa de anúncios.
Responda em português brasileiro profissional e acionável.
Foque em insights práticos que possam ser implementados imediatamente.`;

  const result = await callClaudeWithRetry(prompt, systemPrompt);
  
  // Store in cache
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

export async function generateCopy(
  tenantId: string,
  clientInfo: { name: string; industry?: string },
  objective: string,
  tone: "professional" | "casual" | "urgent" | "inspirational",
  briefing: string,
  context?: string
): Promise<ClaudeResponse> {
  if (!checkRateLimit(tenantId)) {
    throw new Error(`Taxa limite excedida para tenant ${tenantId}`);
  }

  const toneDescriptions: Record<string, string> = {
    professional: "Profissional, confiante, baseado em dados",
    casual: "Descontraído, amigável, conversacional",
    urgent: "Senso de urgência, FOMO, ação imediata",
    inspirational: "Inspirador, aspiracional, emocional",
  };

  const prompt = `Gere copy para anúncios Meta Ads baseado nos seguintes detalhes:

Cliente: ${clientInfo.name}
Indústria: ${clientInfo.industry || "Não especificada"}
Objetivo: ${objective}
Tom: ${toneDescriptions[tone]}
Briefing: ${briefing}

Por favor, gere:
1. 5 variações de headline (máx 30 caracteres cada)
2. 3 variações de primary text (máx 125 caracteres cada)
3. 3 variações de description (máx 30 caracteres cada)

Para cada variação, indique o estilo usado (ex: "FOMO", "Benefit-driven", "Social Proof", etc).
Formato: use markdown com listas e **negrito** para destaques.`;

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

  const systemPrompt = `Você é um copywriter especialista em publicidade digital em português.
Crie copy persuasivo, claro e acionável.
Leve em conta o tom solicitado e adapte a mensagem para máxima conversão.`;

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

export async function summarizeReport(
  tenantId: string,
  period: { start: string; end: string },
  metrics: Record<string, number>,
  context?: string
): Promise<ClaudeResponse> {
  if (!checkRateLimit(tenantId)) {
    throw new Error(`Taxa limite excedida para tenant ${tenantId}`);
  }

  const metricsText = Object.entries(metrics)
    .map(([key, value]) => `- ${key}: ${typeof value === 'number' ? value.toFixed(2) : value}`)
    .join("\n");

  const prompt = `Gere um resumo executivo profissional (4-6 linhas em português) para um relatório de campanhas de publicidade.

Período: ${period.start} a ${period.end}
Métricas:
${metricsText}

O resumo deve:
1. Destacar o que funcionou bem
2. Apontar um problema que precisa de atenção
3. Fazer uma recomendação principal e acionável

Responda apenas com o parágrafo do resumo, sem títulos ou formatação extra.`;

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

  const systemPrompt = `Você é um analista experiente em publicidade digital.
Escreva resumos executivos concisos, profissionais e acionáveis em português brasileiro.
Seja direto e evite jargão desnecessário.`;

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

