import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/env";
import type { MetaAdAccount } from "@/lib/facebook-sdk";

// A Meta deixa desmarcar permissao por permissao na tela de consentimento. Sem
// ads_read a conexao ainda assim salva, e so a sync falha depois com
// "(#200) Ad account owner has NOT grant ads_management or ads_read permission"
// — erro que nao aponta para a origem. Barrar aqui, com o usuario ainda no fluxo.
//
// Lista vazia nao e sinal de que esta tudo bem: com `return_scopes: true` a Meta
// so omite os escopos quando recusa a origem (dominio do app nao configurado) ou
// quando quem logou nao tem funcao no app e a permissao esta em acesso padrao —
// que, segundo a documentacao, so pode ser concedida por quem tem funcao.
export function ensureAdsScope(grantedScopes: string[]): void {
  const temAds = grantedScopes.some((scope) => scope === "ads_read" || scope === "ads_management");
  if (temAds) return;

  throw new Error(
    grantedScopes.length === 0
      ? "A Meta nao informou nenhuma permissao para este login. As duas causas sao o dominio do app (confira manager.marketprosystem.com em Configuracoes > Basico e em Login do Facebook > Dominios permitidos para o SDK JavaScript) e quem logou nao ter funcao no app enquanto ads_read estiver em acesso padrao."
      : `Voce nao autorizou o acesso aos anuncios (ads_read). Sem essa permissao nao da para sincronizar campanhas. Permissoes recebidas: ${grantedScopes.join(", ")}. Clique em conectar de novo e mantenha todas marcadas.`
  );
}

export interface MetaTokenExchange {
  access_token: string;
  ad_accounts?: MetaAdAccount[];
  business_ids?: string[];
}

export async function exchangeMetaToken(shortLivedToken: string): Promise<MetaTokenExchange> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-exchange-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ short_lived_token: shortLivedToken }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data as MetaTokenExchange;
}

const NOISE = /\b(ca|conta|de|anuncios?|ads?|pix|loja|store|oficial|br|ltda|me|mei)\b/g;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalize(value).split(" ").filter((part) => part.length > 2);
}

// Pontua so por palavra inteira compartilhada: "MARE" casa com "CA - MARE (PIX)"
// sem casar com "MARE FIT", que tem uma palavra a mais e fica com nota menor.
export function matchScore(clientName: string, candidateName: string): number {
  const a = tokens(clientName);
  const b = tokens(candidateName);
  if (a.length === 0 || b.length === 0) return 0;

  const shared = a.filter((part) => b.includes(part)).length;
  if (shared === 0) return 0;

  return (2 * shared) / (a.length + b.length);
}

export function suggestByName<T>(
  clientName: string,
  candidates: T[],
  nameOf: (candidate: T) => string,
  minScore = 0.5
): T | null {
  let best: T | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = matchScore(clientName, nameOf(candidate));
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return bestScore >= minScore ? best : null;
}
