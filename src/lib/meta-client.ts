import { supabase } from "@/integrations/supabase/client";

export { credencialDaPagina, credencialDoCliente } from "./meta-fetch";

/**
 * Guarda os tokens da Meta no cofre (client_secrets) pela Edge Function
 * meta-store-token. Depois disso o browser so fala com a Meta por
 * `credencialDoCliente(id)`: `clients` nao carrega mais token nenhum.
 */
export async function guardarTokensMeta(clientId: string, tokens: { token?: string | null; pageToken?: string | null }) {
  const token = tokens.token?.trim() || undefined;
  const pageToken = tokens.pageToken?.trim() || undefined;
  if (!token && !pageToken) return;

  const { data, error } = await supabase.functions.invoke("meta-store-token", { body: { clientId, token, pageToken } });
  if (error) {
    let message = error.message;
    try {
      const payload = await (error as { context?: Response }).context?.json();
      if (payload?.error) message = payload.error;
    } catch {
      /* corpo nao-JSON */
    }
    throw new Error(`Não consegui guardar o token da Meta: ${message}`);
  }
  if (data?.error) throw new Error(`Não consegui guardar o token da Meta: ${data.error}`);
}
