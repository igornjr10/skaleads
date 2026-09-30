import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tabelas cujo tenant_id referencia auth.users com ON DELETE CASCADE: somem junto
// com o usuario. Listadas aqui so para avisar o owner antes de confirmar.
const CASCADE_TABLES = ["reports", "report_templates", "report_schedules", "alerts", "notifications"] as const;

// Referencias de autoria que nao devem impedir a exclusao.
const AUTHOR_REFS: [string, string][] = [
  ["alerts", "created_by"],
  ["whatsapp_scheduled_messages", "created_by"],
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
  if (!supabaseUrl || !svcKey) return json({ error: "SUPABASE_URL / SVC_ROLE_KEY nao configurados" }, 500);

  const svcHeaders = {
    apikey: svcKey,
    Authorization: `Bearer ${svcKey}`,
    "Content-Type": "application/json",
  };

  function db(path: string, init: RequestInit = {}) {
    return fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...svcHeaders, ...(init.headers ?? {}) } });
  }

  // Content-Range vem como "0-0/12" (ou "*/12" quando nao ha linhas).
  async function count(table: string, filter: string): Promise<number> {
    const res = await db(`${table}?${filter}&select=id&limit=1`, { headers: { Prefer: "count=exact" } });
    if (!res.ok) return 0;
    const total = res.headers.get("content-range")?.split("/")[1];
    return total && total !== "*" ? Number(total) : 0;
  }

  try {
    // 1. Quem esta chamando? O JWT do usuario chega no Authorization.
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: svcKey, Authorization: authHeader },
    });
    const caller = await callerRes.json().catch(() => null);
    if (!callerRes.ok || !caller?.id) return json({ error: "Sessao invalida" }, 401);

    // 2. So owner remove membros. Erro de leitura nao pode virar "voce nao e owner":
    // sao problemas diferentes e o segundo manda o owner cacar o proprio papel a toa.
    const rolesRes = await db(`user_roles?user_id=eq.${caller.id}&select=role`);
    const rolesBody = await rolesRes.text();
    if (!rolesRes.ok) {
      return json({ error: `Nao consegui ler user_roles (HTTP ${rolesRes.status}): ${rolesBody.slice(0, 300)}` }, 500);
    }
    const callerRoles = JSON.parse(rolesBody || "[]");
    if (!Array.isArray(callerRoles)) {
      return json({ error: `Resposta inesperada de user_roles: ${rolesBody.slice(0, 300)}` }, 500);
    }
    if (!callerRoles.some((r: { role: string }) => r.role === "owner")) {
      const found = callerRoles.map((r: { role: string }) => r.role).join(", ") || "nenhum";
      return json({ error: `Apenas owners podem excluir usuarios (papeis vistos para ${caller.email}: ${found})` }, 403);
    }

    const { user_id: targetId, dry_run: dryRun } = await req.json().catch(() => ({}));
    if (!targetId) return json({ error: "Informe user_id" }, 400);
    // Vai interpolado nas URLs do PostgREST
    if (!/^[0-9a-f-]{36}$/i.test(String(targetId))) return json({ error: "user_id invalido" }, 400);
    if (targetId === caller.id) return json({ error: "Voce nao pode excluir a si mesmo" }, 400);

    const [target] = await db(`profiles?id=eq.${targetId}&select=id,email,full_name&limit=1`).then((r) => r.json());
    if (!target) return json({ error: "Usuario nao encontrado" }, 404);

    // 3. Nunca deixar a plataforma sem owner.
    const targetRoles = await db(`user_roles?user_id=eq.${targetId}&select=role`).then((r) => r.json());
    const targetIsOwner = Array.isArray(targetRoles) && targetRoles.some((r: { role: string }) => r.role === "owner");
    if (targetIsOwner && (await count("user_roles", "role=eq.owner")) <= 1) {
      return json({ error: "Este e o unico owner da plataforma" }, 400);
    }

    // 4. O que a cascata vai levar junto.
    const impact: Record<string, number> = {};
    for (const table of CASCADE_TABLES) {
      const column = table === "notifications" ? "user_id" : "tenant_id";
      impact[table] = await count(table, `${column}=eq.${targetId}`);
    }

    if (dryRun) return json({ user: target, impact });

    // 5. Autoria nao pode barrar a exclusao. Redundante com a migration
    // 20260818000000, mas as migrations aqui sao aplicadas a mao.
    for (const [table, column] of AUTHOR_REFS) {
      await db(`${table}?${column}=eq.${targetId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ [column]: null }),
      }).catch(() => undefined);
    }

    // 6. profiles e user_roles saem por cascata do proprio auth.users.
    const deleteRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${targetId}`, {
      method: "DELETE",
      headers: svcHeaders,
    });
    if (!deleteRes.ok) {
      const detail = await deleteRes.text();
      return json({ error: `Falha ao excluir no auth do Supabase: ${detail.slice(0, 500)}` }, 502);
    }

    return json({ success: true, user: target, impact });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro inesperado" }, 500);
  }
});
