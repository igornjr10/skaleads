import { metaGet, metaGetAll, MetaRequestError } from "@/lib/meta-fetch";
import { discoverAdAccounts, fetchBusinessIds } from "@/lib/meta-discovery";

const META_BASE = "https://graph.facebook.com/v21.0";

export type StepStatus = "ok" | "fail" | "warn";

export interface DiagnosticStep {
  id: string;
  label: string;
  status: StepStatus;
  detail: string;
  fix?: string;
}

// Os tres cadeados que produzem o mesmo "(#200) Ad account owner has NOT grant
// ads_management or ads_read permission" na sync, sem distinguir qual e.
export type Culprit = "token" | "escopo" | "cargo" | "app" | "nenhum" | "indefinido";

export interface MetaDiagnosis {
  checkedAt: string;
  culprit: Culprit;
  verdict: string;
  steps: DiagnosticStep[];
}

interface PermissionRow {
  permission: string;
  status: "granted" | "declined" | "expired";
}

interface AdAccountRow {
  id: string;
  name?: string;
  account_status?: number;
}

function normalize(id: string): string {
  return id.startsWith("act_") ? id.slice(4) : id.trim();
}

function asMetaError(error: unknown): MetaRequestError | null {
  return error instanceof MetaRequestError ? error : null;
}

export async function diagnoseMetaConnection(
  adAccountId: string,
  accessToken: string
): Promise<MetaDiagnosis> {
  const accountId = normalize(adAccountId);
  const token = accessToken.trim();
  const steps: DiagnosticStep[] = [];
  const checkedAt = new Date().toISOString();

  const done = (culprit: Culprit, verdict: string): MetaDiagnosis => ({
    checkedAt,
    culprit,
    verdict,
    steps,
  });

  // 1. O token ainda vale? Falhar aqui nao encerra o diagnostico: os passos
  // seguintes e que dizem se o problema e validade, escopo ou cargo.
  let tokenVivo = false;
  let tokenSemPerfil = false;
  try {
    const me = await metaGet<{ id: string; name?: string }>(META_BASE, "me", {
      fields: "id,name",
      access_token: token,
    });
    tokenVivo = true;
    steps.push({
      id: "token",
      label: "Token de acesso",
      status: "ok",
      detail: `Valido, emitido para ${me.name ?? me.id}.`,
    });
  } catch (error) {
    const meta = asMetaError(error);
    // 190 = token expirado ou revogado. 100 e outra coisa: o token existe, mas nao
    // resolve /me porque nao carrega nem public_profile — o que so acontece quando o
    // login foi concedido sem permissao alguma (tipico de origem nao autorizada).
    const expirado = meta?.code === 190;
    tokenSemPerfil = !expirado;
    steps.push({
      id: "token",
      label: "Token de acesso",
      status: "fail",
      detail: meta?.message ?? "Nao foi possivel validar o token.",
      fix: expirado
        ? "Token expirado ou revogado. Reconecte o cliente para gerar um novo."
        : "O token nao le nem o perfil basico (public_profile), sinal de que o login nao concedeu permissao nenhuma. Confira o dominio manager.marketprosystem.com em Configuracoes > Basico e em Login do Facebook > Dominios permitidos para o SDK JavaScript, depois reconecte o cliente.",
    });
  }

  // 2. A Meta concedeu ads_read/ads_management para esse token?
  let temAds = false;
  try {
    const permissions = await metaGetAll<PermissionRow>(META_BASE, "me/permissions", {
      access_token: token,
    });
    const granted = permissions.filter((p) => p.status === "granted").map((p) => p.permission);
    const declined = permissions.filter((p) => p.status !== "granted").map((p) => p.permission);
    temAds = granted.includes("ads_read") || granted.includes("ads_management");

    if (temAds) {
      steps.push({
        id: "escopo",
        label: "Permissao de anuncios",
        status: "ok",
        detail: `Concedidas: ${granted.join(", ") || "nenhuma"}.`,
      });
    } else {
      steps.push({
        id: "escopo",
        label: "Permissao de anuncios",
        status: "fail",
        detail:
          declined.length > 0
            ? `ads_read nao foi concedida. Recusadas ou expiradas: ${declined.join(", ")}.`
            : "A Meta nao devolveu ads_read nem ads_management para este token.",
        fix:
          "Confirme o dominio do app no painel da Meta (Configuracoes > Basico e Login do Facebook > Dominios do SDK JavaScript), depois reconecte o cliente mantendo todas as permissoes marcadas. Se persistir, o app precisa de Acesso avancado a ads_read (App Review) ou o usuario precisa ser Testador do app.",
      });
    }
  } catch (error) {
    const meta = asMetaError(error);
    steps.push({
      id: "escopo",
      label: "Permissao de anuncios",
      status: "warn",
      detail: meta?.message ?? "Nao foi possivel listar as permissoes do token.",
    });
  }

  // 3. Cargo direto na conta, que e o que a sync exige. A distincao que importa:
  // me/adaccounts so devolve conta onde o usuario tem cargo, enquanto a tela de
  // conexao lista tambem os edges do Business Manager — que mostram tudo que
  // existe no BM, inclusive conta sem cargo atribuido. Por isso a conta aparece
  // na lista ao conectar e depois falha ao sincronizar.
  let contaVisivel = false;
  let soNoBusinessManager = false;
  let totalContas = 0;
  try {
    const accounts = await metaGetAll<AdAccountRow>(META_BASE, "me/adaccounts", {
      fields: "id,name,account_status",
      access_token: token,
    });
    totalContas = accounts.length;
    contaVisivel = accounts.some((account) => normalize(account.id) === accountId);

    if (!contaVisivel) {
      const businessIds = await fetchBusinessIds(token);
      const doBm = await discoverAdAccounts(token, businessIds);
      soNoBusinessManager = doBm.some((account) => normalize(account.id) === accountId);
    }

    steps.push({
      id: "cargo",
      label: "Cargo na conta de anuncios",
      status: contaVisivel ? "ok" : "fail",
      detail: contaVisivel
        ? `A conta act_${accountId} esta entre as ${totalContas} em que este usuario tem cargo.`
        : soNoBusinessManager
          ? `A conta act_${accountId} existe no seu Business Manager, mas NAO esta entre as ${totalContas} em que este usuario tem cargo. E por isso que ela aparece na lista ao conectar e falha ao sincronizar.`
          : `A conta act_${accountId} NAO aparece nem com cargo direto nem no Business Manager deste usuario.`,
      fix: contaVisivel
        ? undefined
        : soNoBusinessManager
          ? "Business Manager > Configuracoes > Contas de anuncio > selecione a conta > Adicionar pessoas, e atribua ao menos Analista de anuncios ao usuario que fez a conexao. Estar no BM nao basta: a sync le act_<id> direto e a Meta cobra cargo nessa conta."
          : "Confirme que a conta foi compartilhada com o seu Business Manager e que o usuario que conectou tem acesso a ela.",
    });
  } catch (error) {
    const meta = asMetaError(error);
    steps.push({
      id: "cargo",
      label: "Cargo na conta de anuncios",
      status: "warn",
      detail: meta?.message ?? "Nao foi possivel listar as contas do usuario.",
    });
  }

  // 4. O teste que importa: a mesma leitura que a sync faz.
  try {
    const account = await metaGet<{ id: string; name?: string; account_status?: number }>(
      META_BASE,
      `act_${accountId}`,
      { fields: "id,name,account_status", access_token: token }
    );
    steps.push({
      id: "leitura",
      label: "Leitura da conta",
      status: "ok",
      detail: `Conta lida com sucesso: ${account.name ?? account.id}.`,
    });
    return done("nenhum", "Conexao saudavel. A sync desse cliente deve funcionar.");
  } catch (error) {
    const meta = asMetaError(error);
    const mensagem = meta?.message ?? "Falha ao ler a conta de anuncios.";
    const ehErro200 = meta?.code === 200 || /NOT grant/i.test(mensagem);

    steps.push({
      id: "leitura",
      label: "Leitura da conta",
      status: "fail",
      detail: mensagem,
    });

    if (tokenSemPerfil && !temAds) {
      return done(
        "escopo",
        "Este token foi salvo sem permissao nenhuma — nem ads_read, nem o perfil basico. Quase sempre e o dominio do app faltando no painel da Meta. Corrija o dominio e reconecte o cliente."
      );
    }
    if (!tokenVivo) {
      return done("token", "O token salvo nao vale mais. Reconecte o cliente.");
    }
    if (!temAds) {
      return done(
        "escopo",
        "O token nao carrega ads_read. Corrija o dominio do app e reconecte o cliente; se continuar, e App Review."
      );
    }
    if (!contaVisivel) {
      return done(
        "cargo",
        soNoBusinessManager
          ? "O token tem ads_read e a conta esta no seu Business Manager, mas o usuario nao tem cargo nela. Por isso conectar funciona e sincronizar falha. Atribua o usuario a conta no BM."
          : "O token tem ads_read, mas o usuario nao tem cargo nessa conta. Resolve-se no Business Manager, nao na Meta."
      );
    }
    if (ehErro200) {
      return done(
        "app",
        "Token e cargo estao certos, e a Meta ainda recusa: o app nao tem acesso liberado a essa conta. Adicione a conta em Ativos conectados e nas contas autorizadas do app."
      );
    }
    return done("indefinido", mensagem);
  }
}
