import { syncClientData } from "@/lib/meta-api";
import { MetaRequestError } from "@/lib/meta-fetch";
import { errorMessage } from "@/lib/utils";

export interface BulkSyncTarget {
  id: string;
  name: string;
  meta_ad_account_id: string;
  meta_access_token: string;
}

export interface BulkSyncOutcome {
  id: string;
  name: string;
  ok: boolean;
  error?: string;
}

export interface BulkSyncReport {
  outcomes: BulkSyncOutcome[];
  abortedReason: string | null;
}

export interface BulkSyncOptions {
  maxConsecutiveFailures?: number;
  onProgress?: (message: string, done: number, total: number) => void;
}

// Parar cedo nao e frescura: o Full Access da Marketing API exige taxa de erro
// abaixo de 15% nas ultimas 500 chamadas, entao insistir em 59 contas que ja
// estao falhando queima justamente a elegibilidade que a agencia precisa. E se
// a Meta ja respondeu limite de taxa, continuar so piora — o meta-fetch ja
// tentou degradar o lote antes de deixar o erro subir ate aqui.
export async function syncClientsSequentially(
  targets: BulkSyncTarget[],
  options: BulkSyncOptions = {}
): Promise<BulkSyncReport> {
  const maxConsecutive = options.maxConsecutiveFailures ?? 3;
  const outcomes: BulkSyncOutcome[] = [];
  let consecutive = 0;
  let abortedReason: string | null = null;

  for (const [index, target] of targets.entries()) {
    options.onProgress?.(target.name, index, targets.length);

    try {
      await syncClientData(target.id, target.meta_ad_account_id, target.meta_access_token);
      outcomes.push({ id: target.id, name: target.name, ok: true });
      consecutive = 0;
    } catch (error) {
      const message = errorMessage(error, "Falha ao sincronizar");
      outcomes.push({ id: target.id, name: target.name, ok: false, error: message });
      consecutive += 1;

      if (error instanceof MetaRequestError && error.retryable) {
        abortedReason = `A Meta respondeu limite de taxa em ${target.name}. Parei aqui para nao piorar; tente de novo daqui a pouco.`;
        break;
      }

      if (consecutive >= maxConsecutive) {
        abortedReason = `${consecutive} falhas seguidas (a ultima em ${target.name}). Parei para nao queimar a taxa de erro que a Meta olha; resolva a causa e rode de novo.`;
        break;
      }
    }
  }

  options.onProgress?.("", outcomes.length, targets.length);
  return { outcomes, abortedReason };
}

// ─── Selecao de quem entra no vinculo em massa ────────────────────────────────

export interface BulkConnectClient {
  id: string;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
  meta_instagram_account_id: string | null;
  meta_sync_status: string | null;
}

export interface BulkConnectAssignment {
  accountId: string;
  pageId: string;
  instagramId: string;
}

/**
 * Conta vinculada na conta Meta certa, mas com credencial podre.
 *
 * Em 17/09/2026 eram 15 clientes assim: 14 com `(#200) Ad account owner has NOT
 * grant ads_management or ads_read` e 1 com sessao invalidada por troca de senha.
 * O vinculo estava correto nos 15 — o que venceu foi o token.
 */
export function precisaReconectar(client: Pick<BulkConnectClient, "meta_sync_status">): boolean {
  return client.meta_sync_status === "error" || client.meta_sync_status === "expired";
}

/**
 * Quem o vinculo em massa deve regravar.
 *
 * Regra original: so quem mudou de fato, porque reescrever vinculo correto
 * queima chamada da Meta e mexe no logo_url a toa. A excecao e a conta
 * quebrada — nela nada mudou justamente porque o vinculo ja estava certo, e e
 * o token que precisa ser reescrito. Sem essa excecao o login novo roda e nao
 * conserta ninguem, que e o pior tipo de falha: silenciosa.
 *
 * Conta que o login novo nao enxerga fica de fora: sem `accountId` nao ha o que
 * gravar, e insistir so geraria erro na Meta.
 */
export function selecionarParaGravar<T extends BulkConnectClient>(
  clients: T[],
  assignments: Record<string, BulkConnectAssignment | undefined>
): T[] {
  return clients.filter((client) => {
    const assignment = assignments[client.id];
    if (!assignment?.accountId) return false;
    if (precisaReconectar(client)) return true;
    return (
      assignment.accountId !== client.meta_ad_account_id ||
      (assignment.pageId || null) !== client.meta_page_id ||
      (assignment.instagramId || null) !== client.meta_instagram_account_id
    );
  });
}
