import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, sendText } from "../_shared/whatsapp.ts";
import { getUser, hasAnyRole, isServiceRole, jsonResponse } from "../_shared/auth.ts";
import { db, numeroParaEnvio } from "../_shared/wa-crm.ts";
import {
  type Aviso, type ChaveAutomacao, type DadosOperacao,
  HORA_FIM, HORA_INICIO, avisosDevidos, configDe, textoWhatsapp,
} from "../_shared/automacoes.ts";

// Central de Automacoes: roda a cada 15 min pelo pg_cron (x-cron-secret) ou
// quando o ADM clica em "Rodar agora" (so a empresa dele).
//
// As regras moram em _shared/automacoes.ts. Aqui: buscar o estado de cada
// empresa, gravar o aviso em automacao_execucoes (a unique barra repeticao),
// e so o que entrou de verdade vira sino e WhatsApp.

const ORCAMENTO_MS = 100_000;

function json(body: unknown, status = 200) {
  return jsonResponse(corsHeaders, body, status);
}

function agoraEmSaoPaulo() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const p = (t: string) => partes.find(x => x.type === t)?.value ?? "00";
  return { hoje: `${p("year")}-${p("month")}-${p("day")}`, minuto: (Number(p("hour")) % 24) * 60 + Number(p("minute")) };
}

function emLotes<T>(lista: T[], tamanho = 150): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

async function todos<T>(path: string): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += 1000) {
    const pagina = await db<T[]>(path, { headers: { Range: `${de}-${de + 999}`, "Range-Unit": "items" } });
    linhas.push(...pagina);
    if (pagina.length < 1000) return linhas;
  }
}

async function dadosDaEmpresa(companyId: string, hoje: string, minuto: number): Promise<{ dados: DadosOperacao; whatsapp: Map<string, string> }> {
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const doisDiasAtras = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const [tarefas, clientes, membros] = await Promise.all([
    todos<any>(
      `tasks?company_id=eq.${companyId}&or=(status.neq.concluida,concluida_at.gte.${doisDiasAtras})` +
        `&select=id,titulo,status,categoria,prazo,prazo_hora,assigned_to,created_by,client_id,updated_at,concluida_at,created_at,aguardando_cliente,onboarding_fase&order=id`
    ),
    todos<any>(`clients?company_id=eq.${companyId}&status=neq.archived&select=id,name,status,created_at,alvo_resultados_mes,alvo_custo_resultado&order=id`),
    db<any[]>(`user_companies?company_id=eq.${companyId}&select=user_id,whatsapp`),
  ]);

  const ids = membros.map(m => m.user_id);
  const clienteIds = clientes.map(c => c.id);
  const [perfis, papeis, carteira, faseResponsaveis, metricas] = ids.length
    ? await Promise.all([
        db<any[]>(`profiles?id=in.(${ids.join(",")})&select=id,full_name,email`),
        db<any[]>(`user_roles?user_id=in.(${ids.join(",")})&select=user_id,role`),
        db<any[]>(`client_assignments?company_id=eq.${companyId}&select=client_id,user_id`),
        clienteIds.length
          ? Promise.all(emLotes(clienteIds).map(l => db<any[]>(`client_fase_responsaveis?client_id=in.(${l.join(",")})&select=client_id,fase`))).then(r => r.flat())
          : Promise.resolve([]),
        clienteIds.length
          ? Promise.all(emLotes(clienteIds).map(l => todos<any>(
              `campaign_daily_metrics?client_id=in.(${l.join(",")})&date=gte.${inicioMes}&select=client_id,date,spend,messages,calls,directions,leads&order=date`
            ))).then(r => r.flat())
          : Promise.resolve([]),
      ])
    : [[], [], [], [], []];

  const admins = new Set(papeis.filter(p => p.role === "admin").map(p => p.user_id));
  const pessoas = perfis.map(p => ({ id: p.id, nome: p.full_name || p.email || "Equipe", admin: admins.has(p.id) }));
  const ativos = new Set(ids);

  return {
    dados: {
      hoje,
      minuto,
      agoraMs: Date.now(),
      tarefas,
      clientes,
      pessoas,
      // Quem saiu da empresa nao recebe aviso da carteira antiga.
      carteira: carteira.filter(a => ativos.has(a.user_id)),
      metricas,
      faseResponsaveis,
    },
    whatsapp: new Map(membros.filter(m => m.whatsapp).map(m => [m.user_id, m.whatsapp])),
  };
}

async function aplicarOnboarding(acao: NonNullable<Aviso["acao"]>) {
  if (acao.responsaveis.length) {
    await db("client_fase_responsaveis?on_conflict=client_id,fase", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(acao.responsaveis),
    });
  }
  for (const p of acao.prazos) {
    await db(`tasks?id=eq.${p.task_id}&prazo=is.null`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ prazo: p.prazo }),
    });
  }
}

async function processarEmpresa(companyId: string, siteUrl: string) {
  const { hoje, minuto } = agoraEmSaoPaulo();
  const hora = Math.floor(minuto / 60);
  const dentroDoHorario = hora >= HORA_INICIO && hora < HORA_FIM;

  const linhas = await db<any[]>(`automacoes?company_id=eq.${companyId}&select=chave,ativa,whatsapp,config`);
  const cfg = (chave: ChaveAutomacao) => configDe(linhas, chave);
  const { dados, whatsapp } = await dadosDaEmpresa(companyId, hoje, minuto);

  // Fora do horario so a acao de onboarding anda; aviso espera a janela abrir
  // em vez de acordar alguem de madrugada.
  const devidos = avisosDevidos(dados, cfg).filter(a => dentroDoHorario || a.acao);
  if (!devidos.length) return { empresa: companyId, avisos: 0 };

  const novos: any[] = [];
  for (const lote of emLotes(devidos, 200)) {
    const inseridos = await db<any[]>("automacao_execucoes?on_conflict=company_id,chave,ref,user_id&select=id,chave,ref,user_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(lote.map(a => ({
        company_id: companyId,
        chave: a.chave,
        ref: a.ref,
        user_id: a.user_id,
        titulo: a.titulo,
        corpo: a.corpo,
        link: a.link,
        acao: a.acao ?? null,
        status: a.exigeAprovacao ? "aguardando_aprovacao" : "feito",
      }))),
    });
    novos.push(...inseridos);
  }

  const chaveDe = (x: { chave: string; ref: string; user_id: string | null }) => `${x.chave}|${x.ref}|${x.user_id ?? ""}`;
  const entrou = new Set(novos.map(chaveDe));
  const idPor = new Map(novos.map(n => [chaveDe(n), n.id]));
  const aEnviar = devidos.filter(a => entrou.has(chaveDe(a)));

  const erros: string[] = [];
  for (const a of aEnviar) {
    if (a.acao && !a.exigeAprovacao) {
      await aplicarOnboarding(a.acao).catch(err => erros.push(`onboarding: ${(err as Error).message}`));
    }
  }

  const doSino = aEnviar.filter(a => a.user_id);
  for (const lote of emLotes(doSino, 200)) {
    await db("notifications", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(lote.map(a => ({ user_id: a.user_id, type: "automacao", title: a.titulo, body: a.corpo, link: a.link }))),
    }).catch(err => erros.push(`sino: ${(err as Error).message}`));
  }

  let enviados = 0;
  for (const a of doSino.filter(x => x.whatsapp)) {
    const numero = numeroParaEnvio(whatsapp.get(a.user_id!));
    let canal: string;
    if (!numero) canal = "sem_numero";
    else {
      try {
        await sendText(numero, textoWhatsapp(a, siteUrl));
        canal = "enviado";
        enviados += 1;
      } catch (err) {
        canal = "erro";
        erros.push(`whatsapp: ${(err as Error).message}`);
      }
    }
    await db(`automacao_execucoes?id=eq.${idPor.get(chaveDe(a))}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ canal_whatsapp: canal }),
    }).catch(() => null);
  }

  return { empresa: companyId, avisos: aEnviar.length, whatsapp: enviados, erros };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const segredo = Deno.env.get("CRON_SECRET");
  const doCron = (!!segredo && req.headers.get("x-cron-secret") === segredo) || isServiceRole(req);
  let empresas: string[];
  if (doCron) {
    empresas = (await db<any[]>("companies?select=id")).map(c => c.id);
  } else {
    const user = await getUser(req);
    if (!user || !(await hasAnyRole(user.id, ["admin", "owner"]))) return json({ error: "Só o ADM roda as automações" }, 403);
    empresas = (await db<any[]>(`user_companies?user_id=eq.${user.id}&select=company_id`)).map(c => c.company_id);
  }

  const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://ad-campaign-hub-one.vercel.app";
  const inicio = new Date();
  const resultados = [];
  let erro: string | null = null;
  try {
    for (const e of empresas) {
      if (Date.now() - inicio.getTime() > ORCAMENTO_MS) break;
      resultados.push(await processarEmpresa(e, siteUrl).catch(err => ({ empresa: e, erro: (err as Error).message })));
    }
  } catch (err) {
    erro = (err as Error).message;
  }

  await db("automation_runs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      job_name: "automacoes-operacao",
      started_at: inicio.toISOString(),
      finished_at: new Date().toISOString(),
      success: !erro && resultados.every((r: any) => !r.erro),
      summary: { resultados, manual: !doCron },
      error: erro,
    }),
  }).catch(() => null);

  return json({ ok: !erro, resultados, error: erro }, erro ? 500 : 200);
});
