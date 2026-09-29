import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { atualizar, chaveTelefone, db, inserir } from "../_shared/wa-crm.ts";

// Recebe os eventos da uazapi (configurados por whatsapp-instance-admin,
// action "webhook"). Nao ha JWT: quem chama e o servidor da uazapi, e o que
// prova a origem e o `token` da instancia que vem no corpo de todo evento.
//
// Responde 200 mesmo quando ignora o evento: erro faz a uazapi reenviar, e
// grupo, canal ou numero sem cara de telefone nunca vao virar conversa.

const IGNORAR_CHAT = /@(g\.us|newsletter|broadcast)$/;

let empresaEmCache: string | null = null;

async function empresaDoNumero(): Promise<string | null> {
  if (empresaEmCache) return empresaEmCache;
  const rows = await db<{ value: string }[]>("app_config?key=eq.whatsapp_company_id&select=value");
  empresaEmCache = rows?.[0]?.value ?? null;
  return empresaEmCache;
}

function textoDa(m: any): string {
  if (typeof m.text === "string" && m.text.trim()) return m.text;
  const c = m.content;
  if (typeof c === "string" && c.trim() && !c.trim().startsWith("{")) return c;
  if (c && typeof c === "object") {
    const t = c.text ?? c.caption ?? c.conversation;
    if (typeof t === "string" && t.trim()) return t;
  }
  return `[${m.messageType ?? m.type ?? "mensagem"}]`;
}

function quando(ts: unknown): string {
  const n = Number(ts);
  if (!n) return new Date().toISOString();
  // A doc diz milissegundos; se vier em segundos, o ano sairia 1970.
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
}

async function registrarMensagem(body: any) {
  const m = body.message;
  if (!m || m.isGroup) return "ignorada: sem mensagem ou grupo";

  const chatid: string = m.chatid ?? body.chat?.wa_chatid ?? "";
  if (IGNORAR_CHAT.test(chatid)) return "ignorada: grupo/canal";
  // Chat por LID (id anonimo) nao tem o numero no id: usa o que vier resolvido.
  const origemNumero = chatid.endsWith("@lid")
    ? (m.sender_pn ?? body.chat?.phone ?? "")
    : chatid || m.sender_pn || body.chat?.phone || "";
  const chave = chaveTelefone(String(origemNumero).split("@")[0]);
  if (!chave) return "ignorada: sem telefone";

  const companyId = await empresaDoNumero();
  if (!companyId) throw new Error("app_config.whatsapp_company_id nao configurado");

  const [lead] = await db<any[]>(
    `crm_leads?company_id=eq.${companyId}&wa_chave=eq.${chave}&select=id,responsavel_id,closer_id,contato_nome,empresa&order=created_at.desc&limit=1`
  );
  const entrada = !m.fromMe;

  const gravadas = await inserir<any[]>("wa_mensagens?on_conflict=messageid", {
    company_id: companyId,
    lead_id: lead?.id ?? null,
    chave,
    chatid: chatid || null,
    telefone: String(origemNumero).split("@")[0] || null,
    nome_contato: entrada ? (body.chat?.wa_contactName || body.chat?.wa_name || m.senderName || null) : null,
    messageid: m.messageid ?? m.id ?? null,
    direcao: entrada ? "entrada" : "saida",
    tipo: m.messageType ?? null,
    texto: textoDa(m),
    origem: entrada ? "contato" : "celular",
    status: m.status ?? null,
    enviada_em: quando(m.messageTimestamp),
  }).catch(async (err) => {
    // Reenvio da uazapi: a mensagem ja esta gravada, nada a fazer.
    if (String(err).includes("23505")) return [];
    throw err;
  });
  if (!gravadas?.length || !entrada || !lead) return "gravada";

  // Lead respondeu: a cadencia que manda parar na resposta para aqui.
  const inscricoes = await db<any[]>(
    `wa_inscricoes?lead_id=eq.${lead.id}&status=eq.ativa&select=id,wa_sequencias(parar_se_responder)`
  );
  const parar = inscricoes.filter(i => i.wa_sequencias?.parar_se_responder !== false).map(i => i.id);
  if (parar.length) {
    const lista = parar.join(",");
    await atualizar(`wa_inscricoes?id=in.(${lista})`, { status: "respondeu" });
    await atualizar(`wa_fila?inscricao_id=in.(${lista})&status=eq.pendente`, { status: "cancelado", erro: "Lead respondeu" });
  }

  // Um aviso por rajada: se ja havia mensagem dele sem ler na ultima meia hora,
  // o sino ja tocou.
  const meiaHora = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const recentes = await db<any[]>(
    `wa_mensagens?chave=eq.${chave}&company_id=eq.${companyId}&direcao=eq.entrada&lida_em=is.null&enviada_em=gte.${meiaHora}&select=id&limit=2`
  );
  const destino = lead.responsavel_id ?? lead.closer_id;
  if (destino && recentes.length <= 1) {
    await inserir("notifications", {
      user_id: destino,
      type: "whatsapp",
      title: `WhatsApp de ${lead.empresa || lead.contato_nome}`,
      body: textoDa(m).slice(0, 140),
    }, false);
  }
  return "gravada e avisada";
}

async function atualizarStatus(body: any) {
  // O formato do messages_update nao e documentado campo a campo: aceita a
  // mensagem inteira (message.messageid + status) ou a lista de ids do evento.
  const m = body.message ?? {};
  const ev = body.event ?? {};
  const status = String(m.status ?? ev.Type ?? ev.type ?? body.state ?? "").toLowerCase();
  const ids: string[] = [m.messageid, m.id, ...(Array.isArray(ev.MessageIDs) ? ev.MessageIDs : [])].filter(Boolean);
  if (!status || !ids.length) return "ignorada: sem id/status";
  await atualizar(`wa_mensagens?messageid=in.(${ids.map(i => `"${i}"`).join(",")})`, { status });
  return `status ${status}`;
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");

  const body = await req.json().catch(() => null);
  const esperado = Deno.env.get("UAZAPI_TOKEN");
  if (!body || !esperado || body.token !== esperado) {
    return new Response(JSON.stringify({ error: "token invalido" }), { status: 401 });
  }

  try {
    const tipo = body.EventType;
    const resultado =
      tipo === "messages" ? await registrarMensagem(body)
      : tipo === "messages_update" ? await atualizarStatus(body)
      : `ignorado: ${tipo}`;
    return new Response(JSON.stringify({ ok: true, resultado }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    // Sem o corpo no log: ele carrega o token da instancia.
    console.error("wa-webhook", body?.EventType, (err as Error).message);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 500 });
  }
});
