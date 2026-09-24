// A Graph API responde `code: 1` ("Please reduce the amount of data you're
// asking for, then retry your request") quando a query custa caro demais pra
// ser resolvida de forma sincrona — nao e token invalido nem falta de
// permissao. A saida que a propria mensagem sugere e pedir menos por pagina,
// entao degradamos o `limit` e repetimos antes de desistir.

export interface MetaApiError {
  message?: string;
  code?: number;
  error_subcode?: number;
  type?: string;
}

// 1 = query cara demais; 4/17/32/613 = limites de taxa. Nos dois casos a
// reacao util e a mesma: lote menor e backoff.
const RETRYABLE_CODES = new Set([1, 4, 17, 32, 613]);
const OVERSIZED_PATTERN = /reduce the amount of data|too much data|please reduce/i;

const DEFAULT_LIMIT = 100;
const DEFAULT_MIN_LIMIT = 10;
const MAX_PAGES = 400;

function isRetryable(error?: MetaApiError | null): boolean {
  if (!error) return false;
  if (typeof error.code === "number" && RETRYABLE_CODES.has(error.code)) return true;
  return OVERSIZED_PATTERN.test(error.message ?? "");
}

export class MetaRequestError extends Error {
  readonly code?: number;
  readonly subcode?: number;
  readonly retryable: boolean;

  constructor(error: MetaApiError | undefined | null, fallback: string) {
    super(error?.message || fallback);
    this.name = "MetaRequestError";
    this.code = error?.code;
    this.subcode = error?.error_subcode;
    this.retryable = isRetryable(error);
  }
}

export function isOversizedMetaError(error: unknown): boolean {
  return error instanceof MetaRequestError && error.retryable;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(base: string, path: string, params: Record<string, string>) {
  return `${base}/${path}?${new URLSearchParams(params)}`;
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);

  if (!response.ok || json?.error) {
    throw new MetaRequestError(json?.error, `Erro ${response.status} ao buscar dados na Meta`);
  }

  return json as T;
}

interface PagedResponse<T> {
  data?: T[];
  paging?: { next?: string };
}

async function collectPages<T>(base: string, path: string, params: Record<string, string>): Promise<T[]> {
  let url: string | undefined = buildUrl(base, path, params);
  const items: T[] = [];
  let pages = 0;

  while (url && pages < MAX_PAGES) {
    const json = await requestJson<PagedResponse<T>>(url);
    items.push(...(json.data ?? []));
    url = json.paging?.next;
    pages++;
  }

  return items;
}

// Traduz a recusa por volume pra algo acionavel — a mensagem crua da Meta
// chega no toast sem contexto nenhum e nao diz o que o usuario deve fazer.
function exhausted(error: MetaRequestError, limit: number): MetaRequestError {
  const detail = error.code === 1
    ? `A Meta recusou a consulta por volume de dados mesmo em lotes de ${limit}.`
    : `A Meta esta limitando as requisicoes (erro ${error.code ?? "?"}).`;
  const rewritten = new MetaRequestError(
    { message: `${detail} Tente um periodo menor ou repita em alguns minutos.`, code: error.code, error_subcode: error.subcode },
    "Erro ao buscar dados na Meta"
  );
  return rewritten;
}

export interface MetaFetchOptions {
  limit?: number;
  minLimit?: number;
}

export async function metaGet<T>(base: string, path: string, params: Record<string, string>): Promise<T> {
  return requestJson<T>(buildUrl(base, path, params));
}

export async function metaGetAll<T>(
  base: string,
  path: string,
  params: Record<string, string>,
  options: MetaFetchOptions = {}
): Promise<T[]> {
  const minLimit = options.minLimit ?? DEFAULT_MIN_LIMIT;
  let limit = options.limit ?? (Number(params.limit) || DEFAULT_LIMIT);
  let attempt = 0;

  for (;;) {
    try {
      return await collectPages<T>(base, path, { ...params, limit: String(limit) });
    } catch (error) {
      if (!isOversizedMetaError(error) || limit <= minLimit) {
        if (isOversizedMetaError(error)) throw exhausted(error as MetaRequestError, limit);
        throw error;
      }
      limit = Math.max(minLimit, Math.floor(limit / 4));
      attempt++;
      await sleep(Math.min(4000, 400 * 2 ** attempt));
    }
  }
}

// Divide um intervalo em janelas menores. Consultas com `time_increment=1` no
// nivel de anuncio estouram o orcamento da Meta em periodos longos; pedir
// semana a semana custa varias requisicoes baratas em vez de uma impossivel.
export function splitDateRange(since: string, until: string, windowDays: number): Array<{ since: string; until: string }> {
  const start = new Date(`${since}T00:00:00Z`).getTime();
  const end = new Date(`${until}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [{ since, until }];

  const step = windowDays * 86400000;
  const windows: Array<{ since: string; until: string }> = [];

  for (let cursor = start; cursor <= end; cursor += step) {
    const windowEnd = Math.min(cursor + step - 86400000, end);
    windows.push({
      since: new Date(cursor).toISOString().slice(0, 10),
      until: new Date(windowEnd).toISOString().slice(0, 10),
    });
  }

  return windows.length ? windows : [{ since, until }];
}

export function presetToRange(datePreset: string): { since: string; until: string } {
  const presetDays: Record<string, number> = {
    today: 1,
    yesterday: 1,
    last_7d: 7,
    last_14d: 14,
    last_30d: 30,
    last_60d: 60,
    last_90d: 90,
  };

  const days = presetDays[datePreset] ?? 30;
  const until = new Date();
  const since = new Date(until.getTime() - (days - 1) * 86400000);

  return { since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) };
}
