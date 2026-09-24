import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sendText } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface ScheduledMessage {
  id: string;
  name: string;
  message: string;
  target_group_jids: string[];
  send_time: string;
  is_active: boolean;
  last_sent_date: string | null;
}

function dbGet(supabaseUrl: string, svcKey: string, path: string) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      "Content-Type": "application/json",
    },
  }).then(r => r.json());
}

function dbPatch(supabaseUrl: string, svcKey: string, path: string, body: object) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
}

function dbInsert(supabaseUrl: string, svcKey: string, table: string, body: object) {
  return fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
}

function todayInSaoPaulo(): { dateStr: string; minutesOfDay: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "00";
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  const minutesOfDay = parseInt(get("hour")) * 60 + parseInt(get("minute"));
  return { dateStr, minutesOfDay };
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

interface SendResult {
  jid: string;
  ok: boolean;
  status: number | null;
  error: string | null;
}

async function sendToGroups(jids: string[], text: string): Promise<SendResult[]> {
  const results: SendResult[] = [];

  for (const jid of jids) {
    try {
      // A checagem de `key.id` saiu junto com a Evolution: ela devolvia 200 sem
      // enfileirar e so o message id denunciava. A uazapi erra com status != 2xx
      // e corpo {error:true}, que o helper compartilhado ja transforma em throw.
      await sendText(jid, text);
      results.push({ jid, ok: true, status: 200, error: null });
    } catch (err) {
      results.push({ jid, ok: false, status: null, error: (err as Error).message });
    }
  }

  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = new Date().toISOString();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
  let isTest = false;
  let runSuccess = true;
  let runSummary: Record<string, unknown> = {};
  let runError: string | null = null;

  try {
    if (!supabaseUrl || !svcKey) {
      throw new Error("Variáveis de ambiente não configuradas");
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const testId = body?.test_id as string | undefined;
    isTest = !!testId;

    // ── Chamada de cron (sem test_id): exige o segredo do pg_cron ──────────────
    if (!testId) {
      const cronSecret = Deno.env.get("CRON_SECRET");
      if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
        runSuccess = false;
        runError = "Unauthorized";
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Modo teste: envia imediatamente uma mensagem específica, sem checar horário/data ──
    if (testId) {
      const [scheduled]: ScheduledMessage[] = await dbGet(
        supabaseUrl, svcKey,
        `whatsapp_scheduled_messages?id=eq.${testId}&select=*&limit=1`
      );
      if (!scheduled) throw new Error("Mensagem agendada não encontrada");

      if (!scheduled.target_group_jids || scheduled.target_group_jids.length === 0) {
        throw new Error("Este agendamento não tem nenhum grupo de destino selecionado");
      }

      const results = await sendToGroups(
        scheduled.target_group_jids, scheduled.message
      );
      const failed = results.filter(r => !r.ok);

      if (failed.length === results.length) {
        throw new Error(`uazapi recusou todos os envios — ${failed[0].jid}: ${failed[0].error}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          tested: scheduled.name,
          groups: results.length,
          sent: results.length - failed.length,
          failed: failed.length,
          results,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Modo cron: avalia todas as mensagens ativas ────────────────────────────
    const { dateStr, minutesOfDay } = todayInSaoPaulo();

    const scheduled: ScheduledMessage[] = await dbGet(
      supabaseUrl, svcKey,
      `whatsapp_scheduled_messages?is_active=eq.true&select=*`
    );

    if (!Array.isArray(scheduled)) {
      throw new Error(`Erro ao consultar whatsapp_scheduled_messages: ${JSON.stringify(scheduled)}`);
    }

    let sentCount = 0;
    const failures: { name: string; jid: string; error: string | null }[] = [];

    for (const item of (scheduled || [])) {
      try {
        if (item.last_sent_date === dateStr) continue;
        if (timeToMinutes(item.send_time) > minutesOfDay) continue;
        if (!item.target_group_jids || item.target_group_jids.length === 0) continue;

        const results = await sendToGroups(
          item.target_group_jids, item.message
        );
        const delivered = results.filter(r => r.ok).length;

        for (const r of results.filter(r => !r.ok)) {
          failures.push({ name: item.name, jid: r.jid, error: r.error });
        }

        // Só marca o dia como enviado se algo saiu — senão o cron tenta de novo em 15min
        if (delivered > 0) {
          await dbPatch(supabaseUrl, svcKey, `whatsapp_scheduled_messages?id=eq.${item.id}`, { last_sent_date: dateStr });
          sentCount++;
        }
      } catch (err) {
        failures.push({ name: item.name, jid: "-", error: (err as Error).message });
      }
    }

    runSuccess = failures.length === 0;
    runSummary = { checked: (scheduled || []).length, sent: sentCount, failures };
    if (failures.length > 0) {
      runError = `${failures.length} envio(s) falharam — ex: ${failures[0].jid}: ${failures[0].error}`;
    }

    return new Response(
      JSON.stringify({ success: true, checked: (scheduled || []).length, sent: sentCount, failures }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    runSuccess = false;
    runError = (err as Error).message;
    return new Response(JSON.stringify({ error: runError }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    if (!isTest) {
      dbInsert(supabaseUrl, svcKey, "automation_runs", {
        job_name: "send-scheduled-whatsapp",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        success: runSuccess,
        summary: runSummary,
        error: runError,
      }).catch(() => {});
    }
  }
});
