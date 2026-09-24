// Triagem dos grupos de WhatsApp dos clientes: quem esta esperando resposta.
//
// Roda de duas formas: pelo cron (sem corpo, varre todos os grupos vinculados)
// ou sob demanda a partir da tela (`{ clientId }`, um grupo so).
//
// Nao usa IA. Tudo aqui e contagem sobre o fluxo de mensagens — quem falou por
// ultimo, ha quanto tempo, quantas vezes o cliente repetiu. Por ser de graca,
// roda de 15 em 15 minutos: para "esperando ha 3h", um quarto de hora de atraso
// e melhor do que um resumo bonito uma vez por dia.
//
// O que isso deliberadamente NAO faz e dizer o que foi pedido com outras
// palavras. A pergunta do cliente aparece com as palavras dele, ou nao aparece.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/whatsapp.ts";

const FUSO = "-03:00"; // America/Sao_Paulo, sem horario de verao desde 2019
const PARALELO = 6;

// Palavras que costumam marcar cliente incomodado. Lista curta de proposito:
// cada termo a mais e uma chance a mais de acender luz onde nao ha fogo.
const SINAIS: Array<{ termo: string; padrao: RegExp }> = [
  { termo: "cancelar", padrao: /\bcancel(ar|amento|a)\b/i },
  { termo: "cadê", padrao: /\bcad[eê]\b/i },
  { termo: "ainda não", padrao: /\bainda n[aã]o\b/i },
  { termo: "urgente", padrao: /\burgente\b/i },
  { termo: "sem retorno", padrao: /\bsem retorno\b/i },
  { termo: "não funciona", padrao: /\bn[aã]o (est[aá] )?funcion/i },
  { termo: "absurdo", padrao: /\babsurdo\b/i },
];

interface ClienteComGrupo {
  id: string;
  name: string;
  whatsapp_group_jid: string;
}

interface Mensagem {
  quando: string;
  quem: string;
  texto: string;
  daAgencia: boolean;
}

// Erro do PostgREST volta como objeto, nao como lista. Sem esta checagem o
// `.map` estoura la na frente com "is not a function" e a mensagem real —
// coluna errada, filtro invalido — se perde.
async function dbGet<T>(url: string, key: string, path: string): Promise<T[]> {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  });
  const corpo = await res.json();
  if (!res.ok || !Array.isArray(corpo)) {
    throw new Error(`GET ${path.split("?")[0]} falhou (${res.status}): ${JSON.stringify(corpo).slice(0, 300)}`);
  }
  return corpo as T[];
}

async function dbUpsert(url: string, key: string, table: string, body: object, onConflict: string) {
  const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`upsert ${table} falhou (${res.status}): ${await res.text()}`);
}

/** Dia de hoje em Sao Paulo, no formato YYYY-MM-DD. */
function hojeEmSaoPaulo(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function inicioDoDia(dia: string): number {
  return new Date(`${dia}T00:00:00${FUSO}`).getTime();
}

function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

// Gente da agencia que assina com a marca no nome do WhatsApp mas nao esta em
// `managers` — editor de video, designer. Sem isso a fala deles conta como fala
// de cliente e o grupo aparece "esperando resposta" sem estar.
const NOME_DA_AGENCIA = /market\s*pro/i;

/**
 * Quem, nesta mensagem, e a agencia.
 *
 * O telefone esta em `sender_pn`; `sender` traz o LID (`...@lid`), um id interno
 * do WhatsApp que nunca casa com numero cadastrado. Ler o campo errado fazia
 * TODO grupo parecer sem resposta — 27 de 27 na primeira rodada.
 */
interface MensagemBruta {
  fromMe?: boolean;
  sender?: string;
  sender_pn?: string;
  senderName?: string;
  text?: string;
  messageType?: string;
  messageTimestamp?: number | string;
}

function ehDaAgencia(m: MensagemBruta, numerosAgencia: Set<string>): boolean {
  if (m.fromMe) return true;
  const telefone = soDigitos(m.sender_pn ?? m.sender);
  if (telefone && numerosAgencia.has(telefone)) return true;
  return NOME_DA_AGENCIA.test((m.senderName ?? "").toString());
}

async function lerMensagens(chatid: string, desde: number): Promise<MensagemBruta[]> {
  const baseUrl = Deno.env.get("UAZAPI_URL");
  const token = Deno.env.get("UAZAPI_TOKEN");
  if (!baseUrl || !token) throw new Error("UAZAPI_URL / UAZAPI_TOKEN nao configurados");

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/message/find`, {
    method: "POST",
    headers: { token, "Content-Type": "application/json" },
    body: JSON.stringify({ chatid, limit: 400, messageTimestamp: { gte: desde } }),
  });
  if (!res.ok) throw new Error(`uazapi /message/find respondeu ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.messages) ? data.messages : [];
}

// "Ok", "obrigado", figurinha, coracao. Sao fechamentos de conversa, nao
// pedidos — e eram a maioria dos falsos "esperando ha 24h" na primeira rodada:
// VALE DAS MUDAS aparecia urgente porque a ultima fala do cliente foi "Pode sim".
const CORTESIAS = /^(ok(ay)?|blz|beleza|certo|isso|isso mesm[oa]|pode ser|pode sim|perfeito|show|top|otimo|ótimo|legal|valeu|vlw|obrigad[oa]|obg|de nada|bom dia|boa tarde|boa noite|sim|nao|não|uhum|ata|ah ta|ah tá|entendi|combinado|fechado|ta bom|tá bom|tudo bem|amem|amém)[\s!.…]*$/i;

/**
 * A mensagem pede alguma coisa, ou so fecha a conversa?
 *
 * Erro para o lado de considerar pedido: deixar de avisar custa cliente, avisar
 * demais custa atencao. Mas cortesia pura e figurinha nao passam — foi por elas
 * que a primeira rodada acusou grupo tranquilo como urgente.
 */
function pedeAlgo(texto: string): boolean {
  const limpo = texto.trim();
  if (!limpo) return false;
  if (limpo.startsWith("(enviou sticker")) return false;
  // So emoji e pontuacao: nenhuma letra nem numero no meio.
  if (!/[\p{L}\p{N}]/u.test(limpo)) return false;
  if (CORTESIAS.test(limpo)) return false;
  return true;
}

interface Triagem {
  esperando: Mensagem[];
  horasSemResposta: number | null;
  perguntasAbertas: Array<{ quem: string; texto: string; quando: string }>;
  sinais: string[];
  atencao: "ok" | "atencao" | "urgente";
}

/**
 * O que ficou em aberto, olhando so para o fim da conversa.
 *
 * "Em aberto" e a sequencia de mensagens do cliente depois da ultima fala da
 * agencia. Se a agencia falou por ultimo, nao ha nada em aberto — e a definicao
 * mais simples que ainda e verdade, e por ser simples ela nao erra sozinha.
 *
 * A espera conta da PRIMEIRA dessas mensagens, nao da ultima: quem escreveu as
 * 9h, 11h e 14h esta esperando desde as 9h, e e esse numero que diz o tamanho do
 * problema.
 */
function triar(todas: Mensagem[]): Triagem {
  const vazio: Triagem = {
    esperando: [], horasSemResposta: null, perguntasAbertas: [], sinais: [], atencao: "ok",
  };
  if (todas.length === 0) return vazio;

  const ultimaAgencia = todas.map(m => m.daAgencia).lastIndexOf(true);
  const naoRespondidas = todas.slice(ultimaAgencia + 1).filter(m => !m.daAgencia);

  // Se o cliente so agradeceu depois da ultima resposta, nao ha nada em aberto.
  const esperando = naoRespondidas.filter(m => pedeAlgo(m.texto));
  if (esperando.length === 0) return vazio;

  const desde = new Date(esperando[0].quando).getTime();
  const horas = Math.round(((Date.now() - desde) / 3600000) * 10) / 10;

  const perguntasAbertas = esperando
    .filter(m => m.texto.includes("?"))
    .map(m => ({ quem: m.quem, texto: m.texto.slice(0, 300), quando: m.quando }));

  const juntas = esperando.map(m => m.texto).join(" ");
  const sinais = SINAIS.filter(s => s.padrao.test(juntas)).map(s => s.termo);

  // Urgente e sinal de irritacao, cobranca repetida ou espera longa. Os tres sao
  // verificaveis; nenhum depende de interpretar o humor de ninguem.
  const atencao: Triagem["atencao"] =
    sinais.length > 0 || esperando.length >= 3 || horas >= 12 ? "urgente" : "atencao";

  return { esperando, horasSemResposta: horas, perguntasAbertas, sinais, atencao };
}

/** Roda `tarefas` com no maximo `limite` em voo ao mesmo tempo. */
async function emLotes<T>(tarefas: (() => Promise<T>)[], limite: number): Promise<T[]> {
  const resultados: T[] = [];
  for (let i = 0; i < tarefas.length; i += limite) {
    resultados.push(...await Promise.all(tarefas.slice(i, i + limite).map(t => t())));
  }
  return resultados;
}

/**
 * Deixa passar o cron (segredo proprio) ou uma sessao de usuario de verdade.
 *
 * `verify_jwt` sozinho nao basta: a anon key E um JWT valido e viaja no bundle
 * do site. Sem esta checagem qualquer um dispara varreduras na instancia de
 * WhatsApp da agencia.
 */
async function autorizado(req: Request): Promise<boolean> {
  const segredo = Deno.env.get("CRON_SECRET");
  if (segredo && req.headers.get("x-cron-secret") === segredo) return true;

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!token || token === anon) return false;

  const url = Deno.env.get("SUPABASE_URL");
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon ?? "", Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!await autorizado(req)) {
    return new Response(JSON.stringify({ error: "Nao autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SVC_ROLE_KEY")!;
  const startedAt = new Date().toISOString();
  let runSuccess = true;
  let runSummary: Record<string, unknown> = {};
  let runError: string | null = null;

  try {
    if (!supabaseUrl || !svcKey) throw new Error("SUPABASE_URL / SVC_ROLE_KEY nao configurados");

    const corpo = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const dia: string = corpo.dia ?? hojeEmSaoPaulo();
    // Olha 2 dias para tras: cobranca de sexta que ninguem respondeu ainda esta
    // em aberto na segunda, e um recorte de 24h a esconderia.
    const desde = inicioDoDia(dia) - 2 * 24 * 3600 * 1000;

    const filtroCliente = corpo.clientId ? `&id=eq.${corpo.clientId}` : "&status=eq.active";
    const clientes = await dbGet<ClienteComGrupo>(
      supabaseUrl, svcKey,
      `clients?whatsapp_group_jid=not.is.null${filtroCliente}&select=id,name,whatsapp_group_jid`
    );

    // Numero de gestor define quem e agencia. O `fromMe` sozinho nao resolve: o
    // gestor fala do celular dele, nao da instancia conectada.
    const gestores = await dbGet<{ whatsapp_number: string }>(
      supabaseUrl, svcKey, `managers?whatsapp_number=not.is.null&select=whatsapp_number`
    );
    const numerosAgencia = new Set(gestores.map(g => soDigitos(g.whatsapp_number)).filter(Boolean));

    const erros: string[] = [];
    // Quem aparece falando sem ser reconhecido como agencia. Se um nome da
    // equipe estiver aqui, falta cadastra-lo em `managers`.
    const vozes = new Map<string, number>();
    let analisados = 0;
    let esperandoResposta = 0;
    let semMovimento = 0;

    const tarefas = clientes.map((cliente) => async () => {
      try {
        const brutas = await lerMensagens(cliente.whatsapp_group_jid, desde);

        const todas: Mensagem[] = brutas
          .map((m) => {
            const ts = Number(m.messageTimestamp) || 0;
            const ms = ts > 1e11 ? ts : ts * 1000; // a uazapi mistura s e ms
            const texto = (m.text ?? "").toString().trim();
            const tipo = (m.messageType ?? "").toString();
            return {
              quando: new Date(ms).toISOString(),
              quem: (m.senderName ?? "sem nome").toString(),
              texto: texto || `(enviou ${tipo.replace("Message", "").toLowerCase() || "um anexo"})`,
              daAgencia: ehDaAgencia(m, numerosAgencia),
            };
          })
          // Reacao nao e fala: contar um polegar como cobranca seria ruido.
          .filter(m => !m.texto.startsWith("(enviou reaction"))
          .sort((a, b) => a.quando.localeCompare(b.quando));

        for (const m of todas) {
          if (!m.daAgencia) vozes.set(m.quem, (vozes.get(m.quem) ?? 0) + 1);
        }

        if (todas.length === 0) { semMovimento++; return; }

        const t = triar(todas);
        const ultima = todas[todas.length - 1];
        const comecoDoDia = new Date(inicioDoDia(dia)).toISOString();
        const doDia = todas.filter(m => m.quando >= comecoDoDia);

        await dbUpsert(supabaseUrl, svcKey, "grupo_resumos", {
          client_id: cliente.id,
          group_jid: cliente.whatsapp_group_jid,
          dia,
          mensagens: doDia.length,
          participantes: new Set(doDia.map(m => m.quem)).size,
          ultima_mensagem: ultima.texto.slice(0, 500),
          ultima_de: ultima.quem,
          ultima_em: ultima.quando,
          ultima_da_agencia: ultima.daAgencia,
          cobrancas: t.esperando.length,
          perguntas_abertas: t.perguntasAbertas,
          sinais: t.sinais,
          horas_sem_resposta: t.horasSemResposta,
          atencao: t.atencao,
          gerado_em: new Date().toISOString(),
        }, "client_id,dia");

        analisados++;
        if (t.horasSemResposta !== null) esperandoResposta++;
      } catch (err) {
        // Um grupo que falha nao pode levar a rodada junto, mas tem que aparecer
        // no log: triagem que nunca chega e pior calada do que com erro visivel.
        erros.push(`${cliente.name}: ${(err as Error).message}`);
      }
    });

    await emLotes(tarefas, PARALELO);

    const naoReconhecidos = [...vozes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([nome, n]) => `${nome} (${n})`);

    runSummary = { dia, grupos: clientes.length, analisados, esperandoResposta, semMovimento, naoReconhecidos, erros };
    return new Response(JSON.stringify({ success: true, ...runSummary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    runSuccess = false;
    runError = (err as Error).message;
    return new Response(JSON.stringify({ error: runError }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    fetch(`${supabaseUrl}/rest/v1/automation_runs`, {
      method: "POST",
      headers: {
        apikey: svcKey,
        Authorization: `Bearer ${svcKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        job_name: "resumir-grupos",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        success: runSuccess,
        summary: runSummary,
        error: runError,
      }),
    }).catch(() => {});
  }
});
