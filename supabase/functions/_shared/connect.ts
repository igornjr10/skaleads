// Client HTTP do Reportei Connect.
//
// A chave do merchant da acesso aos dados de TODOS os clientes, entao ela so
// existe aqui dentro: nada neste arquivo pode ser importado por codigo que
// roda no browser.
//
// Contrato: https://connect.reportei.com/openapi.json — a spec manda, nao a
// memoria de quem escreve.

const BASE_URL = "https://connect.reportei.com/api";
const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 4;

export type ConnectErrorKind =
  | "form_validation"   // { errors: { campo: [msg] } }
  | "metrics_refusal"   // { message, extra }
  | "message"           // { message }
  | "transport";        // timeout, DNS, rede

/**
 * O Connect usa tres envelopes de erro diferentes. O status HTTP e o unico
 * sinal presente em todos, entao e por ele que ramificamos; num 422 ainda e
 * preciso olhar qual das duas chaves veio.
 */
export class ConnectError extends Error {
  readonly status: number;
  readonly kind: ConnectErrorKind;
  readonly fieldErrors?: Record<string, string[]>;
  readonly extra?: unknown;

  constructor(args: {
    status: number;
    kind: ConnectErrorKind;
    message: string;
    fieldErrors?: Record<string, string[]>;
    extra?: unknown;
  }) {
    super(args.message);
    this.name = "ConnectError";
    this.status = args.status;
    this.kind = args.kind;
    this.fieldErrors = args.fieldErrors;
    this.extra = args.extra;
  }

  /** O que vai para o log: a mensagem e quem diz *qual* recusa foi. */
  toLog() {
    return {
      status: this.status,
      kind: this.kind,
      message: this.message,
      ...(this.fieldErrors ? { fieldErrors: this.fieldErrors } : {}),
      ...(this.extra !== undefined ? { extra: this.extra } : {}),
    };
  }
}

function apiKey(): string {
  const key = Deno.env.get("CONNECT_API_KEY");
  if (!key) {
    throw new ConnectError({
      status: 0,
      kind: "transport",
      message: "CONNECT_API_KEY nao configurada no ambiente da Edge Function",
    });
  }
  return key;
}

function parseError(status: number, body: unknown): ConnectError {
  const b = (body ?? {}) as Record<string, unknown>;

  // 422 carrega dois envelopes possiveis; a chave presente decide qual.
  if (b.errors && typeof b.errors === "object") {
    const fieldErrors = b.errors as Record<string, string[]>;
    const first = Object.entries(fieldErrors)[0];
    return new ConnectError({
      status,
      kind: "form_validation",
      message: first ? `${first[0]}: ${first[1]?.[0] ?? "invalido"}` : "Falha de validacao",
      fieldErrors,
    });
  }

  const message = typeof b.message === "string" ? b.message : `HTTP ${status}`;
  if ("extra" in b) {
    return new ConnectError({ status, kind: "metrics_refusal", message, extra: b.extra });
  }
  return new ConnectError({ status, kind: "message", message });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Backoff exponencial com jitter; respeita Retry-After quando o servidor manda. */
function backoffMs(attempt: number, retryAfter: string | null): number {
  const header = Number(retryAfter);
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, 30_000);
  const base = Math.min(500 * 2 ** (attempt - 1), 8_000);
  return base + Math.random() * 250;
}

export interface ConnectRequest {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** `api_token` do customer. Obrigatorio nos endpoints de escopo do cliente. */
  customerToken?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

export async function connectFetch<T = unknown>(
  path: string,
  opts: ConnectRequest = {},
): Promise<T> {
  const { method = "GET", customerToken, body, query } = opts;

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey()}`,
    Accept: "application/json",
  };
  if (customerToken) headers["x-customer-token"] = customerToken;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let lastError: ConnectError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      // Timeout e falha de rede sao transitorios: valem retry.
      lastError = new ConnectError({
        status: 0,
        kind: "transport",
        message: e instanceof Error ? e.message : "falha de rede",
      });
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
      throw lastError;
    }

    if (res.ok) {
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    }

    const payload = await res.json().catch(() => null);
    const err = parseError(res.status, payload);

    // So 429 e 5xx mudam de resposta se repetidos. Um 4xx nao muda.
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) throw err;

    lastError = err;
    await sleep(backoffMs(attempt, res.headers.get("Retry-After")));
  }

  throw lastError ?? new ConnectError({ status: 0, kind: "transport", message: "esgotou tentativas" });
}
