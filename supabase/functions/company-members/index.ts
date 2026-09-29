import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { companyIdsOf, getUser, hasAnyRole, isUuid, jsonResponse } from "../_shared/auth.ts";

// Equipe da empresa: o ADM convida, troca papel, libera modulos, atribui
// clientes e tira gente. Roda com service_role porque user_roles e
// user_companies so aceitam escrita do owner da plataforma — e a regra de quem
// pode mexer em quem vive aqui, num lugar so.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Owner e papel da plataforma, nao da empresa: nunca sai por esta porta.
const PAPEIS_ATRIBUIVEIS = ["admin", "analyst", "viewer", "editor", "designer", "sdr", "closer", "social_seller"];

// Espelho de MODULOS em src/lib/permissoes.ts.
const MODULOS = [
  "dashboard", "agencia", "clientes", "contratos", "financeiro", "demandas",
  "rotina", "campanhas", "alertas", "envios", "ia",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mesma ordem de get_my_role(): com mais de um papel, vale o mais forte.
const ORDEM_PAPEIS = ["owner", "admin", "analyst", "closer", "sdr", "social_seller", "editor", "designer", "viewer"];

function papelMaisForte(papeis: string[]): string | null {
  return ORDEM_PAPEIS.find(p => papeis.includes(p)) ?? null;
}

function json(body: unknown, status = 200) {
  return jsonResponse(corsHeaders, body, status);
}

function env() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
  return { supabaseUrl, svcKey };
}

async function db(path: string, init: RequestInit = {}) {
  const { supabaseUrl, svcKey } = env();
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path.split("?")[0]}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function papelDe(userId: string): Promise<string | null> {
  const rows = await db(`user_roles?user_id=eq.${userId}&select=role`);
  return papelMaisForte((rows ?? []).map((r: { role: string }) => r.role));
}

async function definirPapel(userId: string, role: string) {
  await db(`user_roles?user_id=eq.${userId}`, { method: "DELETE" });
  await db("user_roles", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, role }),
  });
}

function validarModulos(modulos: unknown): string[] | null | "invalido" {
  if (modulos === null || modulos === undefined) return null;
  if (!Array.isArray(modulos) || modulos.some(m => !MODULOS.includes(m))) return "invalido";
  return [...new Set(modulos as string[])];
}

/** Aceita so clientes desta empresa: um id de fora recusa a lista inteira. */
async function validarClientes(companyId: string, clientIds: unknown): Promise<string[] | "invalido"> {
  if (!Array.isArray(clientIds)) return "invalido";
  if (clientIds.length === 0) return [];
  if (!clientIds.every(isUuid)) return "invalido";
  const ids = [...new Set(clientIds as string[])];
  const achados = await db(`clients?id=in.(${ids.join(",")})&company_id=eq.${companyId}&select=id`);
  return (achados ?? []).length === ids.length ? ids : "invalido";
}

async function definirClientes(companyId: string, userId: string, clientIds: string[]) {
  await db(`client_assignments?user_id=eq.${userId}&company_id=eq.${companyId}`, { method: "DELETE" });
  if (clientIds.length === 0) return;
  await db("client_assignments", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(clientIds.map(client_id => ({ client_id, user_id: userId, company_id: companyId }))),
  });
}

async function vinculo(companyId: string, userId: string) {
  const rows = await db(`user_companies?company_id=eq.${companyId}&user_id=eq.${userId}&select=user_id`);
  return (rows ?? []).length > 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const caller = await getUser(req);
    if (!caller) return json({ error: "Sessão inválida" }, 401);

    const isOwner = await hasAnyRole(caller.id, ["owner"]);
    if (!isOwner && !(await hasAnyRole(caller.id, ["admin"]))) {
      return json({ error: "Só o ADM da empresa gerencia a equipe" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    // Owner da plataforma pode apontar a empresa; o admin mexe so na dele.
    const minhas = await companyIdsOf(caller.id);
    const companyId: string | undefined = isOwner && isUuid(body.company_id) ? body.company_id : minhas[0];
    if (!companyId) return json({ error: "Você não está vinculado a nenhuma empresa" }, 400);

    if (action === "list") {
      const links = await db(`user_companies?company_id=eq.${companyId}&select=user_id,modulos`);
      const ids: string[] = (links ?? []).map((l: { user_id: string }) => l.user_id);
      if (ids.length === 0) return json({ members: [] });

      const lista = ids.join(",");
      const [perfis, papeis, atribuicoes] = await Promise.all([
        db(`profiles?id=in.(${lista})&select=id,email,full_name`),
        db(`user_roles?user_id=in.(${lista})&select=user_id,role`),
        db(`client_assignments?company_id=eq.${companyId}&user_id=in.(${lista})&select=user_id,client_id`),
      ]);

      const members = (links ?? []).map((l: { user_id: string; modulos: string[] | null }) => {
        const perfil = (perfis ?? []).find((p: { id: string }) => p.id === l.user_id);
        const dele = (papeis ?? []).filter((r: { user_id: string }) => r.user_id === l.user_id).map((r: { role: string }) => r.role);
        return {
          user_id: l.user_id,
          email: perfil?.email ?? null,
          full_name: perfil?.full_name ?? null,
          role: papelMaisForte(dele),
          modulos: l.modulos,
          client_ids: (atribuicoes ?? [])
            .filter((a: { user_id: string }) => a.user_id === l.user_id)
            .map((a: { client_id: string }) => a.client_id),
        };
      });
      return json({ members });
    }

    if (action === "invite") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const fullName = String(body.full_name ?? "").trim();
      const role = String(body.role ?? "");
      if (!EMAIL_RE.test(email)) return json({ error: "E-mail inválido" }, 400);
      if (!PAPEIS_ATRIBUIVEIS.includes(role)) return json({ error: "Papel inválido" }, 400);
      const modulos = validarModulos(body.modulos);
      if (modulos === "invalido") return json({ error: "Módulos inválidos" }, 400);
      const clientIds = await validarClientes(companyId, body.client_ids ?? []);
      if (clientIds === "invalido") return json({ error: "Algum cliente não é desta empresa" }, 400);

      const existentes = await db(`profiles?email=eq.${encodeURIComponent(email)}&select=id`);
      let userId: string | undefined = existentes?.[0]?.id;
      let linkDeAcesso: string | null = null;

      if (userId) {
        const empresas = await companyIdsOf(userId);
        if (empresas.includes(companyId)) return json({ error: "Essa pessoa já está na equipe" }, 409);
        if (empresas.length > 0) return json({ error: "Esse e-mail já pertence a outra empresa" }, 409);
        if ((await papelDe(userId)) === "owner") return json({ error: "Esse e-mail é do dono da plataforma" }, 409);
      } else {
        // Link em vez de e-mail: o SMTP padrao do Supabase so entrega para
        // quem e da organizacao do projeto, entao o convite por e-mail nao
        // chegaria. O ADM manda o link por onde preferir.
        const { supabaseUrl, svcKey } = env();
        const redirectTo = typeof body.redirect_to === "string" ? body.redirect_to : undefined;
        const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
          method: "POST",
          headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "invite",
            email,
            data: fullName ? { full_name: fullName } : undefined,
            redirect_to: redirectTo,
          }),
        });
        const gerado = await res.json().catch(() => null);
        if (!res.ok) {
          return json({ error: `Não consegui criar o convite: ${gerado?.msg ?? gerado?.message ?? res.status}` }, 502);
        }
        userId = gerado?.id ?? gerado?.user?.id;
        linkDeAcesso = gerado?.action_link ?? gerado?.properties?.action_link ?? null;
        if (!userId) return json({ error: "O Supabase não devolveu o usuário criado" }, 502);
      }

      await definirPapel(userId, role);
      await db("user_companies", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ user_id: userId, company_id: companyId, modulos }),
      });
      await definirClientes(companyId, userId, clientIds);

      return json({ success: true, user_id: userId, link: linkDeAcesso, conta_existente: !linkDeAcesso });
    }

    if (action === "update" || action === "remove") {
      const userId = body.user_id;
      if (!isUuid(userId)) return json({ error: "user_id inválido" }, 400);
      if (userId === caller.id) return json({ error: "Você não pode alterar o próprio acesso" }, 400);
      if (!(await vinculo(companyId, userId))) return json({ error: "Essa pessoa não é da sua equipe" }, 404);
      if ((await papelDe(userId)) === "owner") return json({ error: "O dono da plataforma não é alterado por aqui" }, 403);

      if (action === "remove") {
        await definirClientes(companyId, userId, []);
        await db(`user_companies?company_id=eq.${companyId}&user_id=eq.${userId}`, { method: "DELETE" });
        // Sem empresa a pessoa ja nao ve nada; viewer tira o resto do papel antigo.
        await definirPapel(userId, "viewer");
        return json({ success: true });
      }

      if ("role" in body) {
        if (!PAPEIS_ATRIBUIVEIS.includes(String(body.role))) return json({ error: "Papel inválido" }, 400);
        await definirPapel(userId, String(body.role));
      }
      if ("modulos" in body) {
        const modulos = validarModulos(body.modulos);
        if (modulos === "invalido") return json({ error: "Módulos inválidos" }, 400);
        await db(`user_companies?company_id=eq.${companyId}&user_id=eq.${userId}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ modulos }),
        });
      }
      if ("client_ids" in body) {
        const clientIds = await validarClientes(companyId, body.client_ids);
        if (clientIds === "invalido") return json({ error: "Algum cliente não é desta empresa" }, 400);
        await definirClientes(companyId, userId, clientIds);
      }
      return json({ success: true });
    }

    return json({ error: "Ação desconhecida" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro inesperado" }, 500);
  }
});
