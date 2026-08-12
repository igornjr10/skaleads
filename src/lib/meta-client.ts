import { supabase } from "@/integrations/supabase/client";

// O token da Meta nunca chega no browser: toda chamada a Graph API passa pela
// Edge Function meta-proxy, que resolve o token pelo clientId no servidor.
// rawToken so existe para o formulario de conexao, onde o operador acabou de
// digitar o token e o cliente ainda nao foi salvo.
export type MetaSource = { clientId: string; rawToken?: never } | { rawToken: string; clientId?: string };

type MetaParams = Record<string, string | number | boolean | undefined | null>;

function serialize(params: MetaParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    out[key] = String(value);
  }
  return out;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("meta-proxy", { body });

  if (error) {
    // A mensagem util (inclusive "token expirado", que o app usa para marcar o
    // status da integracao) vem no corpo da resposta, nao no error.message.
    let message = error.message;
    try {
      const payload = await (error as { context?: Response }).context?.json();
      if (payload?.error) message = payload.error;
    } catch {
      /* corpo nao-JSON: fica a mensagem generica */
    }
    throw new Error(message);
  }

  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String(data.error));
  }

  return data as T;
}

export function metaGet<T>(source: MetaSource, path: string, params: MetaParams = {}): Promise<T> {
  return invoke<T>({ ...source, path, params: serialize(params), mode: "object" });
}

export async function metaGetAll<T>(source: MetaSource, path: string, params: MetaParams = {}): Promise<T[]> {
  const result = await invoke<{ data: T[] }>({
    ...source,
    path,
    params: serialize(params),
    mode: "list",
  });
  return result?.data ?? [];
}
