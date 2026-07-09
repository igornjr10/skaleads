import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface ReportSchedule {
  id: string;
  client_id: string;
  cron: string;
  last_run_at: string | null;
  is_active: boolean;
}

function dbGet(supabaseUrl: string, svcKey: string, path: string) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}`, "Content-Type": "application/json" },
  }).then(r => r.json());
}

function dbPatch(supabaseUrl: string, svcKey: string, path: string, body: object) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
}

function dbInsert(supabaseUrl: string, svcKey: string, table: string, body: object) {
  return fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
}

// Casa um campo de cron ("*", "5", "1,15", "*/3") contra um valor atual.
function fieldMatches(field: string, value: number): boolean {
  return field.split(",").some(part => {
    if (part === "*") return true;
    if (part.startsWith("*/")) {
      const step = parseInt(part.slice(2));
      return step > 0 && value % step === 0;
    }
    return parseInt(part) === value;
  });
}

interface NowParts {
  dateStr: string;
  hour: number;
  dayOfMonth: number;
  month: number;
  dayOfWeek: number;
}

function nowInSaoPaulo(): NowParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
    weekday: "short",
  }).formatToParts(new Date());

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    hour: parseInt(get("hour")),
    dayOfMonth: parseInt(get("day")),
    month: parseInt(get("month")),
    dayOfWeek: weekdayMap[get("weekday")] ?? 0,
  };
}

// Esse job roda 1x/hora (no minuto 0), então o campo de minuto do cron é
// ignorado na comparação — só importa hora/dia/mês/dia-da-semana.
function isDueThisHour(cron: string, now: NowParts): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [, hour, dayOfMonth, month, dayOfWeek] = parts;
  return fieldMatches(hour, now.hour)
    && fieldMatches(dayOfMonth, now.dayOfMonth)
    && fieldMatches(month, now.month)
    && fieldMatches(dayOfWeek, now.dayOfWeek);
}

serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const startedAt = new Date().toISOString();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
  let runSuccess = true;
  let runSummary: Record<string, unknown> = {};
  let runError: string | null = null;

  try {
    if (!supabaseUrl || !svcKey) throw new Error("SUPABASE_URL / SVC_ROLE_KEY não configurados");

    const now = nowInSaoPaulo();

    const schedules: ReportSchedule[] = await dbGet(
      supabaseUrl, svcKey,
      `report_schedules?is_active=eq.true&select=id,client_id,cron,last_run_at,is_active`
    );

    if (!Array.isArray(schedules)) {
      throw new Error(`Erro ao consultar report_schedules: ${JSON.stringify(schedules)}`);
    }

    let sentCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const results: { scheduleId: string; ok: boolean; skipped?: boolean; error?: string }[] = [];

    for (const schedule of schedules) {
      try {
        if (schedule.last_run_at && schedule.last_run_at.slice(0, 10) === now.dateStr) continue;
        if (!isDueThisHour(schedule.cron, now)) continue;

        const [report] = await dbGet(
          supabaseUrl, svcKey,
          `reports?client_id=eq.${schedule.client_id}&status=eq.ready&pdf_base64=not.is.null&select=id,name,period,pdf_base64&order=created_at.desc&limit=1`
        );

        if (!report) {
          skippedCount++;
          results.push({ scheduleId: schedule.id, ok: false, skipped: true, error: "Nenhum relatório pronto gerado ainda" });
          continue;
        }

        const [client] = await dbGet(
          supabaseUrl, svcKey,
          `clients?id=eq.${schedule.client_id}&select=name`
        );
        const periodLabel = (report.period as { label?: string } | null)?.label ?? "";
        const caption = `📊 *Relatório de Performance*\n👤 *${client?.name ?? ""}*\n📅 _${periodLabel}_`;

        const response = await fetch(`${supabaseUrl}/functions/v1/send-report-whatsapp`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${svcKey}`,
            apikey: svcKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: schedule.client_id,
            file_name: `${report.name}.pdf`,
            media_base64: report.pdf_base64,
            caption,
          }),
        });
        const result = await response.json();

        await dbPatch(supabaseUrl, svcKey, `report_schedules?id=eq.${schedule.id}`, { last_run_at: new Date().toISOString() });

        if (!response.ok || result.error) {
          errorCount++;
          results.push({ scheduleId: schedule.id, ok: false, error: result.error ?? "Erro desconhecido" });
        } else {
          sentCount++;
          results.push({ scheduleId: schedule.id, ok: true });
        }
      } catch (err) {
        errorCount++;
        results.push({ scheduleId: schedule.id, ok: false, error: (err as Error).message });
      }
    }

    runSummary = { checked: schedules.length, sent: sentCount, failed: errorCount, skipped: skippedCount };
    return new Response(
      JSON.stringify({ success: true, checked: schedules.length, sent: sentCount, failed: errorCount, skipped: skippedCount, results }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    runSuccess = false;
    runError = (err as Error).message;
    return new Response(JSON.stringify({ error: runError }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    dbInsert(supabaseUrl, svcKey, "automation_runs", {
      job_name: "run-report-schedules",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      success: runSuccess,
      summary: runSummary,
      error: runError,
    }).catch(() => {});
  }
});
